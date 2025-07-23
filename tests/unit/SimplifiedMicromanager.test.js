const SimplifiedMicromanager = require('../../src/SimplifiedMicromanager');
const fs = require('fs-extra');
const fetch = require('node-fetch');

// Mock dependencies
jest.mock('fs-extra');
jest.mock('node-fetch');
jest.mock('serialport');
jest.mock('@serialport/parser-readline');

describe('SimplifiedMicromanager', () => {
  let mockConfig;
  let micromanager;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConfig = {
      deviceId: 'mmd-rv1-ddeeff',
      deviceName: 'Test POS',
      posType: 'verifone_commander',
      n8nWebhookUrl: 'https://test.n8n.com/webhook',
      serialPort: '/dev/ttyUSB0',
      serialBaudRate: 9600,
      retryAttempts: 3,
      retryDelayMs: 1000
    };

    // Mock fs operations
    fs.ensureDir.mockResolvedValue();
    fs.readFile.mockResolvedValue('[]');
    fs.writeFile.mockResolvedValue();
    fs.readdir.mockResolvedValue([]);
    fs.stat.mockResolvedValue({ mtime: new Date() });

    micromanager = new SimplifiedMicromanager(mockConfig);
  });

  describe('constructor', () => {
    test('should initialize with correct configuration', () => {
      expect(micromanager.deviceId).toBe('mmd-rv1-ddeeff');
      expect(micromanager.deviceName).toBe('Test POS');
      expect(micromanager.posType).toBe('verifone_commander');
      expect(micromanager.n8nWebhookUrl).toBe('https://test.n8n.com/webhook');
      expect(micromanager.retryAttempts).toBe(3);
      expect(micromanager.retryDelayMs).toBe(1000);
      expect(micromanager.isOnline).toBe(true);
      expect(micromanager.offlineQueue).toEqual([]);
    });

    test('should use default values for optional config', () => {
      const minimalConfig = {
        deviceId: 'mmd-rv1-test',
        deviceName: 'Minimal POS',
        posType: 'verifone_commander',
        serialPort: '/dev/ttyUSB0',
        serialBaudRate: 9600
      };

      const minimal = new SimplifiedMicromanager(minimalConfig);
      expect(minimal.retryAttempts).toBe(3);
      expect(minimal.retryDelayMs).toBe(1000);
    });
  });

  describe('cleanRawLine', () => {
    test('should clean control characters but preserve structure', () => {
      const rawLine = '\x01\x02Hello World\x03\x04';
      const cleaned = micromanager.cleanRawLine(rawLine);
      expect(cleaned).toBe('Hello World');
    });

    test('should preserve tab and newline characters', () => {
      const rawLine = 'Hello\tWorld\n';
      const cleaned = micromanager.cleanRawLine(rawLine);
      expect(cleaned).toBe('Hello\tWorld');
    });

    test('should return null for empty strings', () => {
      expect(micromanager.cleanRawLine('')).toBeNull();
      expect(micromanager.cleanRawLine('   ')).toBeNull();
      expect(micromanager.cleanRawLine('\x01\x02\x03')).toBeNull();
    });

    test('should return null for non-string input', () => {
      expect(micromanager.cleanRawLine(null)).toBeNull();
      expect(micromanager.cleanRawLine(undefined)).toBeNull();
      expect(micromanager.cleanRawLine(123)).toBeNull();
    });

    test('should handle typical POS data', () => {
      const posLine = '\\x1bc0\\x01\\x1b!\\x0007/11/25 03:33:19 102 COCA COLA 1 2.50';
      const cleaned = micromanager.cleanRawLine(posLine);
      expect(cleaned).toBe('\\x1bc0\\x01\\x1b!\\x0007/11/25 03:33:19 102 COCA COLA 1 2.50');
    });
  });

  // Define mockPayload at describe level for shared access
  const mockPayload = {
    micromanager_id: 'mmd-rv1-ddeeff',
    device_name: 'Test POS',
    pos_type: 'verifone_commander',
    raw_line: 'test data',
    timestamp: '2025-01-15T10:30:45.123Z'
  };

  describe('sendToN8nWithRetry', () => {

    test('should send successfully on first attempt', async () => {
      const mockResponse = { ok: true };
      fetch.mockResolvedValue(mockResponse);

      await micromanager.sendToN8nWithRetry(mockPayload);

      expect(fetch).toHaveBeenCalledWith(
        'https://test.n8n.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Device-ID': 'mmd-rv1-ddeeff',
            'X-Device-Name': 'Test POS',
            'X-POS-Type': 'verifone_commander'
          }),
          body: JSON.stringify(mockPayload)
        })
      );

      expect(micromanager.isOnline).toBe(true);
      expect(micromanager.stats.webhooksSent).toBe(1);
    });

    test('should retry on failure and eventually succeed', async () => {
      fetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({ ok: true });

      await micromanager.sendToN8nWithRetry(mockPayload);

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(micromanager.isOnline).toBe(true);
      expect(micromanager.stats.webhooksSent).toBe(1);
    });

    test('should queue payload after all retries fail', async () => {
      fetch.mockRejectedValue(new Error('Network error'));

      await micromanager.sendToN8nWithRetry(mockPayload);

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(micromanager.isOnline).toBe(false);
      expect(micromanager.offlineQueue).toHaveLength(1);
      expect(micromanager.offlineQueue[0]).toEqual(mockPayload);
      expect(micromanager.stats.webhooksFailed).toBe(3); // Failed 3 times (all retries)
    });

    test('should handle HTTP error responses', async () => {
      const mockResponse = { ok: false, status: 500, statusText: 'Internal Server Error' };
      fetch.mockResolvedValue(mockResponse);

      await micromanager.sendToN8nWithRetry(mockPayload);

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(micromanager.isOnline).toBe(false);
      expect(micromanager.offlineQueue).toHaveLength(1);
    });

    test('should skip sending when no webhook URL configured', async () => {
      micromanager.n8nWebhookUrl = '';

      await micromanager.sendToN8nWithRetry(mockPayload);

      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('processOfflineQueue', () => {
    test('should process queued items when connection restored', async () => {
      const payload1 = { ...mockPayload, raw_line: 'data 1' };
      const payload2 = { ...mockPayload, raw_line: 'data 2' };
      
      micromanager.offlineQueue = [payload1, payload2];
      fetch.mockResolvedValue({ ok: true });

      await micromanager.processOfflineQueue();

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(micromanager.offlineQueue).toHaveLength(0);
    });

    test('should handle partial failures during queue processing', async () => {
      const payload1 = { ...mockPayload, raw_line: 'data 1' };
      const payload2 = { ...mockPayload, raw_line: 'data 2' };
      
      micromanager.offlineQueue = [payload1, payload2];
      fetch
        .mockResolvedValueOnce({ ok: true })
        .mockRejectedValue(new Error('Network error'));

      await micromanager.processOfflineQueue();

      expect(fetch).toHaveBeenCalledTimes(5); // 1 success + 3 retries for second item
      expect(micromanager.offlineQueue).toHaveLength(1); // Failed item back in queue
      expect(micromanager.offlineQueue[0]).toEqual(payload2);
    });

    test('should do nothing when queue is empty', async () => {
      micromanager.offlineQueue = [];

      await micromanager.processOfflineQueue();

      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('saveToLocalBackup', () => {
    test('should create new backup file', async () => {
      const testData = { test: 'data' };
      fs.readFile.mockRejectedValue(new Error('File not found'));

      await micromanager.saveToLocalBackup('test_type', testData);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test_type-'),
        expect.stringContaining('"test": "data"')
      );
    });

    test('should append to existing backup file', async () => {
      const existingData = [
        {
          timestamp: '2025-01-15T09:00:00.000Z',
          deviceId: 'mmd-rv1-ddeeff',
          deviceName: 'Test POS',
          data: { existing: 'data' }
        }
      ];
      
      fs.readFile.mockResolvedValue(JSON.stringify(existingData));

      const newData = { new: 'data' };
      await micromanager.saveToLocalBackup('test_type', newData);

      const writeCall = fs.writeFile.mock.calls[0];
      const writtenData = JSON.parse(writeCall[1]);
      
      expect(writtenData).toHaveLength(2);
      expect(writtenData[0].data).toEqual({ existing: 'data' });
      expect(writtenData[1].data).toEqual({ new: 'data' });
    });

    test('should handle backup errors gracefully', async () => {
      fs.writeFile.mockRejectedValue(new Error('Disk full'));

      // Should not throw
      await expect(micromanager.saveToLocalBackup('test_type', {})).resolves.toBeUndefined();
    });
  });

  describe('cleanupOldLogs', () => {
    test('should remove files older than 30 days', async () => {
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      const newDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

      fs.readdir.mockResolvedValue(['old-file.json', 'new-file.json', 'not-json.txt']);
      fs.stat
        .mockResolvedValueOnce({ mtime: oldDate })
        .mockResolvedValueOnce({ mtime: newDate });
      fs.unlink.mockResolvedValue();

      await micromanager.cleanupOldLogs();

      expect(fs.unlink).toHaveBeenCalledTimes(1);
      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('old-file.json'));
    });

    test('should handle cleanup errors gracefully', async () => {
      fs.readdir.mockRejectedValue(new Error('Permission denied'));

      // Should not throw
      await expect(micromanager.cleanupOldLogs()).resolves.toBeUndefined();
    });
  });

  describe('getStatus', () => {
    test('should return comprehensive status information', () => {
      micromanager.stats.linesProcessed = 100;
      micromanager.stats.webhooksSent = 95;
      micromanager.stats.webhooksFailed = 5;
      micromanager.offlineQueue = [{ test: 'data' }];

      const status = micromanager.getStatus();

      expect(status).toMatchObject({
        deviceId: 'mmd-rv1-ddeeff',
        deviceName: 'Test POS',
        posType: 'verifone_commander',
        isOnline: true,
        queueSize: 1,
        n8nWebhookConfigured: true,
        statistics: expect.objectContaining({
          linesProcessed: 100,
          webhooksSent: 95,
          webhooksFailed: 5,
          uptime: expect.any(Number),
          successRate: 0.95
        })
      });
    });

    test('should calculate success rate correctly', () => {
      micromanager.stats.webhooksSent = 80;
      micromanager.stats.webhooksFailed = 20;

      const status = micromanager.getStatus();
      expect(status.statistics.successRate).toBe(0.8);
    });

    test('should handle zero webhooks sent', () => {
      micromanager.stats.webhooksSent = 0;
      micromanager.stats.webhooksFailed = 0;

      const status = micromanager.getStatus();
      expect(status.statistics.successRate).toBe(0);
    });
  });

  describe('handleSerialData', () => {
    test('should process valid serial data', async () => {
      const rawLine = '07/11/25 03:33:19 102 COCA COLA 1 2.50';
      fetch.mockResolvedValue({ ok: true });

      await micromanager.handleSerialData(rawLine);

      expect(micromanager.stats.linesProcessed).toBe(1);
      expect(fetch).toHaveBeenCalledWith(
        'https://test.n8n.com/webhook',
        expect.objectContaining({
          body: expect.stringContaining(rawLine)
        })
      );
    });

    test('should skip empty lines', async () => {
      await micromanager.handleSerialData('');
      await micromanager.handleSerialData('   ');
      await micromanager.handleSerialData('\x01\x02');

      expect(micromanager.stats.linesProcessed).toBe(3);
      expect(fetch).not.toHaveBeenCalled();
    });

    test('should handle processing errors gracefully', async () => {
      const rawLine = 'valid data';
      fetch.mockRejectedValue(new Error('Network error'));

      // Should not throw
      await expect(micromanager.handleSerialData(rawLine)).resolves.toBeUndefined();
      expect(micromanager.stats.linesProcessed).toBe(1);
    });
  });
});
