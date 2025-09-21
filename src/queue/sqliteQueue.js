const fs = require('fs');
const path = require('path');
let Database;
try {
  // eslint-disable-next-line global-require
  Database = require('better-sqlite3');
} catch (err) {
  Database = null;
}

function createMemoryQueue(options = {}, logger = console) {
  const {
    maxBytes = 500 * 1024 * 1024,
    maxAgeSeconds = 7 * 24 * 60 * 60,
  } = options;

  const jobs = [];
  let nextId = 1;

  function approximateSize() {
    return jobs.reduce((total, job) => total + Buffer.byteLength(job.body) + Buffer.byteLength(job.headers || '{}'), 0);
  }

  function prune() {
    const nowSec = Math.floor(Date.now() / 1000);
    if (maxAgeSeconds > 0) {
      for (let i = jobs.length - 1; i >= 0; i -= 1) {
        if (jobs[i].created_at < nowSec - maxAgeSeconds) {
          jobs.splice(i, 1);
        }
      }
    }
    if (maxBytes > 0) {
      while (approximateSize() > maxBytes && jobs.length > 0) {
        jobs.shift();
      }
    }
  }

  function push(topic, url, body, headers = {}) {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const headerStr = JSON.stringify(headers);
    const id = nextId;
    nextId += 1;
    jobs.push({
      id,
      topic,
      url,
      body: payload,
      headers: headerStr,
      tries: 0,
      next_at: nowSec,
      created_at: nowSec,
    });
    prune();
  }

  function due(nowMs = Date.now()) {
    const nowSec = Math.floor(nowMs / 1000);
    const job = jobs.find((j) => j.next_at <= nowSec);
    return job ? { ...job } : null;
  }

  function mark(id, ok) {
    const idx = jobs.findIndex((j) => j.id === id);
    if (idx === -1) return;
    if (ok) {
      jobs.splice(idx, 1);
      return;
    }
    const job = jobs[idx];
    job.tries += 1;
    if (job.tries >= 10) {
      job.next_at = Math.floor(Date.now() / 1000) + 300;
    } else {
      const delay = Math.min(2 ** (job.tries - 1), 60);
      job.next_at = Math.floor(Date.now() / 1000) + delay;
    }
  }

  function depth() {
    return jobs.length;
  }

  logger.warn?.('queue: falling back to in-memory queue (better-sqlite3 unavailable)');

  return { push, due, mark, depth, enforceLimits: prune, options: { maxBytes, maxAgeSeconds }, db: null };
}

function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function createQueue(options = {}, logger = console) {
  const {
    dbPath = '/var/lib/micromanager/queue.db',
    maxBytes = 500 * 1024 * 1024,
    maxAgeSeconds = 7 * 24 * 60 * 60,
    trimBatchSize = 250,
  } = options;

  if (!Database) {
    return createMemoryQueue(options, logger);
  }

  ensureDirectory(dbPath);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY,
      topic TEXT NOT NULL,
      url TEXT NOT NULL,
      body TEXT NOT NULL,
      headers TEXT NOT NULL,
      tries INTEGER NOT NULL DEFAULT 0,
      next_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_next ON jobs(next_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);
  `);

  const insertStmt = db.prepare('INSERT INTO jobs(topic,url,body,headers,next_at,created_at) VALUES(?,?,?,?,?,?)');
  const dueStmt = db.prepare('SELECT * FROM jobs WHERE next_at <= ? ORDER BY id LIMIT 1');
  const deleteStmt = db.prepare('DELETE FROM jobs WHERE id = ?');
  const selectTriesStmt = db.prepare('SELECT tries FROM jobs WHERE id = ?');
  const updateRetryStmt = db.prepare('UPDATE jobs SET tries = ?, next_at = ? WHERE id = ?');
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM jobs');
  const deleteOlderThanStmt = db.prepare('DELETE FROM jobs WHERE created_at < ?');
  const deleteOldestBatchStmt = db.prepare('DELETE FROM jobs WHERE id IN (SELECT id FROM jobs ORDER BY created_at LIMIT ? )');

  function fileSize() {
    try {
      return fs.statSync(dbPath).size;
    } catch (err) {
      logger.warn?.(`queue: unable to read size for ${dbPath} – ${err.message}`);
      return 0;
    }
  }

  function enforceLimits() {
    const nowSec = Math.floor(Date.now() / 1000);
    if (maxAgeSeconds > 0) {
      const cutoff = nowSec - maxAgeSeconds;
      deleteOlderThanStmt.run(cutoff);
    }

    if (maxBytes > 0) {
      let attempts = 0;
      while (fileSize() > maxBytes && attempts < 1000) {
        const info = deleteOldestBatchStmt.run(trimBatchSize);
        if (info.changes === 0) break;
        db.exec('VACUUM');
        attempts += 1;
      }
      if (attempts > 0) {
        logger.warn?.('queue: trimmed old jobs due to size limit', { attempts });
      }
    }
  }

  function push(topic, url, body, headers = {}) {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const headerStr = JSON.stringify(headers);
    const nextAt = nowSec;
    insertStmt.run(topic, url, payload, headerStr, nextAt, nowSec);
    enforceLimits();
  }

  function due(nowMs = Date.now()) {
    const nowSec = Math.floor(nowMs / 1000);
    return dueStmt.get(nowSec) || null;
  }

  function mark(id, ok) {
    if (ok) {
      deleteStmt.run(id);
      enforceLimits();
      return;
    }
    const row = selectTriesStmt.get(id);
    const currentTries = row ? row.tries : 0;
    const nextTries = currentTries + 1;
    let delaySeconds;
    if (nextTries >= 10) {
      delaySeconds = 300;
    } else {
      delaySeconds = Math.min(2 ** (nextTries - 1), 60);
    }
    const nextAt = Math.floor(Date.now() / 1000) + delaySeconds;
    updateRetryStmt.run(nextTries, nextAt, id);
  }

  function depth() {
    return countStmt.get().count;
  }

  return {
    push,
    due,
    mark,
    depth,
    enforceLimits,
    db,
    options: { dbPath, maxBytes, maxAgeSeconds, trimBatchSize },
  };
}

module.exports = { createQueue };
