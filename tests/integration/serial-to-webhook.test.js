const SimplifiedMicromanager = require('../../src/SimplifiedMicromanager');
const DeviceInitializer = require('../../src/utils/DeviceInitializer');
const fs = require('fs-extra');
const path = require('path');
const http = require('http');

// Mock serial port for integration testing
jest.mock('serialport');
jest.mock('@serialport/parser-readline');

describe('Serial to n8n Webhook Integration', () => {
  let micromanager;
  let mockWebhookServer;
  let webhookRequests = [];
  const webhookPort = 3001;
  const webhookUrl = `http://localhost:${webhookPort}/webhook`;

  beforeAll(async () => {
    // Start mock webhook server
    mockWebhookServer = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/webhook') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          webhookRequests.push({
            headers: req.headers,
            body: JSON.parse(body),
            timestamp: new Date().toISOString()
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'received' }));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((resolve) => {
      mockWebhookServer.listen(webhookPort, resolve);
    });
  });

  afterAll(async () => {
    if (mockWebhookServer) {
      await new Promise((resolve) => {
        mockWebhookServer.close(resolve);
      });
    }
  });

  beforeEach(async () => {
    webhookRequests = [];
    
    // Clean up test directories
    const testLogDir = path.join(__dirname, '..', '..', 'test-transaction-logs');
    await fs.remove(testLogDir);
    await fs.ensureDir(testLogDir);

    const mockConfig = {
      deviceId: 'mmd-rv1-test01',
      deviceName: 'Integration Test POS',
      posType: 'verifone_commander',
      n8nWebhookUrl: webhookUrl,
      serialPort: '/dev/null', // Won't actually be used in tests
      serialBaudRate: 9600,
      retryAttempts: 2,
      retryDelayMs: 100
    };

    micromanager = new SimplifiedMicromanager(mockConfig);
    // Override log directory for testing
    micromanager.logDir = testLogDir;
  });

  afterEach(async () => {
    if (micromanager) {
      await micromanager.shutdown();
    }
  });

  describe('End-to-End Data Flow', () => {
    test('should forward serial data to n8n webhook', async () => {
      const testData = '07/11/25 03:33:19 102 COCA COLA 1 2.50';
      
      // Simulate serial data reception
      await micromanager.handleSerialData(testData);

      // Wait for async webhook call
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(webhookRequests).toHaveLength(1);
      
      const request = webhookRequests[0];
      expect(request.headers['x-device-id']).toBe('mmd-rv1-test01');
      expect(request.headers['x-device-name']).toBe('Integration Test POS');
      expect(request.headers['x-pos-type']).toBe('verifone_commander');
      expect(request.body.micromanager_id).toBe('mmd-rv1-test01');
      expect(request.body.raw_line).toBe(testData);
      expect(request.body.pos_type).toBe('verifone_commander');
    });

    test('should maintain local backup during webhook success', async () => {
      const testData = 'BACKUP TEST DATA';
      
      await micromanager.handleSerialData(testData);
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check that local backup was created
      const backupFiles = await fs.readdir(micromanager.logDir);
      const rawDataFile = backupFiles.find(f => f.startsWith('raw_data-'));
      
      expect(rawDataFile).toBeDefined();
      
      const backupContent = await fs.readFile(
        path.join(micromanager.logDir, rawDataFile), 
        'utf8'
      );
      const backupData = JSON.parse(backupContent);
      
      expect(backupData).toHaveLength(1);
      expect(backupData[0].data.raw_line).toBe(testData);
      expect(backupData[0].data.device_status).toBe('online');
    });

    test('should handle multiple rapid serial inputs', async () => {
      const testLines = [
        '07/11/25 03:33:19 102 COCA COLA 1 2.50',
        '07/11/25 03:33:20 103 PEPSI 1 2.25',
        '07/11/25 03:33:21 104 WATER 2 1.00',
        '07/11/25 03:33:22 105 CHIPS 1 3.50'
      ];

      // Send all lines rapidly
      const promises = testLines.map(line => micromanager.handleSerialData(line));
      await Promise.all(promises);
      
      // Wait for all webhook calls
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(webhookRequests).toHaveLength(4);
      expect(micromanager.stats.linesProcessed).toBe(4);
      expect(micromanager.stats.webhooksSent).toBe(4);
      
      // Verify all data was sent correctly
      const sentData = webhookRequests.map(req => req.body.raw_line);
      expect(sentData).toEqual(testLines);
    });
  });

  describe('Network Failure Recovery', () => {
    test('should maintain local backup during network outage', async () => {
      // Stop webhook server to simulate network failure
      await new Promise((resolve) => {
        mockWebhookServer.close(resolve);
      });

      const testData = 'OFFLINE TEST DATA';
      await micromanager.handleSerialData(testData);
      
      // Wait for retry attempts to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(micromanager.isOnline).toBe(false);
      expect(micromanager.offlineQueue).toHaveLength(1);
      expect(micromanager.stats.webhooksFailed).toBe(1);

      // Check local backup was created
      const backupFiles = await fs.readdir(micromanager.logDir);
      const rawDataFile = backupFiles.find(f => f.startsWith('raw_data-'));
      const failedWebhooksFile = backupFiles.find(f => f.startsWith('failed_webhooks-'));
      
      expect(rawDataFile).toBeDefined();
      expect(failedWebhooksFile).toBeDefined();

      // Verify backup content
      const rawBackup = JSON.parse(await fs.readFile(
        path.join(micromanager.logDir, rawDataFile), 'utf8'
      ));
      expect(rawBackup[0].data.raw_line).toBe(testData);
      expect(rawBackup[0].data.device_status).toBe('offline');

      const failedBackup = JSON.parse(await fs.readFile(
        path.join(micromanager.logDir, failedWebhooksFile), 'utf8'
      ));
      expect(failedBackup[0].data.raw_line).toBe(testData);
      expect(failedBackup[0].data.failure_reason).toBeDefined();
    });

    test('should process queued items after reconnection', async () => {
      // Start with server down
      await new Promise((resolve) => {
        mockWebhookServer.close(resolve);
      });

      // Send data while offline
      const offlineData = [
        'OFFLINE DATA 1',
        'OFFLINE DATA 2',
        'OFFLINE DATA 3'
      ];

      for (const data of offlineData) {
        await micromanager.handleSerialData(data);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      
      expect(micromanager.isOnline).toBe(false);
      expect(micromanager.offlineQueue).toHaveLength(3);

      // Restart webhook server
      webhookRequests = [];
      mockWebhookServer = http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/webhook') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', () => {
            webhookRequests.push({
              headers: req.headers,
              body: JSON.parse(body),
              timestamp: new Date().toISOString()
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'received' }));
          });
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      await new Promise((resolve) => {
        mockWebhookServer.listen(webhookPort, resolve);
      });

      // Send new data to trigger reconnection
      await micromanager.handleSerialData('RECONNECT TRIGGER');
      
      // Wait for queue processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(micromanager.isOnline).toBe(true);
      expect(micromanager.offlineQueue).toHaveLength(0);
      expect(webhookRequests).toHaveLength(4); // 3 queued + 1 new

      // Verify all data was eventually sent
      const sentData = webhookRequests.map(req => req.body.raw_line);
      expect(sentData).toEqual([...offlineData, 'RECONNECT TRIGGER']);
    });
  });

  describe('Data Integrity', () => {
    test('should preserve exact raw data without parsing', async () => {
      const complexPosData = [
        '\\x1bc0\\x01\\x1b!\\x0007/11/25 03:33:19 102 COCA COLA 1 2.50',
        'SPECIAL CHARS: àáâãäåæçèéêë',
        'NUMBERS: 1234567890.99',
        'SYMBOLS: !@#$%^&*()_+-=[]{}|;:,.<>?',
        'MIXED: Item#123 $5.99 @3:33PM'
      ];

      for (const data of complexPosData) {
        await micromanager.handleSerialData(data);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(webhookRequests).toHaveLength(5);
      
      // Verify exact data preservation
      for (let i = 0; i < complexPosData.length; i++) {
        expect(webhookRequests[i].body.raw_line).toBe(complexPosData[i]);
      }
    });

    test('should handle control characters appropriately', async () => {
      const controlCharData = '\x01\x02VALID DATA\x03\x04';
      
      await micromanager.handleSerialData(controlCharData);
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(webhookRequests).toHaveLength(1);
      expect(webhookRequests[0].body.raw_line).toBe('VALID DATA');
    });

    test('should skip empty or invalid lines', async () => {
      const invalidInputs = [
        '',
        '   ',
        '\x01\x02\x03',
        null,
        undefined
      ];

      for (const input of invalidInputs) {
        await micromanager.handleSerialData(input);
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(webhookRequests).toHaveLength(0);
      expect(micromanager.stats.linesProcessed).toBe(5); // All were processed
    });
  });

  describe('Performance and Reliability', () => {
    test('should handle high throughput data', async () => {
      const startTime = Date.now();
      const dataCount = 100;
      const promises = [];

      // Generate and send 100 data points rapidly
      for (let i = 0; i < dataCount; i++) {
        const data = `DATA_${i.toString().padStart(3, '0')}_${Date.now()}`;
        promises.push(micromanager.handleSerialData(data));
      }

      await Promise.all(promises);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for all webhooks

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(webhookRequests).toHaveLength(dataCount);
      expect(micromanager.stats.linesProcessed).toBe(dataCount);
      expect(micromanager.stats.webhooksSent).toBe(dataCount);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds

      // Verify data integrity
      const sentNumbers = webhookRequests
        .map(req => req.body.raw_line.match(/DATA_(\d+)_/)[1])
        .map(Number)
        .sort((a, b) => a - b);
      
      const expectedNumbers = Array.from({ length: dataCount }, (_, i) => i);
      expect(sentNumbers).toEqual(expectedNumbers);
    });

    test('should maintain statistics accurately', async () => {
      // Send some successful data
      await micromanager.handleSerialData('SUCCESS 1');
      await micromanager.handleSerialData('SUCCESS 2');
      
      // Stop server to cause failures
      await new Promise((resolve) => {
        mockWebhookServer.close(resolve);
      });
      
      await micromanager.handleSerialData('FAIL 1');
      await micromanager.handleSerialData('FAIL 2');
      
      await new Promise(resolve => setTimeout(resolve, 1000));

      const status = micromanager.getStatus();
      expect(status.statistics.linesProcessed).toBe(4);
      expect(status.statistics.webhooksSent).toBe(2);
      expect(status.statistics.webhooksFailed).toBe(2);
      expect(status.statistics.successRate).toBe(0.5);
      expect(status.queueSize).toBe(2);
      expect(status.isOnline).toBe(false);
    });
  });
});
