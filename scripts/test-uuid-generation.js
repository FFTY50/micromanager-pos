require('dotenv').config();
const { makeTxnMachine } = require('../src/state/txnMachine');
const { requestJson } = require('../src/http/client');

// Configuration
const N8N_LINES_URL = process.env.N8N_LINES_URL;
const N8N_TXNS_URL = process.env.N8N_TXNS_URL;

console.log('Configuration:');
console.log('N8N_LINES_URL:', N8N_LINES_URL || '(not set)');
console.log('N8N_TXNS_URL:', N8N_TXNS_URL || '(not set)');

if (!N8N_LINES_URL && !N8N_TXNS_URL) {
  console.warn('⚠️  WARNING: No n8n URLs configured in .env. Requests will only be logged to console.');
}

// Mock dependencies
const mockQueue = {
  push: async (topic, url, payload) => {
    console.log(`[QUEUE] Topic: ${topic}, URL: ${url}`);
    // console.log(JSON.stringify(payload, null, 2));

    if (url && url.startsWith('http')) {
      try {
        await requestJson(url, {
          method: 'POST',
          body: payload,
          headers: { 'content-type': 'application/json' }
        });
        console.log('  ✅ Sent to n8n');
      } catch (err) {
        console.error('  ❌ Failed to send:', err.message);
      }
    }
  },
  depth: () => 0
};

const mockLogger = {
  info: (msg, meta) => console.log(`[INFO] ${msg}`, meta || ''),
  warn: (msg, meta) => console.log(`[WARN] ${msg}`, meta || ''),
  error: (msg, meta) => console.log(`[ERROR] ${msg}`, meta || '')
};

// Re-implement a simplified version of the index.js logic for testing
let currentTxn = null;

function onStart(nowMs, txnId) {
  console.log(`\n--- Transaction Started (UUID: ${txnId}) ---`);
  currentTxn = {
    startedAt: new Date(nowMs).toISOString(),
    txnId,
    lines: [],
    meta: { transaction_number: null }
  };
}

function onLine({ nowMs, pos, c, txnId }) {
  if (!currentTxn) onStart(nowMs, txnId);

  if (c.type === 'end_header') {
    currentTxn.meta.transaction_number = c.txn;
  }

  const line = {
    micromanager_id: 'test-device-001',
    device_name: 'TestDevice',
    device_timestamp: new Date(nowMs).toISOString(),
    line_type: c.type,
    description: c.desc || c.cashier || c.line,
    qty: c.qty !== undefined ? c.qty : (c.type === 'item' ? 1 : null),
    amount: c.amount !== undefined ? c.amount : null,
    raw_line: c.line,
    parsed_successfully: c.type !== 'unknown',
    transaction_position: pos,
    transaction_number: currentTxn.meta.transaction_number || null,
    transaction_uuid: txnId,
    pos_metadata: {
      pos_type: 'verifone_commander',
      terminal_id: 'test-term-01',
      store_id: 'test-store-01'
    }
  };

  currentTxn.lines.push(line);

  if (N8N_LINES_URL) {
    mockQueue.push('transaction_line', N8N_LINES_URL, line);
  } else {
    console.log('[Mock Send Line]', JSON.stringify(line));
  }
}

function onEnd({ nowMs, meta, txnId }) {
  console.log(`\n--- Transaction Ended (UUID: ${txnId}) ---`);

  const endedAt = new Date(nowMs).toISOString();
  const items = currentTxn.lines.filter((line) => line.line_type === 'item');
  const totalLine = [...currentTxn.lines.filter((line) => line.line_type === 'total')].pop();

  const txnPayload = {
    micromanager_id: 'test-device-001',
    device_name: 'TestDevice',
    terminal_id: 'test-term-01',
    transaction_number: meta.transaction_number,
    transaction_uuid: txnId,
    total_amount: totalLine ? totalLine.amount : null,
    item_count: items.length,
    line_count: currentTxn.lines.length,
    transaction_started_at: currentTxn.startedAt,
    transaction_completed_at: endedAt,
    pos_metadata: {
      store_id: 'test-store-01'
    }
  };

  if (N8N_TXNS_URL) {
    mockQueue.push('transactions', N8N_TXNS_URL, txnPayload);
  } else {
    console.log('[Mock Send Txn]', JSON.stringify(txnPayload, null, 2));
  }
  currentTxn = null;
}

const machine = makeTxnMachine({ onStart, onLine, onEnd, onParseError: console.error });

// Test Data
const transaction1 = [
  '\x1bc0\x01\x1b!\x0007/23/25 10:15:01 102 L  Item 1   1        3.49 \x0a',
  '\x1bc0\x01\x1b!\x0007/23/25 10:15:15 102 ST#1                   DR#1 TRAN#1001\x1bc0\x01\x1b!\x0007/23/25 10:15:15 102 CSH: CORPORATE         07/23/25 10:15:15\x0a'
];

const transaction2 = [
  '\x1bc0\x01\x1b!\x0007/23/25 10:20:01 102 L  Item 2   1        5.00 \x0a',
  '\x1bc0\x01\x1b!\x0007/23/25 10:20:15 102 ST#1                   DR#1 TRAN#1002\x1bc0\x01\x1b!\x0007/23/25 10:20:15 102 CSH: CORPORATE         07/23/25 10:20:15\x0a'
];

async function runTest() {
  console.log('Feeding Transaction 1...');
  for (const line of transaction1) {
    machine.feed(line, Date.now());
    await new Promise(r => setTimeout(r, 100)); // Slow down to simulate real time
  }

  await new Promise(r => setTimeout(r, 1000));

  console.log('\nFeeding Transaction 2...');
  for (const line of transaction2) {
    machine.feed(line, Date.now());
    await new Promise(r => setTimeout(r, 100));
  }
}

runTest();
