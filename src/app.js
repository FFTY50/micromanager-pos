const SerialPort = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const SmartTransactionProcessor = require('./transaction/SmartTransactionProcessor');
const VerifoneCommanderParser = require('./parsers/VerifoneCommanderParser');
const logger = require('./utils/Logger');
const fs = require('fs').promises;
require('dotenv').config();

class MicroManagerApp {
    constructor(configPath) {
        this.config = null;
        this.serialPort = null;
        this.parser = null;
        this.transactionProcessor = null;
        this.posParser = null;
        this.isRunning = false;
        this.shouldReconnect = true;
        
        this.loadConfig(configPath);
    }

    async loadConfig(configPath) {
        try {
            const configData = await fs.readFile(configPath, 'utf8');
            this.config = JSON.parse(configData);
            
            // Override with environment variables if present
            if (process.env.SUPABASE_URL) this.config.supabase.url = process.env.SUPABASE_URL;
            if (process.env.SUPABASE_KEY) this.config.supabase.key = process.env.SUPABASE_KEY;
            if (process.env.FRIGATE_URL) this.config.frigate.baseUrl = process.env.FRIGATE_URL;
            if (process.env.DEVICE_ID) this.config.deviceId = process.env.DEVICE_ID;
            if (process.env.SERIAL_PORT) this.config.serialPort = process.env.SERIAL_PORT;
            
            logger.info('Configuration loaded', {
                posType: this.config.posType,
                serialPort: this.config.serialPort,
                deviceId: this.config.deviceId,
                frigateUrl: this.config.frigate.baseUrl
            });
            
        } catch (error) {
            logger.error('Failed to load configuration', { 
                configPath, 
                error: error.message 
            });
            throw error;
        }
    }

    async initialize() {
        try {
            // Initialize transaction processor
            this.transactionProcessor = new SmartTransactionProcessor(this.config);
            
            // Initialize POS parser based on configuration
            this.initializePOSParser();
            
            // Initialize serial connection
            await this.initializeSerial();
            
            // Setup graceful shutdown
            this.setupGracefulShutdown();
            
            logger.info('Micromanager initialized successfully', {
                deviceId: this.config.deviceId,
                posType: this.config.posType,
                parserFeatures: this.posParser.getParserInfo().features
            });
            
        } catch (error) {
            logger.error('Failed to initialize micromanager', { error: error.message });
            throw error;
        }
    }

    initializePOSParser() {
        const posConfig = this.config.posTypes[this.config.posType];
        
        if (!posConfig) {
            throw new Error(`Unknown POS type: ${this.config.posType}`);
        }

        // Factory pattern for POS parsers
        switch (this.config.posType) {
            case 'verifone_commander':
                this.posParser = new VerifoneCommanderParser(posConfig);
                break;
            case 'gilbarco_passport':
                // TODO: Implement GilbarcoPassportParser
                throw new Error('Gilbarco Passport parser not yet implemented');
            case 'ncr':
                // TODO: Implement NCRParser
                throw new Error('NCR parser not yet implemented');
            default:
                throw new Error(`Unsupported POS type: ${this.config.posType}`);
        }

        logger.info('POS parser initialized', {
            posType: this.config.posType,
            parserInfo: this.posParser.getParserInfo()
        });
    }

    async initializeSerial() {
        return new Promise((resolve, reject) => {
            // Create serial port
            this.serialPort = new SerialPort({
                path: this.config.serialPort,
                baudRate: this.config.baudRate || 9600,
                ...this.posParser.getSerialConfig()
            });

            // Create line parser
            this.parser = this.serialPort.pipe(new ReadlineParser({ 
                delimiter: '\\r\\n' 
            }));

            // Setup event handlers
            this.serialPort.on('open', () => {
                logger.info('Serial port opened', {
                    path: this.config.serialPort,
                    baudRate: this.config.baudRate,
                    serialConfig: this.posParser.getSerialConfig()
                });
                this.isRunning = true;
                resolve();
            });

            this.serialPort.on('error', (error) => {
                logger.error('Serial port error', { error: error.message });
                if (!this.isRunning) {
                    reject(error);
                }
            });

            this.serialPort.on('close', () => {
                logger.warn('Serial port closed');
                this.isRunning = false;
                
                // Auto-reconnect if not shutting down gracefully
                if (this.shouldReconnect) {
                    setTimeout(() => this.reconnectSerial(), 5000);
                }
            });

            // Handle incoming data
            this.parser.on('data', (line) => {
                this.handleSerialData(line);
            });
        });
    }

    async handleSerialData(rawLine) {
        try {
            logger.serial('Received serial data', { 
                deviceId: this.config.deviceId,
                dataLength: rawLine.length,
                rawLine: rawLine.substring(0, 100) // Log first 100 chars
            });

            // Clean the data using POS parser (or pass through raw data)
            const cleanedData = this.posParser.cleanData ? this.posParser.cleanData(rawLine) : rawLine.trim();
            
            if (!cleanedData || cleanedData.trim().length === 0) {
                return; // Skip empty lines
            }

            // Extract transaction data - now returns array of parsed results
            const parsedDataArray = this.posParser.extractTransactionData(cleanedData);
            
            // Process each parsed result from multi-line packets
            for (const parsedData of parsedDataArray) {
                // Add line-level metadata
                parsedData.description = parsedData.description || cleanedData.trim();
                parsedData.timestamp = new Date().toISOString();
                parsedData.rawLine = rawLine;

                // Process through smart transaction processor
                await this.transactionProcessor.processSerialLine(rawLine, parsedData);
            }

        } catch (error) {
            logger.error('Error handling serial data', {
                rawLine,
                error: error.message,
                stack: error.stack
            });
        }
    }

    async reconnectSerial() {
        if (!this.shouldReconnect) return;

        try {
            logger.info('Attempting to reconnect serial port...');
            await this.initializeSerial();
            logger.info('Serial port reconnected successfully');
        } catch (error) {
            logger.error('Failed to reconnect serial port', { error: error.message });
            // Try again in 10 seconds
            setTimeout(() => this.reconnectSerial(), 10000);
        }
    }

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            logger.info(`Received ${signal}, shutting down gracefully...`);
            this.shouldReconnect = false;
            
            try {
                // Close serial port
                if (this.serialPort && this.serialPort.isOpen) {
                    this.serialPort.close();
                }
                
                logger.info('Micromanager shut down successfully');
                process.exit(0);
                
            } catch (error) {
                logger.error('Error during shutdown', { error: error.message });
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
        
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught exception', { 
                error: error.message, 
                stack: error.stack 
            });
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled rejection', { 
                reason: reason?.message || reason,
                promise: promise.toString()
            });
        });
    }

    // Health check endpoint for monitoring
    getHealthStatus() {
        return {
            status: this.isRunning ? 'healthy' : 'unhealthy',
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            serialPort: {
                isOpen: this.serialPort?.isOpen || false,
                path: this.config.serialPort
            },
            posParser: this.posParser?.getParserInfo() || null,
            config: {
                deviceId: this.config.deviceId,
                posType: this.config.posType,
                frigateUrl: this.config.frigate.baseUrl
            },
            lastActivity: this.transactionProcessor?.lastActivity || null
        };
    }

    // Export parser statistics for analysis
    exportParserStats() {
        if (this.posParser) {
            return this.posParser.exportUnknownPatterns();
        }
        return null;
    }
}

// Main execution
async function main() {
    try {
        const configPath = process.argv[2] || './config/micromanager.json';
        
        logger.info('Starting Micromanager Application', { 
            configPath,
            nodeVersion: process.version,
            platform: process.platform
        });
        
        const app = new MicroManagerApp(configPath);
        await app.initialize();
        
        // Optional: Start health check HTTP server
        if (process.env.HEALTH_CHECK_PORT) {
            startHealthCheckServer(app, process.env.HEALTH_CHECK_PORT);
        }
        
        logger.info('Micromanager is running and monitoring POS transactions');
        
    } catch (error) {
        logger.error('Failed to start Micromanager', { 
            error: error.message,
            stack: error.stack 
        });
        process.exit(1);
    }
}

// Optional health check HTTP server
function startHealthCheckServer(app, port) {
    const http = require('http');
    
    const server = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        
        if (req.url === '/health' && req.method === 'GET') {
            const health = app.getHealthStatus();
            res.writeHead(200);
            res.end(JSON.stringify(health, null, 2));
        } else if (req.url === '/parser-stats' && req.method === 'GET') {
            const stats = app.exportParserStats();
            res.writeHead(200);
            res.end(JSON.stringify(stats, null, 2));
        } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not Found' }));
        }
    });
    
    server.listen(port, () => {
        logger.info('Health check server running', { port });
    });
}

// Run if this file is executed directly
if (require.main === module) {
    main();
}

module.exports = MicroManagerApp;
