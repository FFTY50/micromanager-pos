const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const fetch = require('node-fetch');
const fs = require('fs-extra');
const path = require('path');
const logger = require('./utils/Logger');

/**
 * SimplifiedMicromanager - Raw POS data forwarder to n8n
 * Removes all complex parsing and sends raw serial data to n8n webhook
 */
class SimplifiedMicromanager {
  constructor(config) {
    this.deviceId = config.deviceId; // mmd-rv1-{last6digits}
    this.deviceName = config.deviceName; // Human name = camera name
    this.posType = config.posType;
    this.n8nWebhookUrl = config.n8nWebhookUrl;
    this.config = config;
    this.serialPort = null;
    this.parser = null;
    
    // Local backup system
    this.logDir = path.join(__dirname, '..', 'transaction-logs');
    this.isOnline = true;
    this.offlineQueue = [];
    
    // Retry configuration
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelayMs = config.retryDelayMs || 1000;
    
    // Statistics
    this.stats = {
      linesProcessed: 0,
      webhooksSent: 0,
      webhooksFailed: 0,
      queuedItems: 0,
      startTime: new Date()
    };
    
    this.initializeDirectories();
  }

  /**
   * Initialize required directories
   */
  async initializeDirectories() {
    try {
      await fs.ensureDir(this.logDir);
      logger.info('Directories initialized', { 
        logDir: this.logDir,
        deviceId: this.deviceId 
      });
    } catch (error) {
      logger.error('Failed to initialize directories', { 
        error: error.message,
        deviceId: this.deviceId 
      });
      throw error;
    }
  }

  /**
   * Start serial port connection and data processing
   */
  async startSerial() {
    try {
      logger.info('Starting serial port connection', {
        deviceId: this.deviceId,
        port: this.config.serialPort,
        baudRate: this.config.serialBaudRate
      });

      this.serialPort = new SerialPort({
        path: this.config.serialPort,
        baudRate: this.config.serialBaudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
      });

      this.parser = this.serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));
      this.parser.on('data', this.handleSerialData.bind(this));
      
      this.serialPort.on('open', () => {
        logger.info('Serial port opened successfully', { 
          deviceId: this.deviceId,
          deviceName: this.deviceName,
          port: this.config.serialPort,
          baudRate: this.config.serialBaudRate
        });
      });

      this.serialPort.on('error', (error) => {
        logger.error('Serial port error', { 
          error: error.message,
          deviceId: this.deviceId,
          port: this.config.serialPort
        });
      });

      this.serialPort.on('close', () => {
        logger.warn('Serial port closed', { 
          deviceId: this.deviceId,
          port: this.config.serialPort
        });
        
        // Attempt reconnection if configured
        if (this.shouldReconnect) {
          setTimeout(() => {
            logger.info('Attempting serial port reconnection');
            this.startSerial().catch(error => {
              logger.error('Serial reconnection failed', { error: error.message });
            });
          }, 5000);
        }
      });

    } catch (error) {
      logger.error('Failed to start serial port', { 
        error: error.message,
        deviceId: this.deviceId,
        port: this.config.serialPort
      });
      throw error;
    }
  }

  /**
   * Handle incoming serial data - core processing function
   * @param {string} rawLine - Raw line from serial port
   */
  async handleSerialData(rawLine) {
    try {
      this.stats.linesProcessed++;
      
      // Clean the raw line (minimal processing)
      const cleanedLine = this.cleanRawLine(rawLine);
      if (!cleanedLine) {
        logger.debug('Skipped empty or invalid line', { deviceId: this.deviceId });
        return;
      }

      // Create payload for n8n
      const payload = {
        micromanager_id: this.deviceId,
        device_name: this.deviceName,
        pos_type: this.posType,
        raw_line: cleanedLine,
        timestamp: new Date().toISOString(),
        line_length: cleanedLine.length
      };

      // Always backup locally first (ensures no data loss)
      await this.saveRawDataBackup(payload);

      // Try to send to n8n with retry logic
      await this.sendToN8nWithRetry(payload);

      logger.debug('Processed serial data line', {
        deviceId: this.deviceId,
        lineLength: cleanedLine.length,
        isOnline: this.isOnline
      });

    } catch (error) {
      logger.error('Error handling serial data', { 
        error: error.message,
        deviceId: this.deviceId,
        rawLine: rawLine?.substring(0, 100) // Log first 100 chars for debugging
      });
    }
  }

  /**
   * Clean raw line with minimal processing
   * @param {string} rawLine - Raw line from serial
   * @returns {string|null} Cleaned line or null if invalid
   */
  cleanRawLine(rawLine) {
    if (typeof rawLine !== 'string') return null;
    
    // Minimal cleaning - remove obvious noise but preserve structure
    const cleaned = rawLine
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars except \t, \n
      .trim();
    
    // Skip empty lines
    if (cleaned.length === 0) return null;
    
    return cleaned;
  }

  /**
   * Send payload to n8n webhook with retry logic
   * @param {Object} payload - Data to send
   * @param {number} attempt - Current attempt number
   */
  async sendToN8nWithRetry(payload, attempt = 1) {
    if (!this.n8nWebhookUrl) {
      logger.warn('No n8n webhook URL configured, skipping send', { 
        deviceId: this.deviceId 
      });
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(this.n8nWebhookUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Device-ID': this.deviceId,
          'X-Device-Name': this.deviceName,
          'X-POS-Type': this.posType,
          'User-Agent': `SimplifiedMicromanager/${this.deviceId}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.stats.webhooksSent++;

      // Success - mark as online and process any queued items
      if (!this.isOnline) {
        this.isOnline = true;
        logger.info('Reconnected to n8n webhook', { 
          deviceId: this.deviceId,
          queueSize: this.offlineQueue.length
        });
        await this.processOfflineQueue();
      }

      logger.debug('Sent to n8n successfully', {
        deviceId: this.deviceId,
        lineLength: payload.raw_line.length,
        attempt
      });

    } catch (error) {
      this.stats.webhooksFailed++;
      
      logger.warn(`n8n webhook send attempt ${attempt} failed`, {
        deviceId: this.deviceId,
        error: error.message,
        attempt,
        maxAttempts: this.retryAttempts
      });

      // Retry logic with exponential backoff
      if (attempt < this.retryAttempts) {
        const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
        logger.debug('Retrying webhook send', { 
          deviceId: this.deviceId,
          delay,
          attempt: attempt + 1
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendToN8nWithRetry(payload, attempt + 1);
      }

      // All retries failed - mark offline and queue
      this.isOnline = false;
      this.offlineQueue.push(payload);
      this.stats.queuedItems++;
      
      // Save failed payload to dedicated backup
      await this.saveToLocalBackup('failed_webhooks', {
        ...payload,
        failure_reason: error.message,
        attempts_made: attempt
      });
      
      logger.error('Failed to send to n8n after all retries', {
        deviceId: this.deviceId,
        error: error.message,
        attempts: attempt,
        queueSize: this.offlineQueue.length
      });
    }
  }

  /**
   * Process offline queue when connection is restored
   */
  async processOfflineQueue() {
    if (this.offlineQueue.length === 0) return;

    logger.info('Processing offline queue', {
      deviceId: this.deviceId,
      queueSize: this.offlineQueue.length
    });

    const queue = [...this.offlineQueue];
    this.offlineQueue = [];

    let processed = 0;
    let failed = 0;

    for (const payload of queue) {
      try {
        await this.sendToN8nWithRetry(payload);
        processed++;
        
        // Small delay between sends to avoid overwhelming the webhook
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        // If still failing, put back in queue
        this.offlineQueue.push(payload);
        failed++;
      }
    }

    logger.info('Offline queue processing completed', {
      deviceId: this.deviceId,
      processed,
      failed,
      remainingInQueue: this.offlineQueue.length
    });
  }

  /**
   * Save raw data backup - routine backup of all data
   * @param {Object} payload - Data to backup
   */
  async saveRawDataBackup(payload) {
    await this.saveToLocalBackup('raw_data', {
      ...payload,
      backup_reason: 'routine_backup',
      device_status: this.isOnline ? 'online' : 'offline'
    });
  }

  /**
   * Save data to local backup files (enhanced from current codebase)
   * @param {string} type - Backup type (raw_data, failed_webhooks, etc.)
   * @param {Object} data - Data to backup
   */
  async saveToLocalBackup(type, data) {
    const filename = `${type}-${new Date().toISOString().slice(0, 10)}.json`;
    const filepath = path.join(this.logDir, filename);
    
    try {
      let backupData = [];
      
      // Load existing data for the day
      try {
        const existing = await fs.readFile(filepath, 'utf8');
        backupData = JSON.parse(existing);
      } catch (error) {
        // File doesn't exist - start fresh array
        backupData = [];
      }
      
      // Add new entry
      backupData.push({
        timestamp: new Date().toISOString(),
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        data
      });
      
      // Write back to file
      await fs.writeFile(filepath, JSON.stringify(backupData, null, 2));
      
      logger.debug('Saved to local backup', {
        type,
        deviceId: this.deviceId,
        filename,
        entriesInFile: backupData.length
      });
      
    } catch (error) {
      logger.error('Error saving local backup', { 
        type,
        error: error.message,
        deviceId: this.deviceId,
        filename
      });
    }
  }

  /**
   * Clean up old backup files (preserve existing 30-day retention)
   */
  async cleanupOldLogs() {
    try {
      const files = await fs.readdir(this.logDir);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      let cleanedCount = 0;
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filepath = path.join(this.logDir, file);
          const stats = await fs.stat(filepath);
          
          if (stats.mtime < thirtyDaysAgo) {
            await fs.unlink(filepath);
            cleanedCount++;
            logger.debug('Cleaned up old backup file', { 
              file,
              deviceId: this.deviceId,
              age: Math.floor((Date.now() - stats.mtime.getTime()) / (24 * 60 * 60 * 1000))
            });
          }
        }
      }
      
      if (cleanedCount > 0) {
        logger.info('Log cleanup completed', {
          deviceId: this.deviceId,
          filesRemoved: cleanedCount
        });
      }
      
    } catch (error) {
      logger.error('Error cleaning up old logs', { 
        error: error.message,
        deviceId: this.deviceId 
      });
    }
  }

  /**
   * Get current status and health information
   * @returns {Object} Status object
   */
  getStatus() {
    const uptime = Date.now() - this.stats.startTime.getTime();
    
    return {
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      posType: this.posType,
      isOnline: this.isOnline,
      queueSize: this.offlineQueue.length,
      serialPortOpen: this.serialPort?.isOpen || false,
      n8nWebhookConfigured: !!this.n8nWebhookUrl,
      statistics: {
        ...this.stats,
        uptime: Math.floor(uptime / 1000), // seconds
        linesPerMinute: this.stats.linesProcessed / (uptime / 60000),
        successRate: this.stats.webhooksSent / (this.stats.webhooksSent + this.stats.webhooksFailed) || 0
      },
      lastActivity: new Date().toISOString()
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('Shutting down SimplifiedMicromanager', { 
      deviceId: this.deviceId,
      queueSize: this.offlineQueue.length
    });
    
    this.shouldReconnect = false;
    
    // Process remaining queue items
    if (this.offlineQueue.length > 0) {
      logger.info('Processing remaining queue items before shutdown', { 
        count: this.offlineQueue.length,
        deviceId: this.deviceId
      });
      
      try {
        await this.processOfflineQueue();
      } catch (error) {
        logger.error('Error processing queue during shutdown', { 
          error: error.message 
        });
      }
    }
    
    // Close serial port
    if (this.serialPort?.isOpen) {
      this.serialPort.close();
      logger.info('Serial port closed', { deviceId: this.deviceId });
    }
    
    // Final cleanup
    await this.cleanupOldLogs();
    
    // Log final statistics
    const finalStats = this.getStatus();
    logger.info('Shutdown completed', {
      deviceId: this.deviceId,
      finalStats: finalStats.statistics
    });
  }
}

module.exports = SimplifiedMicromanager;
