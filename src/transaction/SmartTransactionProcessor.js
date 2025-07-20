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
        const hasKnownPattern = parsedData.extractedFields && 
                               Object.keys(parsedData.extractedFields).length > 0;
        
        const lineType = hasKnownPattern ? 
                        this.determineLineType(parsedData) : 
                        'unknown';

        return {
            transaction_id: this.activeTransaction.id,
            line_type: lineType,
            description: parsedData.description || rawLine.trim(),
            qty: parsedData.quantity || null,
            amount: parsedData.amount || null,
            taxable_flag: parsedData.taxable || false,
            camera_id: this.cameraName,
            pos_terminal_id: this.config.posTerminalId,
            cloud_system_id: this.deviceId,
            frigate_event_id: this.activeTransaction.frigateEventId,
            
            // Critical: Preserve ALL data for analysis
            raw_line: rawLine,
            parsed_successfully: hasKnownPattern,
            matched_patterns: hasKnownPattern ? Object.keys(parsedData.extractedFields) : [],
            extraction_confidence: this.calculateExtractionConfidence(parsedData),
            pos_parser_version: this.config.parserVersion || '1.0.0',
            
            // Metadata for unknown line analysis
            line_length: rawLine.length,
            contains_numbers: /\d/.test(rawLine),
            contains_currency: /[\$£€¥]|\d+\.\d{2}/.test(rawLine),
            contains_time: /\d{1,2}:\d{2}/.test(rawLine),
            contains_date: /\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/.test(rawLine),
            
            // For future parser development
            needs_analysis: !hasKnownPattern,
            analysis_priority: this.calculateAnalysisPriority(rawLine, parsedData)
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

    calculateExtractionConfidence(parsedData) {
        if (!parsedData.extractedFields) return 0;
        
        const totalPatterns = Object.keys(this.config.posTypes[this.config.posType].transaction.patterns).length;
        const matchedPatterns = Object.keys(parsedData.extractedFields).length;
        
        return Math.round((matchedPatterns / totalPatterns) * 100);
    }

    calculateAnalysisPriority(rawLine, parsedData) {
        let priority = 'low';
        
        // High priority: Contains money amounts but wasn't parsed
        if (/\$?\d+\.\d{2}/.test(rawLine) && !parsedData.amount) {
            priority = 'high';
        }
        
        // Medium priority: Looks like a structured line but didn't match
        if (/^\s*[A-Z]+[\s\d]*\s+[\d\$]+/.test(rawLine)) {
            priority = 'medium';
        }
        
        // High priority: Contains common POS keywords
        const posKeywords = ['TOTAL', 'TAX', 'CASH', 'CREDIT', 'VOID', 'REFUND', 'TENDER'];
        if (posKeywords.some(keyword => rawLine.toUpperCase().includes(keyword))) {
            priority = 'high';
        }
        
        return priority;
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
                transaction_id: null, // No transaction context
                line_type: 'parse_error',
                description: `PARSE ERROR: ${error.message}`,
                raw_line: rawLine,
                parsed_successfully: false,
                error_details: error.message,
                error_stack: error.stack,
                needs_analysis: true,
                analysis_priority: 'critical',
                camera_id: this.cameraName,
                pos_terminal_id: this.config.posTerminalId,
                cloud_system_id: this.deviceId,
                frigate_event_id: 'parse-error'
            };

            await this.sendLineToSupabase(unparsableLine);
            
            // Also save to error log file
            await this.saveToLocalBackup('parse_errors', {
                timestamp: new Date().toISOString(),
                rawLine,
                error: error.message,
                stack: error.stack
            });
            
        } catch (backupError) {
            logger.error('Failed to save unparsable line', { 
                error: backupError.message 
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
            cloud_system_id: this.deviceId,
            start_time: this.activeTransaction.startTime.toISOString(),
            duration_ms: duration,
            total_amount: this.calculateTotal(),
            cash_amount: this.calculateCashAmount(),
            pos_txn_number: finalData.transactionNumber || null,
            store_number: this.config.storeNumber || null,
            drawer_number: finalData.drawerNumber || null,
            other_meta: this.buildMetadata(finalData),
            raw_description: this.logBuffer.map(l => l.rawLine).join('\n'),
            camera_id: this.cameraName,
            pos_source: this.config.posType,
            credit_amount: this.calculateCreditAmount(),
            debit_amount: this.calculateDebitAmount(),
            is_void: finalData.isVoid || false,
            is_no_sale: finalData.isNoSale || false,
            micro_manager_id: this.deviceId,
            store_id: this.config.storeId,
            frigate_event_id: this.activeTransaction.frigateEventId
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
