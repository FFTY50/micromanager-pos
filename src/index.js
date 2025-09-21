const os = require('os');
const SerialPortModule = require('serialport');
const logger = require('./utils/Logger');
const defaults = require('../config/defaults.json');
const { createQueue } = require('./queue/sqliteQueue');
const { makeTxnMachine } = require('./state/txnMachine');
const { autoDetectSerialPort } = require('./serial/autoDetect');
const { requestJson } = require('./http/client');
const { makeFrigateClient } = require('./http/frigate');
const { createMetricsRegistry } = require('./server/metrics');
const { startHealthServer } = require('./server/health');

const SerialPort = SerialPortModule.SerialPort || SerialPortModule;

const N8N_LINES_URL = process.env.N8N_LINES_URL || null;
const N8N_TXNS_URL = process.env.N8N_TXNS_URL || null;
const MICROMANAGER_ID = process.env.MICROMANAGER_ID || process.env.DEVICE_ID || os.hostname();
const DEVICE_NAME = process.env.DEVICE_NAME || os.hostname();
const TERMINAL_ID = (process.env.TERMINAL_ID || process.env.HOST_ETH0_MAC || process.env.HOST_WLAN0_MAC || process.env.HOST_WLAN_MAC || 'unknown').toLowerCase();
const STORE_ID_ENV = process.env.STORE_ID || null;
const DRAWER_ID_ENV = process.env.DRAWER_ID || null;

const SERIAL_BAUD = Number(process.env.SERIAL_BAUD || defaults.serial.baud || 9600);
const SERIAL_PORT_ENV = process.env.SERIAL_PORT || null;
const POST_LINES_AS_BATCH = (process.env.POST_LINES_AS_BATCH || String(defaults.postLinesAsBatch)) !== 'false';

const FRIGATE_BASE = process.env.FRIGATE_BASE || defaults.frigate.baseUrl;
const FRIGATE_ENABLED = (process.env.FRIGATE_ENABLED || '').toLowerCase() !== 'false' && Boolean(FRIGATE_BASE);
const FRIGATE_CAMERA_NAME = process.env.FRIGATE_CAMERA_NAME || process.env.FRIGATE_CAMERA || DEVICE_NAME;
const FRIGATE_LABEL = process.env.FRIGATE_LABEL || defaults.frigate.label;
const FRIGATE_DURATION_SECONDS = Number(process.env.FRIGATE_DURATION_SECONDS || defaults.frigate.durationSeconds);
const FRIGATE_REMOTE_ROLE = process.env.FRIGATE_REMOTE_ROLE || defaults.frigate.remoteRoleHeader;
const FRIGATE_RETAIN_ON_COMPLETE = (process.env.FRIGATE_RETAIN_ON_COMPLETE || (defaults.frigate.retainOnComplete ? 'true' : 'false')) === 'true';

const VERSION = defaults.parserVersion;

const metrics = createMetricsRegistry();
metrics.setGauge('micromanager_queue_depth', 0);
metrics.incCounter('micromanager_parse_errors_total', 0);
metrics.incCounter('micromanager_lines_processed_total', 0);

const queue = createQueue({
  dbPath: process.env.QUEUE_DB_PATH || defaults.queue.dbPath,
  maxBytes: Number(process.env.QUEUE_MAX_BYTES || defaults.queue.maxBytes),
  maxAgeSeconds: Number(process.env.QUEUE_MAX_AGE_SECONDS || defaults.queue.maxAgeSeconds),
  trimBatchSize: Number(process.env.QUEUE_TRIM_BATCH || defaults.queue.trimBatchSize),
}, logger);

const frigateClient = makeFrigateClient({
  baseUrl: FRIGATE_BASE,
  enabled: FRIGATE_ENABLED,
  cameraName: FRIGATE_CAMERA_NAME,
  label: FRIGATE_LABEL,
  durationSeconds: FRIGATE_DURATION_SECONDS,
  remoteRoleHeader: FRIGATE_REMOTE_ROLE,
  retainOnComplete: FRIGATE_RETAIN_ON_COMPLETE,
}, logger);

let currentTxn = null;

function applyMetaToLines(txn) {
  if (!txn?.meta) return;
  txn.lines.forEach((line) => {
    if (txn.meta.transaction_number && !line.transaction_number) {
      line.transaction_number = txn.meta.transaction_number;
    }
    if (line.pos_metadata) {
      if (txn.meta.drawer_id) line.pos_metadata.drawer_id = txn.meta.drawer_id;
      if (txn.meta.store_id) line.pos_metadata.store_id = txn.meta.store_id;
    }
  });
}

function applyFrigateToLines(txn) {
  if (!txn?.frigateEvent) return;
  const url = txn.frigateEvent.eventUrl || null;
  txn.lines.forEach((line) => {
    line.frigate_url = url;
  });
}

async function finalizeTransaction(txn, nowMs) {
  if (!txn) return;
  try {
    if (txn.eventPromise) {
      try {
        const event = await txn.eventPromise;
        if (event) {
          txn.frigateEvent = event;
          applyFrigateToLines(txn);
        }
      } catch (err) {
        logger.warn('frigate: event creation failed', { error: err.message });
      }
    }

    applyMetaToLines(txn);

    const endedAt = new Date(nowMs).toISOString();
    const items = txn.lines.filter((line) => line.line_type === 'item');
    const totalLine = [...txn.lines.filter((line) => line.line_type === 'total')].pop();
    const tenderTotals = {};
    txn.lines.forEach((line) => {
      if (line.line_type === 'cash' || line.line_type === 'debit' || line.line_type === 'credit' || line.line_type === 'preauth') {
        const key = line.line_type;
        const existing = tenderTotals[key] || 0;
        tenderTotals[key] = existing + (typeof line.amount === 'number' ? line.amount : 0);
      }
    });

    const txnPayload = {
      micromanager_id: MICROMANAGER_ID,
      device_name: DEVICE_NAME,
      terminal_id: txn.meta?.terminal_id || TERMINAL_ID,
      pos_type: defaults.posType || null,
      transaction_number: txn.meta?.transaction_number || null,
      total_amount: totalLine ? totalLine.amount : null,
      item_count: items.length,
      line_count: txn.lines.length,
      cash_amount: typeof tenderTotals.cash === 'number' ? tenderTotals.cash : null,
      credit_amount: typeof tenderTotals.credit === 'number' ? tenderTotals.credit : null,
      debit_amount: typeof tenderTotals.debit === 'number' ? tenderTotals.debit : null,
      preauth_amount: typeof tenderTotals.preauth === 'number' ? tenderTotals.preauth : null,
      transaction_started_at: txn.startedAt,
      transaction_completed_at: endedAt,
      frigate_event_id: txn.frigateEvent?.eventId || null,
      pos_metadata: {
        parser_version: VERSION,
        drawer_id: txn.meta?.drawer_id || DRAWER_ID_ENV || null,
        store_id: txn.meta?.store_id || STORE_ID_ENV || null,
      },
    };

    const linePayloads = txn.lines.map((line) => ({
      ...line,
      pos_metadata: { ...line.pos_metadata },
    }));

    if (POST_LINES_AS_BATCH && N8N_LINES_URL) {
      queue.push('transaction_lines', N8N_LINES_URL, { lines: linePayloads }, { 'content-type': 'application/json' });
    } else if (N8N_LINES_URL) {
      linePayloads.forEach((line) => {
        queue.push('transaction_line', N8N_LINES_URL, line, { 'content-type': 'application/json' });
      });
    }

    if (N8N_TXNS_URL) {
      queue.push('transactions', N8N_TXNS_URL, txnPayload, { 'content-type': 'application/json' });
    }

    if (txn.frigateEvent?.eventId) {
      const subLabel = txn.meta?.transaction_number ? `Txn ${txn.meta.transaction_number}` : undefined;
      const descriptionParts = [];
      if (txn.meta?.transaction_number) descriptionParts.push(`Txn ${txn.meta.transaction_number}`);
      if (typeof txnPayload.total_amount === 'number') descriptionParts.push(`Total: ${txnPayload.total_amount.toFixed(2)}`);
      descriptionParts.push(`Items: ${txnPayload.item_count}`);
      const description = descriptionParts.join(' | ');
      frigateClient
        .annotateEvent(txn.frigateEvent.eventId, {
          subLabel,
          description,
          retain: FRIGATE_RETAIN_ON_COMPLETE,
        })
        .finally(() => {
          frigateClient.endEvent(txn.frigateEvent.eventId);
        });
    }

    metrics.setGauge('micromanager_queue_depth', queue.depth());
  } catch (err) {
    logger.error('failed to finalize transaction', { error: err.message });
  }
}

const machine = makeTxnMachine({
  onStart(nowMs) {
    const startedAt = new Date(nowMs).toISOString();
    currentTxn = {
      startedAt,
      lines: [],
      meta: { terminal_id: TERMINAL_ID, drawer_id: DRAWER_ID_ENV || null, store_id: STORE_ID_ENV || null },
      eventPromise: null,
      frigateEvent: null,
    };
    logger.info('transaction started', { started_at: startedAt });
    if (FRIGATE_ENABLED) {
      currentTxn.eventPromise = frigateClient.startEvent({
        cameraName: FRIGATE_CAMERA_NAME,
        label: FRIGATE_LABEL,
        durationSeconds: FRIGATE_DURATION_SECONDS,
      }).then((event) => {
        if (event) {
          currentTxn.frigateEvent = event;
          applyFrigateToLines(currentTxn);
        }
        return event;
      });
    }
  },
  onLine({ nowMs, pos, c }) {
    if (!currentTxn) {
      currentTxn = {
        startedAt: new Date(nowMs).toISOString(),
        lines: [],
        meta: { terminal_id: TERMINAL_ID, drawer_id: DRAWER_ID_ENV || null, store_id: STORE_ID_ENV || null },
        eventPromise: null,
        frigateEvent: null,
      };
    }

    if (c.type === 'end_header') {
      currentTxn.meta = {
        ...currentTxn.meta,
        store_id: c.store || currentTxn.meta.store_id || STORE_ID_ENV || null,
        drawer_id: c.drawer || currentTxn.meta.drawer_id || DRAWER_ID_ENV || null,
        transaction_number: c.txn || currentTxn.meta.transaction_number || null,
      };
      applyMetaToLines(currentTxn);
    } else if (c.type === 'cashier') {
      currentTxn.meta.cashier = c.cashier;
    }

    const deviceTimestamp = new Date(nowMs).toISOString();
    const line = {
      micromanager_id: MICROMANAGER_ID,
      device_name: DEVICE_NAME,
      device_timestamp: deviceTimestamp,
      line_type: c.type,
      description: c.desc || c.cashier || c.line,
      qty: c.qty !== undefined ? c.qty : (c.type === 'item' ? 1 : null),
      amount: c.amount !== undefined ? c.amount : null,
      raw_line: c.line,
      parsed_successfully: c.type !== 'unknown',
      transaction_position: pos,
      transaction_number: currentTxn.meta.transaction_number || null,
      pos_metadata: {
        pos_type: defaults.posType,
        parser_version: VERSION,
        terminal_id: TERMINAL_ID,
        drawer_id: currentTxn.meta.drawer_id || DRAWER_ID_ENV || null,
        store_id: currentTxn.meta.store_id || STORE_ID_ENV || null,
      },
      frigate_url: currentTxn.frigateEvent?.eventUrl || null,
    };

    currentTxn.lines.push(line);
    metrics.incCounter('micromanager_lines_processed_total', 1);
    if (c.type === 'unknown') {
      metrics.incCounter('micromanager_parse_errors_total', 1);
    }
  },
  onEnd({ nowMs, meta }) {
    const txn = currentTxn;
    if (txn) {
      txn.meta = { ...txn.meta, ...meta, terminal_id: TERMINAL_ID };
      applyMetaToLines(txn);
      const endNow = nowMs;
      finalizeTransaction(txn, endNow);
    }
    currentTxn = null;
  },
  onParseError({ raw }) {
    logger.warn('parser: unclassified line', { line: raw });
  },
});

async function startSerialLoop() {
  const explicit = SERIAL_PORT_ENV;
  const portPath = await autoDetectSerialPort({
    explicit,
    paths: defaults.serial.paths,
    prefix: defaults.serial.autoDetectPrefix,
  }, logger);

  if (!portPath) {
    logger.warn('serial: no port detected, retrying in 5s');
    setTimeout(startSerialLoop, 5000);
    return;
  }

  let buffer = '';
  let reconnectTimer = null;

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      startSerialLoop();
    }, 5000);
  }

  try {
    const port = new SerialPort({ path: portPath, baudRate: SERIAL_BAUD, autoOpen: true });
    logger.info('serial: opening port', { port: portPath, baud: SERIAL_BAUD });

    port.on('open', () => {
      logger.info('serial: port opened', { port: portPath });
    });

    port.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop();
      parts.forEach((line) => {
        if (line === '') return;
        machine.feed(line, Date.now());
      });
    });

    port.on('close', () => {
      logger.warn('serial: port closed', { port: portPath });
      scheduleReconnect();
    });

    port.on('error', (err) => {
      logger.error('serial: error', { port: portPath, error: err.message });
      scheduleReconnect();
    });
  } catch (err) {
    logger.error('serial: failed to open port', { port: portPath, error: err.message });
    scheduleReconnect();
  }
}

async function processQueue() {
  const job = queue.due();
  if (!job) {
    setTimeout(processQueue, 300);
    return;
  }

  try {
    const headers = { 'content-type': 'application/json', ...JSON.parse(job.headers || '{}') };
    const start = Date.now();
    await requestJson(job.url, { method: 'POST', body: job.body, headers });
    const latency = Date.now() - start;
    metrics.observeHistogram('micromanager_post_latency_ms', latency);
    queue.mark(job.id, true);
    metrics.setGauge('micromanager_queue_depth', queue.depth());
    logger.info('queue: job delivered', { id: job.id, topic: job.topic, latency });
    setImmediate(processQueue);
  } catch (err) {
    logger.warn('queue: job delivery failed', { id: job.id, error: err.message });
    queue.mark(job.id, false);
    setTimeout(processQueue, 1000);
  }
}

function bootstrap() {
  startSerialLoop();
  processQueue();
  setInterval(() => queue.enforceLimits(), 60 * 1000).unref();

  startHealthServer({
    queue,
    metrics,
    version: VERSION,
    port: Number(process.env.HEALTH_PORT || defaults.server.port),
    host: process.env.HEALTH_HOST || defaults.server.host,
  }, logger);
}

if (require.main === module) {
  bootstrap();
}

module.exports = {
  queue,
  metrics,
  machine,
  finalizeTransaction,
  startSerialLoop,
  bootstrap,
};
