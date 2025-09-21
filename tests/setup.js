const path = require('path');

require('dotenv').config({ path: '.env.test' });

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.SERIAL_PORT = '/dev/null';
process.env.N8N_LINES_URL = 'https://example.com/lines';
process.env.N8N_TXNS_URL = 'https://example.com/transactions';
process.env.FRIGATE_ENABLED = 'false';
process.env.MICROMANAGER_ID = 'test-micromanager';
process.env.DEVICE_NAME = 'test-device';
process.env.TERMINAL_ID = '00:11:22:33:44:55';
process.env.STORE_ID = 'AB123';
process.env.DRAWER_ID = '1';
process.env.QUEUE_DB_PATH = path.join(__dirname, '..', 'test-logs', 'queue-test.db');

jest.setTimeout(5000);

global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn()
};
