const BasePOSParser = require('./BasePOSParser');
const logger = require('../utils/Logger');

class VerifoneCommanderParser extends BasePOSParser {
    constructor(posConfig) {
        super(posConfig);
        this.posType = 'verifone_commander';
        
        // Define Verifone-specific regex patterns based on actual data format
        // Note: The data has escaped sequences like \\x1bc0 (literal backslashes)
        this.verifonePatterns = {
            // Main line format: \x1bc0\x01\x1b!\x00MM/DD/YY HH:MM:SS TTT DESCRIPTION QTY AMOUNT \x0a
            itemLine: /^\\x1bc0\\x01\\x1b!\\x00(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(\d+)\s+(.+?)\s+(\d+)\s+([\d\.]+)\s*$/,
            totalLine: /^\\x1bc0\\x01\\x1b!\\x00(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(\d+)\s+TOTAL\s+([\d\.]+)\s*$/,
            cashLine: /^\\x1bc0\\x01\\x1b!\\x00(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(\d+)\s+CASH\s+([\d\.]+)\s*$/,
            creditLine: /^\\x1bc0\\x01\\x1b!\\x00(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(\d+)\s+CREDIT\s+([\d\.]+)\s*$/,
            debitLine: /^\\x1bc0\\x01\\x1b!\\x00(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(\d+)\s+DEBIT\s+([\d\.]+)\s*$/,
            preAuthLine: /^\\x1bc0\\x01\\x1b!\\x00(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(\d+)\s+PREAUTH\s+([\d\.]+)\s*$/,
            prepayLine: /^\\x1bc0\\x01\\x1b!\\x00(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(\d+)\s+(.+?)\s+(\d+)\s+([\d\.]+)\s*$/,
            transactionLine: /Trans#(\d+)/,
            receiptFooter: /ST#(\d+)\s+DR#(\d+)\s+TRAN#(\d+)/
        };
        
        logger.info('New Verifone Commander Parser initialized', {
            patterns: Object.keys(this.verifonePatterns),
            serialConfig: this.getSerialConfig()
        });
    }

    // Detect if this packet contains multiple logical lines
    isMultiLinePacket(rawPacket) {
        const controlSeq = '\\x1bc0\\x01\\x1b!\\x00';
        return (rawPacket.match(new RegExp(controlSeq, 'g')) || []).length > 1;
    }

    // Split multi-line packet into individual logical lines
    splitPacketIntoLines(rawPacket) {
        const controlSeq = '\\x1bc0\\x01\\x1b!\\x00';
        return rawPacket.split(controlSeq)
            .filter(part => part.trim().length > 0)
            .map(part => controlSeq + part.trim());
    }

    extractTransactionData(rawPacket) {
        // Handle multi-line packets by splitting and parsing each logical line
        if (this.isMultiLinePacket(rawPacket)) {
            const logicalLines = this.splitPacketIntoLines(rawPacket);
            const results = [];
            
            for (const line of logicalLines) {
                this.totalLinesProcessed++; // BasePOSParser stats tracking
                const parsed = this.parseSingleLine(line);
                
                // Track stats per logical line
                if (!parsed.parsingSuccess) {
                    this.trackUnknownPattern(line);
                    this.unknownLinesCount++;
                }
                
                results.push(parsed);
            }
            return results;
        } else {
            // Single line - parse directly and return as array for consistency
            this.totalLinesProcessed++;
            const parsed = this.parseSingleLine(rawPacket);
            
            if (!parsed.parsingSuccess) {
                this.trackUnknownPattern(rawPacket);
                this.unknownLinesCount++;
            }
            
            return [parsed];
        }
    }

    // Parse individual logical line (extracted from original extractTransactionData logic)
    parseSingleLine(cleanedData) {
        const result = {
            lineType: null,
            description: null,
            amount: null,
            quantity: null,
            timestamp: null,
            terminalId: null,
            transactionNumber: null,
            totalAmount: null,
            cashAmount: null,
            isEndOfTransaction: false,
            parsingSuccess: false
        };

        try {
            // Try to match against each Verifone pattern
            let matched = false;

            // Check for item lines (includes any prefix as part of description)
            const itemMatch = cleanedData.match(this.verifonePatterns.itemLine);
            if (itemMatch) {
                result.timestamp = `${itemMatch[1]} ${itemMatch[2]}`;
                result.terminalId = itemMatch[3];
                result.description = itemMatch[4].trim(); // Full description including any prefix
                result.quantity = parseInt(itemMatch[5]);
                result.amount = parseFloat(itemMatch[6]);
                result.lineType = 'item';
                result.parsingSuccess = true;
                matched = true;
            }

            // Check for TOTAL lines
            if (!matched) {
                const totalMatch = cleanedData.match(this.verifonePatterns.totalLine);
                if (totalMatch) {
                    result.timestamp = `${totalMatch[1]} ${totalMatch[2]}`;
                    result.terminalId = totalMatch[3];
                    result.amount = parseFloat(totalMatch[4]);
                    result.totalAmount = result.amount;
                    result.lineType = 'total';
                    result.description = 'TOTAL';
                    result.parsingSuccess = true;
                    matched = true;
                }
            }

            // Check for CASH lines
            if (!matched) {
                const cashMatch = cleanedData.match(this.verifonePatterns.cashLine);
                if (cashMatch) {
                    result.timestamp = `${cashMatch[1]} ${cashMatch[2]}`;
                    result.terminalId = cashMatch[3];
                    result.amount = parseFloat(cashMatch[4]);
                    result.cashAmount = result.amount;
                    result.lineType = 'payment';
                    result.description = 'CASH';
                    result.parsingSuccess = true;
                    matched = true;
                }
            }

            // Check for CREDIT lines
            if (!matched) {
                const creditMatch = cleanedData.match(this.verifonePatterns.creditLine);
                if (creditMatch) {
                    result.timestamp = `${creditMatch[1]} ${creditMatch[2]}`;
                    result.terminalId = creditMatch[3];
                    result.amount = parseFloat(creditMatch[4]);
                    result.lineType = 'payment';
                    result.description = 'CREDIT';
                    result.parsingSuccess = true;
                    matched = true;
                }
            }

            // Check for DEBIT lines
            if (!matched) {
                const debitMatch = cleanedData.match(this.verifonePatterns.debitLine);
                if (debitMatch) {
                    result.timestamp = `${debitMatch[1]} ${debitMatch[2]}`;
                    result.terminalId = debitMatch[3];
                    result.amount = parseFloat(debitMatch[4]);
                    result.lineType = 'payment';
                    result.description = 'DEBIT';
                    result.parsingSuccess = true;
                    matched = true;
                }
            }

            // Check for PREAUTH lines
            if (!matched) {
                const preAuthMatch = cleanedData.match(this.verifonePatterns.preAuthLine);
                if (preAuthMatch) {
                    result.timestamp = `${preAuthMatch[1]} ${preAuthMatch[2]}`;
                    result.terminalId = preAuthMatch[3];
                    result.amount = parseFloat(preAuthMatch[4]);
                    result.lineType = 'payment';
                    result.description = 'PREAUTH';
                    result.parsingSuccess = true;
                    matched = true;
                }
            }

            // Check for PREPAY lines (different from PREAUTH)
            if (!matched) {
                const prepayMatch = cleanedData.match(this.verifonePatterns.prepayLine);
                if (prepayMatch) {
                    result.timestamp = `${prepayMatch[1]} ${prepayMatch[2]}`;
                    result.terminalId = prepayMatch[3];
                    result.description = prepayMatch[4].trim();
                    result.quantity = parseInt(prepayMatch[5]);
                    result.amount = parseFloat(prepayMatch[6]);
                    result.lineType = 'prepay';
                    result.parsingSuccess = true;
                    matched = true;
                }
            }

            // Check for transaction number
            if (!matched) {
                const transMatch = cleanedData.match(this.verifonePatterns.transactionLine);
                if (transMatch) {
                    result.transactionNumber = transMatch[1];
                    result.lineType = 'transaction_start';
                    result.description = `Trans#${result.transactionNumber}`;
                    result.parsingSuccess = true;
                    matched = true;
                }
            }

            // Check for receipt footer (end of transaction)
            if (!matched) {
                const footerMatch = cleanedData.match(this.verifonePatterns.receiptFooter);
                if (footerMatch) {
                    result.isEndOfTransaction = true;
                    result.lineType = 'receipt_footer';
                    result.description = `ST#${footerMatch[1]} DR#${footerMatch[2]} TRAN#${footerMatch[3]}`;
                    result.parsingSuccess = true;
                    matched = true;
                }
            }

            // Handle unknown lines - still include them in transaction with 'unknown' type
            if (!matched) {
                result.lineType = 'unknown';
                result.description = `UNKNOWN VERIFONE LINE: ${cleanedData}`;
                result.parsingSuccess = true; // Include in transaction
            }

        } catch (error) {
            result.lineType = 'unknown';
            result.description = `PARSE ERROR: ${error.message}`;
            result.parsingSuccess = false;
        }

        return result;
    }

    calculateConfidence(result) {
        let confidence = 0;
        
        // Base confidence for any match
        if (result.matchedPatterns.length > 0) {
            confidence += 50;
        }
        
        // Bonus for extracting amount
        if (result.amount !== null && !isNaN(result.amount)) {
            confidence += 30;
        }
        
        // Bonus for extracting description
        if (result.description && result.description.length > 0) {
            confidence += 20;
        }
        
        return Math.min(100, confidence);
    }

    // Get parser information
    getParserInfo() {
        return {
            name: this.constructor.name,
            posType: this.posType,
            patterns: Object.keys(this.verifonePatterns),
            serialConfig: this.getSerialConfig(),
            features: [
                'verifone_specific_parsing',
                'item_line_extraction',
                'payment_line_extraction',
                'transaction_tracking',
                'confidence_scoring'
            ]
        };
    }
}

module.exports = VerifoneCommanderParser;
