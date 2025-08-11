const DeviceInitializer = require('../../src/utils/DeviceInitializer');
const fs = require('fs-extra');
const path = require('path');
const { networkInterfaces } = require('os');

// Mock dependencies
jest.mock('fs-extra');
jest.mock('os');
jest.mock('crypto', () => ({
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'abcdef123456789')
  }))
}));

describe('DeviceInitializer', () => {
  const mockConfigPath = path.join(__dirname, '..', '..', 'config', 'device.json');
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock environment variables
    process.env.DEVICE_NAME = 'Test POS';
    process.env.POS_TYPE = 'verifone_commander';
    process.env.N8N_WEBHOOK_URL = 'https://test.n8n.com/webhook';
    process.env.SERIAL_PORT = '/dev/ttyUSB0';
    process.env.SERIAL_BAUD_RATE = '9600';
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.DEVICE_NAME;
    delete process.env.POS_TYPE;
    delete process.env.N8N_WEBHOOK_URL;
    delete process.env.SERIAL_PORT;
    delete process.env.SERIAL_BAUD_RATE;
  });

  describe('generateDeviceId', () => {
    test('should generate correct device ID format from MAC address', () => {
      const macAddress = 'aa:bb:cc:dd:ee:ff';
      const deviceId = DeviceInitializer.generateDeviceId(macAddress, '/dev/ttyUSB0');
      expect(deviceId).toBe('mmd-rv1-ddeeff-0');
    });

    test('should handle MAC address with dashes', () => {
      const macAddress = 'aa-bb-cc-dd-ee-ff';
      const deviceId = DeviceInitializer.generateDeviceId(macAddress, '/dev/ttyUSB0');
      expect(deviceId).toBe('mmd-rv1-ddeeff-0');
    });

    test('should handle uppercase MAC address', () => {
      const macAddress = 'AA:BB:CC:DD:EE:FF';
      const deviceId = DeviceInitializer.generateDeviceId(macAddress, '/dev/ttyUSB0');
      expect(deviceId).toBe('mmd-rv1-ddeeff-0');
    });

    test('should handle mixed case MAC address', () => {
      const macAddress = 'aA:Bb:cC:Dd:Ee:Ff';
      const deviceId = DeviceInitializer.generateDeviceId(macAddress, '/dev/ttyUSB0');
      expect(deviceId).toBe('mmd-rv1-ddeeff-0');
    });
  });

  describe('getMacAddress', () => {
    test('should return MAC address from priority interface', async () => {
      networkInterfaces.mockReturnValue({
        eth0: [
          {
            address: '192.168.1.100',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: 'aa:bb:cc:dd:ee:ff',
            internal: false
          }
        ],
        lo: [
          {
            address: '127.0.0.1',
            netmask: '255.0.0.0',
            family: 'IPv4',
            mac: '00:00:00:00:00:00',
            internal: true
          }
        ]
      });

      const macAddress = await DeviceInitializer.getMacAddress();
      expect(macAddress).toBe('aa:bb:cc:dd:ee:ff');
    });

    test('should skip internal interfaces', async () => {
      networkInterfaces.mockReturnValue({
        lo: [
          {
            address: '127.0.0.1',
            netmask: '255.0.0.0',
            family: 'IPv4',
            mac: '00:00:00:00:00:00',
            internal: true
          }
        ],
        wlan0: [
          {
            address: '192.168.1.101',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: 'bb:cc:dd:ee:ff:aa',
            internal: false
          }
        ]
      });

      const macAddress = await DeviceInitializer.getMacAddress();
      expect(macAddress).toBe('bb:cc:dd:ee:ff:aa');
    });

    test('should generate pseudo-MAC when no valid interface found', async () => {
      networkInterfaces.mockReturnValue({
        lo: [
          {
            address: '127.0.0.1',
            netmask: '255.0.0.0',
            family: 'IPv4',
            mac: '00:00:00:00:00:00',
            internal: true
          }
        ]
      });

      // Mock os.hostname
      const os = require('os');
      os.hostname = jest.fn(() => 'test-hostname');

      const macAddress = await DeviceInitializer.getMacAddress();
      expect(macAddress).toMatch(/^[a-f0-9]{2}:[a-f0-9]{2}:[a-f0-9]{2}:[a-f0-9]{2}:[a-f0-9]{2}:[a-f0-9]{2}$/);
    });
  });

  describe('validateConfig', () => {
    test('should validate correct configuration', () => {
      const config = {
        deviceId: 'mmd-rv1-ddeeff-0',
        deviceName: 'Test POS',
        posType: 'verifone_commander',
        serialPort: '/dev/ttyUSB0',
        serialBaudRate: 9600,
        n8nWebhookUrl: 'https://test.n8n.com/webhook'
      };

      const isValid = DeviceInitializer.validateConfig(config);
      expect(isValid).toBe(true);
    });

    test('should reject invalid device ID format', () => {
      const config = {
        deviceId: 'invalid-format',
        deviceName: 'Test POS',
        posType: 'verifone_commander',
        serialPort: '/dev/ttyUSB0',
        serialBaudRate: 9600
      };

      const isValid = DeviceInitializer.validateConfig(config);
      expect(isValid).toBe(false);
    });

    test('should reject missing required fields', () => {
      const config = {
        deviceId: 'mmd-rv1-ddeeff-0',
        // Missing deviceName
        posType: 'verifone_commander',
        serialPort: '/dev/ttyUSB0',
        serialBaudRate: 9600
      };

      const isValid = DeviceInitializer.validateConfig(config);
      expect(isValid).toBe(false);
    });

    test('should handle null config', () => {
      const isValid = DeviceInitializer.validateConfig(null);
      expect(isValid).toBe(false);
    });
  });

  describe('getOrCreateConfig', () => {
    test('should load existing valid configuration', async () => {
      const existingConfig = {
        deviceId: 'mmd-rv1-ddeeff-0',
        deviceName: 'Existing POS',
        posType: 'verifone_commander',
        serialPort: '/dev/ttyUSB0',
        serialBaudRate: 9600,
        n8nWebhookUrl: 'https://existing.n8n.com/webhook'
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(JSON.stringify(existingConfig));

      const config = await DeviceInitializer.getOrCreateConfig();
      
      expect(config.deviceId).toBe('mmd-rv1-ddeeff-0');
      // Environment variable should override the config
      expect(config.deviceName).toBe('Test POS'); // From process.env.DEVICE_NAME
      expect(fs.readFile).toHaveBeenCalledWith(mockConfigPath, 'utf8');
    });

    test('should create new configuration when file does not exist', async () => {
      fs.pathExists.mockResolvedValue(false);
      fs.ensureDir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      networkInterfaces.mockReturnValue({
        eth0: [
          {
            address: '192.168.1.100',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: 'aa:bb:cc:dd:ee:ff',
            internal: false
          }
        ]
      });

      const config = await DeviceInitializer.getOrCreateConfig();
      
      expect(config.deviceId).toBe('mmd-rv1-ddeeff-0');
      expect(config.deviceName).toBe('Test POS');
      expect(config.posType).toBe('verifone_commander');
      expect(config.n8nWebhookUrl).toBe('https://test.n8n.com/webhook');
      expect(fs.writeFile).toHaveBeenCalled();
    });

    test('should create new configuration when existing config is invalid', async () => {
      const invalidConfig = {
        deviceId: 'invalid-format',
        deviceName: 'Test POS'
        // Missing required fields
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));
      fs.ensureDir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      networkInterfaces.mockReturnValue({
        eth0: [
          {
            address: '192.168.1.100',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: 'aa:bb:cc:dd:ee:ff',
            internal: false
          }
        ]
      });

      const config = await DeviceInitializer.getOrCreateConfig();
      
      expect(config.deviceId).toBe('mmd-rv1-ddeeff-0');
      expect(config.deviceName).toBe('Test POS');
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('updateConfig', () => {
    test('should update existing configuration', async () => {
      const existingConfig = {
        deviceId: 'mmd-rv1-ddeeff-0',
        deviceName: 'Test POS',
        posType: 'verifone_commander',
        serialPort: '/dev/ttyUSB0',
        serialBaudRate: 9600,
        createdAt: '2025-01-01T00:00:00.000Z'
      };

      const updates = {
        n8nWebhookUrl: 'https://new.n8n.com/webhook',
        retryAttempts: 5
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(JSON.stringify(existingConfig));
      fs.ensureDir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();

      const updatedConfig = await DeviceInitializer.updateConfig(updates);
      
      expect(updatedConfig.n8nWebhookUrl).toBe('https://new.n8n.com/webhook');
      expect(updatedConfig.retryAttempts).toBe(5);
      expect(updatedConfig.deviceId).toBe('mmd-rv1-ddeeff-0'); // Preserved
      expect(updatedConfig.updatedAt).toBeDefined();
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });
});
