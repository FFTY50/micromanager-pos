// Test setup file
require('dotenv').config({ path: '.env.test' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce noise in tests
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_KEY = 'test-key';
process.env.DEVICE_ID = 'test-device';
process.env.SERIAL_PORT = '/dev/null';

// Global test utilities
global.mockTransaction = {
  id: 'test-transaction-id',
  deviceId: 'test-device',
  totalAmount: 25.99,
  startTime: new Date(),
  lines: []
};

global.mockParsedData = {
  description: 'TEST ITEM',
  amount: 5.00,
  extractedFields: { test: 'value' },
  parsingSuccess: true,
  matchedPatterns: ['lineItem'],
  parsingSuccess: true
};

// Global test timeouts
jest.setTimeout(5000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Uncomment to disable specific log levels in tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
