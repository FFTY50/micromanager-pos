const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/Logger');

class SmartTransactionProcessor {
    constructor(config) {
        this.config = config;
        this.deviceId = config.deviceId;
        this.supabase = createClient(config.supabase.url, config.supabase.key);
        this.activeTransaction = null;
        this.logBuffer = [];
        this.frigateBaseUrl = config.frigate.baseUrl;
        this.cameraName = config.frigate.cameraName;
        
        // Ensure log directory exists
        this.logDir = config.backup.logDirectory || './transaction-logs';
        this.setupLogDirectory();
    }

    async setupLogDirectory() {
        try {
            await fs.mkdir(this.logDir, { recursive: true });
        } catch (error) {
            logger.error('Failed to create log directory', { error: error.message });
        }
    }

    async processSerialLine(rawLine, parsedData) {
        try {
            // ALWAYS process EVERY line - never discard data
            
            // Start new transaction if this looks like a start
            if (!this.activeTransaction && this.isTransactionStart(parsedData)) {
                await this.startTransaction();
            }

            // If no active transaction, create an "orphaned line" transaction
            if (!this.activeTransaction) {
                logger.warn('Received line without active transaction, creating orphaned transaction', { rawLine });
                await this.startOrphanedTransaction();
            }

            // Process the line (EVERY line gets processed)
            const transactionLine = this.formatTransactionLine(parsedData, rawLine);
            
            // Add to local buffer immediately
            this.logBuffer.push({
                ...transactionLine,
                rawLine,
                timestamp: new Date().toISOString()
            });

            // Send to Supabase (EVERY line gets sent)
            await this.sendLineToSupabase(transactionLine);

            // Check for transaction end
            if (parsedData.isEndOfTransaction) {
                await this.completeTransaction(parsedData);
            }

        } catch (error) {
            logger.error('Error processing serial line', { error: error.message, rawLine });
            // Even if parsing fails, try to save the raw line
            await this.saveUnparsableLine(rawLine, error);
        }
    }

    isTransactionStart(parsedData) {
        // Define what constitutes a transaction start
        return parsedData.lineType === 'item' || 
               parsedData.amount > 0 || 
               parsedData.description?.match(/^(ITEM|PRODUCT|SALE)/i);
    }

    async startTransaction() {
        const transactionId = crypto.randomUUID();
        const startTime = new Date();
        
        this.activeTransaction = {
            id: transactionId,
            startTime,
            lines: [],
            frigateEventId: null,
            backupFile: this.getHourlyLogFilename(startTime)
        };

        logger.transaction('Started transaction', { 
            transactionId,
            deviceId: this.deviceId 
        });

        // Create Frigate event
        try {
            const frigateEventId = await this.createFrigateEvent(transactionId, startTime);
            this.activeTransaction.frigateEventId = frigateEventId;
            logger.info('Created Frigate event', { 
                transactionId,
                frigateEventId 
            });
        } catch (error) {
            logger.warn('Failed to create Frigate event', { 
                transactionId,
                error: error.message 
            });
            this.activeTransaction.frigateEventId = 'no-video';
        }
    }

    async startOrphanedTransaction() {
        const transactionId = crypto.randomUUID();
        const startTime = new Date();
        
        this.activeTransaction = {
            id: transactionId,
            startTime,
            lines: [],
            frigateEventId: 'orphaned-no-video', // Don't create Frigate events for orphaned lines
            backupFile: this.getHourlyLogFilename(startTime),
            isOrphaned: true
        };

        logger.warn('Started orphaned transaction', { transactionId });
    }

    formatTransactionLine(parsedData, rawLine) {
        // Determine if this line matched any parsing patterns
        return {
            transaction_id: this.activeTransaction?.id || null,
            micromanager_id: this.deviceId,
            line_type: parsedData.lineType,
            description: parsedData.description,
            qty: parsedData.quantity,
            amount: parsedData.amount,
            taxable_flag: parsedData.taxable,
            raw_line: rawLine,
            parsed_successfully: parsedData.parsingSuccess,
            frigate_event_id: this.activeTransaction?.frigateEventId || null
        };
    }

    determineLineType(parsedData) {
        const desc = parsedData.description?.toUpperCase() || '';
        
        if (desc.includes('TAX') || desc.includes('HST') || desc.includes('GST')) return 'tax';
        if (desc.includes('CASH') || desc.includes('CARD') || desc.includes('PAYMENT')) return 'payment';
        if (desc.includes('DISCOUNT') || desc.includes('COUPON')) return 'discount';
        if (desc.includes('TOTAL')) return 'total';
        if (desc.includes('VOID') || desc.includes('REFUND')) return 'void';
        if (parsedData.amount && parsedData.amount > 0) return 'item';
        
        return 'other';
    }



    async sendLineToSupabase(transactionLine) {
        try {
            const { data, error } = await this.supabase
                .from('transaction_lines')
                .insert([transactionLine])
                .select();

            if (error) {
                throw error;
            }

            logger.debug('Sent line to Supabase', { 
                transactionId: transactionLine.transaction_id,
                description: transactionLine.description 
            });
        } catch (error) {
            logger.error('Failed to send line to Supabase', { 
                transactionId: transactionLine.transaction_id,
                error: error.message 
            });
            // Add to retry queue or local backup
            await this.saveToLocalBackup('failed_lines', transactionLine);
        }
    }

    async saveUnparsableLine(rawLine, error) {
        try {
            const unparsableLine = {
                transaction_id: null,
                micromanager_id: this.deviceId,
                line_type: 'parse_error',
                description: `PARSE ERROR: ${error.message}`,
                raw_line: rawLine,
                parsed_successfully: false,
                frigate_event_id: 'parse-error'
            };

            await this.sendLineToSupabase(unparsableLine);
            await this.saveToLocalBackup('parse_errors', {
                timestamp: new Date().toISOString(),
                rawLine,
                error: error.message
            });
        } catch (backupError) {
            logger.error('Failed to save unparsable line', { 
                rawLine, 
                error: error.message, 
                backupError: backupError.message 
            });
        }
    }

    async completeTransaction(finalData) {
        if (!this.activeTransaction) return;

        const endTime = new Date();
        const duration = endTime - this.activeTransaction.startTime;

        // Create transaction record
        const transactionRecord = {
            id: this.activeTransaction.id,
            micromanager_id: this.deviceId,
            start_time: this.activeTransaction.startTime.toISOString(),
            end_time: endTime.toISOString(),
            duration_ms: duration,
            total_amount: this.calculateTotal(),
            cash_amount: this.calculateCashAmount(),
            credit_amount: this.calculateCreditAmount(),
            debit_amount: this.calculateDebitAmount(),
            preauth_amount: this.calculatePreauthAmount(),
            pos_txn_number: finalData.transactionNumber,
            is_void: this.isVoidTransaction(),
            is_no_sale: this.isNoSaleTransaction(),
            frigate_event_id: this.activeTransaction.frigateEventId,
            store_id: this.config.storeId
        };

        try {
            // Send transaction to Supabase
            await this.sendTransactionToSupabase(transactionRecord);
            
            // End Frigate event
            if (this.activeTransaction.frigateEventId && this.activeTransaction.frigateEventId !== 'no-video') {
                await this.endFrigateEvent(this.activeTransaction.frigateEventId);
            }

            // Write to hourly log file
            await this.writeToHourlyLog();

            logger.transaction('Completed transaction', {
                transactionId: this.activeTransaction.id,
                totalAmount: transactionRecord.total_amount,
                lineCount: this.logBuffer.length
            });

        } catch (error) {
            logger.error('Error completing transaction', { 
                transactionId: this.activeTransaction.id,
                error: error.message 
            });
        } finally {
            // Clear active transaction
            this.activeTransaction = null;
            this.logBuffer = [];
        }
    }

    async createFrigateEvent(transactionId, startTime) {
        const eventName = `transaction-${transactionId.slice(-6)}-${startTime.getTime()}`;
        
        const response = await fetch(`${this.frigateBaseUrl}/api/events/${this.cameraName}/transaction/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                duration: 300, // 5 minutes max
                source_type: 'api',
                sub_label: eventName,
                score: 1.0
            })
        });

        if (!response.ok) {
            throw new Error(`Frigate API error: ${response.status}`);
        }

        const result = await response.json();
        return result.event_id;
    }

    async endFrigateEvent(eventId) {
        try {
            const response = await fetch(`${this.frigateBaseUrl}/api/events/${eventId}/end`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                logger.warn('Failed to end Frigate event', { 
                    eventId,
                    status: response.status 
                });
            } else {
                logger.debug('Ended Frigate event', { eventId });
            }
        } catch (error) {
            logger.warn('Error ending Frigate event', { 
                eventId,
                error: error.message 
            });
        }
    }

    async sendTransactionToSupabase(transaction) {
        const { data, error } = await this.supabase
            .from('transactions')
            .insert([transaction])
            .select();

        if (error) {
            throw error;
        }

        logger.transaction('Transaction sent to Supabase', { 
            transactionId: transaction.id,
            totalAmount: transaction.total_amount 
        });
    }

    calculateTotal() {
        return this.logBuffer
            .filter(line => line.line_type === 'item' && line.amount > 0)
            .reduce((sum, line) => sum + (line.amount || 0), 0);
    }

    calculateCashAmount() {
        return this.logBuffer
            .filter(line => line.description?.toUpperCase().includes('CASH'))
            .reduce((sum, line) => sum + (line.amount || 0), 0);
    }

    calculateCreditAmount() {
        return this.logBuffer
            .filter(line => line.description?.toUpperCase().includes('CREDIT'))
            .reduce((sum, line) => sum + (line.amount || 0), 0);
    }

    calculateDebitAmount() {
        return this.logBuffer
            .filter(line => line.description?.toUpperCase().includes('DEBIT'))
            .reduce((sum, line) => sum + (line.amount || 0), 0);
    }

    calculatePreauthAmount() {
        return this.logBuffer
            .filter(line => line.description?.toUpperCase().includes('PREAUTH'))
            .reduce((sum, line) => sum + (line.amount || 0), 0);
    }

    isVoidTransaction() {
        return this.logBuffer.some(line => 
            line.description?.toUpperCase().includes('VOID')
        );
    }

    isNoSaleTransaction() {
        return this.logBuffer.some(line => 
            line.description?.toUpperCase().includes('NO SALE')
        );
    }

    buildMetadata(finalData) {
        return {
            cashierName: finalData.cashierName,
            terminalId: finalData.terminalId,
            receiptNumber: finalData.receiptNumber,
            customFields: finalData.extractedFields || {}
        };
    }

    getHourlyLogFilename(date) {
        const hour = date.toISOString().slice(0, 13); // "2025-01-15T14"
        return `${hour}.json`;
    }

    async writeToHourlyLog() {
        try {
            const filename = this.getHourlyLogFilename(this.activeTransaction.startTime);
            const filepath = path.join(this.logDir, filename);
            
            // Read existing log file or create new structure
            let logData = { hour: filename.replace('.json', ''), transactions: [] };
            
            try {
                const existing = await fs.readFile(filepath, 'utf8');
                logData = JSON.parse(existing);
            } catch (error) {
                // File doesn't exist, use new structure
            }

            // Add current transaction
            logData.transactions.push({
                id: this.activeTransaction.id,
                startTime: this.activeTransaction.startTime.toISOString(),
                frigateEventId: this.activeTransaction.frigateEventId,
                lines: [...this.logBuffer]
            });

            // Write back to file
            await fs.writeFile(filepath, JSON.stringify(logData, null, 2));
            
            logger.debug('Written to hourly log', { filepath });
            
            // Clean up old logs (30 days)
            await this.cleanupOldLogs();
            
        } catch (error) {
            logger.error('Error writing to hourly log', { error: error.message });
        }
    }

    async saveToLocalBackup(type, data) {
        const filename = `${type}-${new Date().toISOString().slice(0, 10)}.json`;
        const filepath = path.join(this.logDir, filename);
        
        try {
            let backupData = [];
            try {
                const existing = await fs.readFile(filepath, 'utf8');
                backupData = JSON.parse(existing);
            } catch (error) {
                // File doesn't exist
            }
            
            backupData.push({
                timestamp: new Date().toISOString(),
                data
            });
            
            await fs.writeFile(filepath, JSON.stringify(backupData, null, 2));
        } catch (error) {
            logger.error('Error saving local backup', { error: error.message });
        }
    }

    async cleanupOldLogs() {
        try {
            const files = await fs.readdir(this.logDir);
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filepath = path.join(this.logDir, file);
                    const stats = await fs.stat(filepath);
                    
                    if (stats.mtime < thirtyDaysAgo) {
                        await fs.unlink(filepath);
                        logger.info('Cleaned up old log', { file });
                    }
                }
            }
        } catch (error) {
            logger.error('Error cleaning up old logs', { error: error.message });
        }
    }
}

module.exports = SmartTransactionProcessor;
