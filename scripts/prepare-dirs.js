#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const defaults = require('../config/defaults.json');

function ensureDir(dirPath) {
  if (!dirPath) return;
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

const queueDir = path.dirname(process.env.QUEUE_DB_PATH || defaults.queue.dbPath);
ensureDir(queueDir);

const logDir = path.join(process.cwd(), 'logs');
ensureDir(logDir);

console.log(`Ensured directories: queue => ${queueDir}, logs => ${logDir}`);
