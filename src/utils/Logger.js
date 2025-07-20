const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

class Logger {
    constructor() {
        this.winston = null;
        this.setupLogger();
    }

    setupLogger() {
        // Ensure logs directory exists
        const logsDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }

        const logLevel = process.env.LOG_LEVEL || 'info';
        const enableConsole = process.env.CONSOLE_LOGGING !== 'false';

        const transports = [];

        // Console transport
        if (enableConsole) {
            transports.push(
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.timestamp(),
                        winston.format.printf(({ timestamp, level, message, ...meta }) => {
                            const metaStr = Object.keys(meta).length ? 
                                ` ${JSON.stringify(meta)}` : '';
                            return `${timestamp} [${level}]: ${message}${metaStr}`;
                        })
                    )
                })
            );
        }

        // File transport with rotation
        transports.push(
            new DailyRotateFile({
                filename: path.join(logsDir, 'micromanager-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '10m',
                maxFiles: '7d',
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json()
                )
            })
        );

        // Error file transport
        transports.push(
            new DailyRotateFile({
                filename: path.join(logsDir, 'error-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '10m',
                maxFiles: '30d',
                level: 'error',
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json()
                )
            })
        );

        this.winston = winston.createLogger({
            level: logLevel,
            transports
        });
    }

    debug(message, meta = {}) {
        this.winston.debug(message, meta);
    }

    info(message, meta = {}) {
        this.winston.info(message, meta);
    }

    warn(message, meta = {}) {
        this.winston.warn(message, meta);
    }

    error(message, meta = {}) {
        this.winston.error(message, meta);
    }

    // Helper for transaction logging
    transaction(message, transactionData = {}) {
        this.info(`[TRANSACTION] ${message}`, {
            transactionId: transactionData.id,
            deviceId: transactionData.deviceId,
            amount: transactionData.totalAmount,
            ...transactionData
        });
    }

    // Helper for parser logging
    parser(message, parserData = {}) {
        this.debug(`[PARSER] ${message}`, {
            parser: parserData.parser,
            pattern: parserData.pattern,
            line: parserData.line,
            ...parserData
        });
    }

    // Helper for serial logging
    serial(message, serialData = {}) {
        this.debug(`[SERIAL] ${message}`, {
            port: serialData.port,
            deviceId: serialData.deviceId,
            dataLength: serialData.dataLength,
            ...serialData
        });
    }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;
