const fs = require('fs-extra');
const path = require('path');
const { networkInterfaces } = require('os');
const logger = require('./Logger');

/**
 * DeviceInitializer - Handles device configuration and ID generation
 * Generates special format device IDs: mmd-rv1-{last6MAC}
 */
class DeviceInitializer {
  static configPath = path.join(process.cwd(), 'config', 'device.json');

  /**
   * Get or create device configuration
   * @returns {Object} Device configuration object
   */
  static async getOrCreateConfig() {
    try {
      // Try to load existing configuration
      if (await fs.pathExists(this.configPath)) {
        const config = await this.loadExistingConfig();
        if (this.validateConfig(config)) {
          logger.info('Loaded existing device configuration', {
            deviceId: config.deviceId,
            deviceName: config.deviceName
          });
          return config;
        }
      }

      // Create new configuration
      logger.info('Creating new device configuration');
      return await this.createNewConfig();

    } catch (error) {
      logger.error('Failed to get or create device configuration', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Load existing configuration from file
   * @returns {Object} Configuration object
   */
  static async loadExistingConfig() {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      logger.warn('Failed to load existing config', { error: error.message });
      return null;
    }
  }

  /**
   * Create new device configuration
   * @returns {Object} New configuration object
   */
  static async createNewConfig() {
    const macAddress = await this.getMacAddress();
    const deviceId = this.generateDeviceId(macAddress);

    const config = {
      deviceId,
      deviceName: process.env.DEVICE_NAME || 'POS Terminal',
      posType: process.env.POS_TYPE || 'verifone_commander',
      n8nWebhookUrl: process.env.N8N_WEBHOOK_URL || '',
      frigateUrl: process.env.FRIGATE_URL || '',
      serialPort: process.env.SERIAL_PORT || '/dev/ttyUSB0',
      serialBaudRate: parseInt(process.env.SERIAL_BAUD_RATE) || 9600,
      localBackupEnabled: true,
      retryAttempts: parseInt(process.env.RETRY_ATTEMPTS) || 3,
      retryDelayMs: parseInt(process.env.RETRY_DELAY_MS) || 1000,
      createdAt: new Date().toISOString(),
      macAddress: macAddress
    };

    await this.saveDeviceConfig(config);
    
    logger.info('Created new device configuration', {
      deviceId: config.deviceId,
      deviceName: config.deviceName,
      macAddress: macAddress
    });

    return config;
  }

  /**
   * Generate device ID in format: mmd-rv1-{last6MAC}
   * @param {string} macAddress - MAC address (e.g., "aa:bb:cc:dd:ee:ff")
   * @returns {string} Device ID (e.g., "mmd-rv1-ddeeff")
   */
  static generateDeviceId(macAddress) {
    const cleanMac = macAddress.replace(/[:-]/g, '').toLowerCase();
    const last6Digits = cleanMac.slice(-6);
    return `mmd-rv1-${last6Digits}`;
  }

  /**
   * Get primary network interface MAC address
   * @returns {string} MAC address
   */
  static async getMacAddress() {
    try {
      const interfaces = networkInterfaces();
      
      // Priority order for interface selection
      const priorityInterfaces = ['eth0', 'en0', 'wlan0', 'WiFi', 'Ethernet'];
      
      // First try priority interfaces
      for (const interfaceName of priorityInterfaces) {
        if (interfaces[interfaceName]) {
          const iface = interfaces[interfaceName].find(
            addr => !addr.internal && addr.family === 'IPv4'
          );
          if (iface && iface.mac && iface.mac !== '00:00:00:00:00:00') {
            return iface.mac;
          }
        }
      }

      // Fallback: find any non-internal interface with valid MAC
      for (const [name, addresses] of Object.entries(interfaces)) {
        const validAddress = addresses.find(
          addr => !addr.internal && 
                  addr.family === 'IPv4' && 
                  addr.mac && 
                  addr.mac !== '00:00:00:00:00:00'
        );
        
        if (validAddress) {
          logger.info('Using MAC address from interface', { 
            interface: name, 
            mac: validAddress.mac 
          });
          return validAddress.mac;
        }
      }

      // Last resort: generate a pseudo-MAC based on hostname
      const crypto = require('crypto');
      const hostname = require('os').hostname();
      const hash = crypto.createHash('md5').update(hostname).digest('hex');
      const pseudoMac = hash.match(/.{2}/g).slice(0, 6).join(':');
      
      logger.warn('No valid MAC address found, using pseudo-MAC', { 
        hostname, 
        pseudoMac 
      });
      
      return pseudoMac;

    } catch (error) {
      logger.error('Failed to get MAC address', { error: error.message });
      throw new Error('Unable to determine device MAC address');
    }
  }

  /**
   * Save device configuration to file
   * @param {Object} config - Configuration object to save
   */
  static async saveDeviceConfig(config) {
    try {
      await fs.ensureDir(path.dirname(this.configPath));
      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
      
      logger.info('Device configuration saved', { 
        configPath: this.configPath,
        deviceId: config.deviceId 
      });
      
    } catch (error) {
      logger.error('Failed to save device configuration', { 
        error: error.message,
        configPath: this.configPath 
      });
      throw error;
    }
  }

  /**
   * Validate configuration object
   * @param {Object} config - Configuration to validate
   * @returns {boolean} True if valid
   */
  static validateConfig(config) {
    if (!config) return false;

    const requiredFields = [
      'deviceId', 
      'deviceName', 
      'posType', 
      'serialPort', 
      'serialBaudRate'
    ];

    for (const field of requiredFields) {
      if (!config[field]) {
        logger.warn('Invalid config: missing field', { field });
        return false;
      }
    }

    // Validate device ID format
    if (!config.deviceId.match(/^mmd-rv1-[a-f0-9]{6}$/)) {
      logger.warn('Invalid device ID format', { deviceId: config.deviceId });
      return false;
    }

    // Update with current environment variables if present
    if (process.env.N8N_WEBHOOK_URL) {
      config.n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    }
    if (process.env.DEVICE_NAME) {
      config.deviceName = process.env.DEVICE_NAME;
    }
    if (process.env.FRIGATE_URL) {
      config.frigateUrl = process.env.FRIGATE_URL;
    }
    if (process.env.SERIAL_PORT) {
      config.serialPort = process.env.SERIAL_PORT;
    }
    if (process.env.SERIAL_BAUD_RATE) {
      config.serialBaudRate = parseInt(process.env.SERIAL_BAUD_RATE);
    }

    return true;
  }

  /**
   * Update configuration with new values
   * @param {Object} updates - Fields to update
   */
  static async updateConfig(updates) {
    try {
      const config = await this.getOrCreateConfig();
      const updatedConfig = { ...config, ...updates, updatedAt: new Date().toISOString() };
      
      await this.saveDeviceConfig(updatedConfig);
      
      logger.info('Device configuration updated', { 
        deviceId: config.deviceId,
        updates: Object.keys(updates)
      });
      
      return updatedConfig;
      
    } catch (error) {
      logger.error('Failed to update device configuration', { 
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = DeviceInitializer;
