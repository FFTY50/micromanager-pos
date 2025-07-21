const logger = require('../utils/Logger');

class BasePOSParser {
    constructor(posConfig) {
        this.config = posConfig;
        this.transactionConfig = posConfig.transaction;
        this.serialConfig = posConfig.serial || {};
        
        // Control characters handling
        if (this.transactionConfig.controlCharsSequence) {
            this.controlCharsRegex = new RegExp(this.transactionConfig.controlCharsSequence, 'g');
        }
    }

    cleanData(rawData) {
        try {
            let cleaned = rawData;

            // Handle control characters if configured
            if (this.transactionConfig.controlCharsSequence) {
                const firstIndex = cleaned.indexOf(this.transactionConfig.controlCharsSequence);
                if (firstIndex !== -1) {
                    cleaned = cleaned.substring(0, firstIndex) + 
                             cleaned.substring(firstIndex + this.transactionConfig.controlCharsSequence.length);
                }
                
                cleaned = cleaned.replace(this.controlCharsRegex, '\n');
            }

            // Apply line stripping if configured
            if (this.transactionConfig.lineStripChars !== undefined) {
                const lines = cleaned.split('\n');
                const processedLines = lines.map(line => {
                    return line.length > this.transactionConfig.lineStripChars ?
                           line.substring(this.transactionConfig.lineStripChars).trim() : 
                           line.trim();
                });
                cleaned = processedLines.join('\n');
            }

            logger.parser('Data cleaned by BasePOSParser', {
                parser: this.constructor.name,
                original: rawData,
                cleaned: cleaned
            });

            return cleaned;

        } catch (error) {
            logger.error('Error cleaning data in BasePOSParser', {
                parser: this.constructor.name,
                rawData,
                error: error.message
            });
            
            // NEVER discard data - return original if cleaning fails
            return rawData;
        }
    }

    extractTransactionData(cleanedData) {
        // BasePOSParser provides default implementation
        // Subclasses should override this method with specific parsing logic
        
        const result = {
            lineType: 'unknown',
            description: `UNKNOWN ${this.constructor.name} LINE: ${cleanedData}`,
            amount: null,
            quantity: null,
            parsingSuccess: true // Preserve unknown lines
        };

        try {
            // Subclasses implement specific parsing logic
            logger.parser('Transaction data extracted by BasePOSParser', {
                parser: this.constructor.name,
                lineType: result.lineType,
                parsingSuccess: result.parsingSuccess
            });

        } catch (error) {
            logger.error('Error extracting transaction data in BasePOSParser', {
                parser: this.constructor.name,
                cleanedData,
                error: error.message
            });
            
            // Even on error, preserve the data
            result.extractionError = error.message;
            result.parsingSuccess = false;
        }

        return result;
    }



    validateTransactionData(data) {
        // Basic validation - can be overridden by specific parsers
        if (data.totalAmount !== null && (isNaN(data.totalAmount) || data.totalAmount < 0)) {
            logger.warn('Invalid total amount detected', { 
                parser: this.constructor.name,
                totalAmount: data.totalAmount 
            });
            return false;
        }

        if (data.cashAmount !== null && (isNaN(data.cashAmount) || data.cashAmount < 0)) {
            logger.warn('Invalid cash amount detected', { 
                parser: this.constructor.name,
                cashAmount: data.cashAmount 
            });
            return false;
        }

        return true;
    }

    // Method for child classes to override for custom logic
    postProcessTransactionData(data) {
        return data;
    }

    // Get parser-specific configuration for serial port
    getSerialConfig() {
        return {
            dataBits: this.serialConfig.dataBits || 8,
            stopBits: this.serialConfig.stopBits || 1,
            parity: this.serialConfig.parity || 'none',
            rtscts: this.serialConfig.rtscts || false,
            xon: this.serialConfig.xon || false,
            xoff: this.serialConfig.xoff || false,
            xany: this.serialConfig.xany || false
        };
    }

    // Get parser information
    getParserInfo() {
        return {
            name: this.constructor.name,
            serialConfig: this.getSerialConfig(),
            features: [
                'unknown_line_preservation',
                'data_capture'
            ]
        };
    }
}

module.exports = BasePOSParser;
