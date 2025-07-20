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
        this.totalLinesProcessed++;
        
        const result = {
            transactionNumber: null,
            totalAmount: null,
            cashAmount: null,
            isEndOfTransaction: false,
            rawData: cleanedData,
            extractedFields: {},
            
            // NEW: Track parsing success
            matchedPatterns: [],
            unmatchedContent: cleanedData,
            parsingSuccess: false,
            confidenceScore: 0
        };

        try {
            let hasAnyMatch = false;
            
            // Process all configured patterns dynamically
            for (const [fieldName, regex] of Object.entries(this.patterns)) {
                const match = cleanedData.match(regex);
                if (match) {
                    hasAnyMatch = true;
                    const value = this.processPatternMatch(fieldName, match);
                    result.extractedFields[fieldName] = value;
                    result.matchedPatterns.push(fieldName);
                    
                    // Update pattern statistics
                    this.patternStats[fieldName].matches++;
                    this.patternStats[fieldName].lastMatch = new Date().toISOString();
                    
                    // Map to standard fields for backwards compatibility
                    this.mapToStandardFields(result, fieldName, value);
                }
            }

            // Calculate confidence score
            result.confidenceScore = this.calculateConfidenceScore(result, cleanedData);
            result.parsingSuccess = hasAnyMatch;

            // Track unknown patterns for future analysis
            if (!hasAnyMatch) {
                this.trackUnknownPattern(cleanedData);
                this.unknownLinesCount++;
                
                // Try to extract basic information even from unknown lines
                this.extractBasicInformation(cleanedData, result);
            }

            logger.parser('Transaction data extracted by BasePOSParser', {
                parser: this.constructor.name,
                matchedPatterns: result.matchedPatterns,
                confidenceScore: result.confidenceScore,
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

    trackUnknownPattern(cleanedData) {
        // Create a simplified pattern for analysis
        const normalizedPattern = cleanedData
            .replace(/\d+/g, 'NUM')
            .replace(/\d+\.\d{2}/g, 'MONEY')
            .replace(/[^\w\s]/g, 'PUNCT')
            .trim();

        if (this.unknownPatterns.has(normalizedPattern)) {
            const count = this.unknownPatterns.get(normalizedPattern);
            this.unknownPatterns.set(normalizedPattern, count + 1);
        } else {
            this.unknownPatterns.set(normalizedPattern, 1);
        }

        logger.parser('Unknown pattern tracked', {
            parser: this.constructor.name,
            originalLine: cleanedData,
            normalizedPattern,
            occurrenceCount: this.unknownPatterns.get(normalizedPattern)
        });
    }

    extractBasicInformation(cleanedData, result) {
        // Try to extract basic info even from unknown lines
        
        // Look for currency amounts
        const currencyMatch = cleanedData.match(/\$?(\d+\.\d{2})/);
        if (currencyMatch) {
            result.extractedFields.possibleAmount = parseFloat(currencyMatch[1]);
            result.description = `UNKNOWN LINE WITH AMOUNT: ${cleanedData}`;
        }

        // Look for common POS keywords
        const keywords = ['TOTAL', 'TAX', 'CASH', 'CREDIT', 'VOID', 'REFUND', 'ITEM', 'QTY'];
        const foundKeywords = keywords.filter(keyword => 
            cleanedData.toUpperCase().includes(keyword)
        );
        
        if (foundKeywords.length > 0) {
            result.extractedFields.detectedKeywords = foundKeywords;
            result.description = `UNKNOWN LINE WITH KEYWORDS [${foundKeywords.join(', ')}]: ${cleanedData}`;
        }

        // If no patterns matched, create a generic description
        if (!result.description) {
            result.description = `UNKNOWN POS LINE: ${cleanedData}`;
        }

        // Mark for analysis
        result.needsAnalysis = true;
        result.analysisPriority = this.determineAnalysisPriority(cleanedData, foundKeywords);
    }

    determineAnalysisPriority(line, keywords) {
        if (keywords.length > 0) return 'high';
        if (/\d+\.\d{2}/.test(line)) return 'medium';
        return 'low';
    }

    calculateConfidenceScore(result, cleanedData) {
        if (result.matchedPatterns.length === 0) return 0;
        
        const totalPatterns = Object.keys(this.patterns).length;
        const matchedCount = result.matchedPatterns.length;
        
        // Base score from pattern matches
        let score = (matchedCount / totalPatterns) * 100;
        
        // Bonus for important patterns
        const importantPatterns = ['total', 'endTransaction', 'transactionNumber'];
        const importantMatches = result.matchedPatterns.filter(p => 
            importantPatterns.includes(p)
        ).length;
        
        score += importantMatches * 10;
        
        return Math.min(100, Math.round(score));
    }

    processPatternMatch(fieldName, match) {
        // Handle different pattern types with smart type conversion
        switch (fieldName) {
            case 'total':
            case 'cash':
            case 'check':
            case 'change':
            case 'discount':
            case 'tax':
                return parseFloat(match[1]);
                
            case 'endTransaction':
            case 'startTransaction':
            case 'voidTransaction':
                return true;
                
            case 'itemCount':
            case 'receiptNumber':
            case 'cashierID':
                return parseInt(match[1]);
                
            case 'timestamp':
                // Handle multi-capture patterns
                return match.slice(1);
                
            default:
                return match[1] || match[0];
        }
    }

    mapToStandardFields(result, fieldName, value) {
        // Map extracted fields to standard result structure for backwards compatibility
        switch (fieldName) {
            case 'transactionNumber':
                result.transactionNumber = value;
                break;
            case 'total':
                result.totalAmount = value;
                break;
            case 'cash':
                result.cashAmount = value;
                break;
            case 'endTransaction':
                result.isEndOfTransaction = value;
                break;
        }
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

    // NEW: Get parsing statistics for analysis
    getParsingStats() {
        const successRate = this.totalLinesProcessed > 0 ? 
            ((this.totalLinesProcessed - this.unknownLinesCount) / this.totalLinesProcessed * 100).toFixed(2) : 0;

        return {
            totalLinesProcessed: this.totalLinesProcessed,
            unknownLinesCount: this.unknownLinesCount,
            successRate: `${successRate}%`,
            patternStats: this.patternStats,
            topUnknownPatterns: Array.from(this.unknownPatterns.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10) // Top 10 most common unknown patterns
        };
    }

    // NEW: Export unknown patterns for analysis
    exportUnknownPatterns() {
        return {
            parser: this.constructor.name,
            timestamp: new Date().toISOString(),
            stats: this.getParsingStats(),
            unknownPatterns: Object.fromEntries(this.unknownPatterns),
            recommendations: this.generateRecommendations()
        };
    }

    generateRecommendations() {
        const recommendations = [];
        
        // Check for patterns that might need new regex rules
        for (const [pattern, count] of this.unknownPatterns.entries()) {
            if (count >= 5) { // If seen 5+ times, probably needs a rule
                recommendations.push({
                    pattern,
                    count,
                    priority: count >= 20 ? 'high' : 'medium',
                    suggestion: `Consider adding regex pattern for: ${pattern}`
                });
            }
        }

        return recommendations;
    }

    // Get parser information
    getParserInfo() {
        return {
            name: this.constructor.name,
            patterns: Object.keys(this.patterns),
            serialConfig: this.getSerialConfig(),
            stats: this.getParsingStats(),
            features: [
                'unknown_line_capture',
                'pattern_analysis',
                'confidence_scoring',
                'data_preservation'
            ]
        };
    }
}

module.exports = BasePOSParser;
