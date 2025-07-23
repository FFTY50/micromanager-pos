const SimplifiedMicromanager = require('./SimplifiedMicromanager');
const DeviceInitializer = require('./utils/DeviceInitializer');
const logger = require('./utils/Logger');
require('dotenv').config();

/**
 * Main application entry point for Simplified Micromanager
 * Transforms raw POS data forwarding to n8n webhook
 */
async function main() {
  try {
    logger.info('Starting Simplified Micromanager');

    // Initialize device configuration (first run or load existing)
    const config = await DeviceInitializer.getOrCreateConfig();
    
    // Validate required configuration
    if (!config.n8nWebhookUrl) {
      logger.warn('No n8n webhook URL configured - data will only be backed up locally', {
        deviceId: config.deviceId
      });
    }
    
    logger.info('Device initialized', {
      deviceId: config.deviceId,
      deviceName: config.deviceName,
      posType: config.posType,
      hasWebhookUrl: !!config.n8nWebhookUrl
    });

    // Create and start micromanager
    const micromanager = new SimplifiedMicromanager(config);
    
    // Start serial processing
    await micromanager.startSerial();
    
    // Setup periodic cleanup (every 6 hours)
    const cleanupInterval = setInterval(() => {
      micromanager.cleanupOldLogs().catch(error => {
        logger.error('Cleanup error', { error: error.message });
      });
    }, 6 * 60 * 60 * 1000);

    // Setup health monitoring (every 5 minutes)
    const healthInterval = setInterval(() => {
      const status = micromanager.getStatus();
      logger.info('Health check', {
        deviceId: status.deviceId,
        isOnline: status.isOnline,
        queueSize: status.queueSize,
        serialPortOpen: status.serialPortOpen,
        linesProcessed: status.statistics.linesProcessed,
        successRate: Math.round(status.statistics.successRate * 100) + '%'
      });
    }, 5 * 60 * 1000);

    // Graceful shutdown handling
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      // Clear intervals
      clearInterval(cleanupInterval);
      clearInterval(healthInterval);
      
      // Shutdown micromanager
      await micromanager.shutdown();
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      shutdown('unhandledRejection');
    });

    logger.info('Simplified Micromanager started successfully', {
      deviceId: config.deviceId,
      deviceName: config.deviceName,
      serialPort: config.serialPort,
      pid: process.pid
    });

  } catch (error) {
    logger.error('Failed to start micromanager', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

/**
 * Optional health check HTTP server
 * @param {SimplifiedMicromanager} micromanager - Micromanager instance
 * @param {number} port - Port to listen on
 */
function startHealthCheckServer(micromanager, port = 3000) {
  if (!process.env.ENABLE_HEALTH_SERVER) return;
  
  const http = require('http');
  
  const server = http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      const status = micromanager.getStatus();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ...status,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform
      }, null, 2));
      
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });
  
  server.listen(port, () => {
    logger.info('Health check server started', { port });
  });
  
  return server;
}

// Export for testing
module.exports = { main, startHealthCheckServer };

// Start the application if run directly
if (require.main === module) {
  main();
}
