const VerifoneCommanderParser = require('../src/parsers/VerifoneCommanderParser');
const SmartTransactionProcessor = require('../src/transaction/SmartTransactionProcessor');

describe('VerifoneCommanderParser', () => {
    let parser;
    let mockConfig;

    beforeEach(() => {
        mockConfig = {
            transaction: {
                patterns: {
                    total: '^TOTAL\\s+(\\d+\\.\\d{2})$',
                    cash: '^CASH\\s+(\\d+\\.\\d{2})$',
                    credit: '^CREDIT\\s+(\\d+\\.\\d{2})$',
                    endTransaction: '^(THANK YOU|HAVE A NICE DAY).*$',
                    cashier: '^CASHIER:\\s*(.+)$',
                    lineItem: '^(.+?)\\s+(\\d+\\.\\d{2})$'
                },
                lineStripChars: 0,
                controlCharsSequence: ''
            },
            serial: {
                dataBits: 8,
                stopBits: 1,
                parity: 'none'
            }
        };
        parser = new VerifoneCommanderParser(mockConfig);
    });

    test('should extract total amount correctly', () => {
        const input = 'TOTAL 25.99';
        const result = parser.extractTransactionData(input);
        
        expect(result.totalAmount).toBe(25.99);
        expect(result.parsingSuccess).toBe(true);
        expect(result.matchedPatterns).toContain('total');
    });

    test('should handle unknown lines without crashing', () => {
        const input = 'EMPLOYEE DISCOUNT 15%';
        const result = parser.extractTransactionData(input);
        
        expect(result.parsingSuccess).toBe(false);
        expect(result.description).toContain('UNKNOWN');
        expect(result.needsAnalysis).toBe(true);
        expect(result.analysisPriority).toBe('medium'); // Contains numbers
    });

    test('should identify transaction end patterns', () => {
        const input = 'THANK YOU FOR YOUR VISIT';
        const result = parser.extractTransactionData(input);
        
        expect(result.isEndOfTransaction).toBe(true);
        expect(result.parsingSuccess).toBe(true);
    });

    test('should track unknown patterns for analysis', () => {
        const unknownInputs = [
            'EMPLOYEE DISCOUNT 10%',
            'EMPLOYEE DISCOUNT 15%',
            'EMPLOYEE DISCOUNT 20%'
        ];
        
        unknownInputs.forEach(input => {
            parser.extractTransactionData(input);
        });
        
        const stats = parser.getParsingStats();
        expect(stats.unknownLinesCount).toBe(3);
        expect(stats.topUnknownPatterns.length).toBeGreaterThan(0);
    });

    test('should extract payment breakdown', () => {
        const input = 'CASH 20.00';
        const result = parser.extractTransactionData(input);
        
        expect(result.cashAmount).toBe(20.00);
        expect(result.parsingSuccess).toBe(true);
    });

    test('should handle empty or malformed input gracefully', () => {
        const inputs = ['', null, undefined, '   ', '\n\r'];
        
        inputs.forEach(input => {
            const result = parser.extractTransactionData(input || '');
            expect(result).toBeDefined();
            expect(result.parsingSuccess).toBe(false);
        });
    });

    test('should calculate confidence score correctly', () => {
        const highConfidenceInput = 'TOTAL 25.99';
        const lowConfidenceInput = 'RANDOM TEXT 123';
        
        const highResult = parser.extractTransactionData(highConfidenceInput);
        const lowResult = parser.extractTransactionData(lowConfidenceInput);
        
        expect(highResult.confidenceScore).toBeGreaterThan(lowResult.confidenceScore);
    });
});

describe('SmartTransactionProcessor', () => {
    let processor;
    let mockConfig;

    beforeEach(() => {
        mockConfig = {
            deviceId: 'test-device',
            supabase: {
                url: 'https://test.supabase.co',
                key: 'test-key'
            },
            frigate: {
                baseUrl: 'http://localhost:5000',
                cameraName: 'test_camera'
            },
            backup: {
                logDirectory: './test-logs'
            },
            posType: 'verifone_commander',
            storeId: 'test-store',
            posTerminalId: 'test-terminal'
        };

        // Mock Supabase client
        jest.mock('@supabase/supabase-js', () => ({
            createClient: jest.fn(() => ({
                from: jest.fn(() => ({
                    insert: jest.fn(() => ({
                        select: jest.fn(() => Promise.resolve({ data: {}, error: null }))
                    }))
                }))
            }))
        }));

        processor = new SmartTransactionProcessor(mockConfig);
    });

    test('should process known lines correctly', async () => {
        const rawLine = 'COCA COLA                    2.50';
        const parsedData = {
            description: 'COCA COLA',
            amount: 2.50,
            extractedFields: { lineItem: 'COCA COLA' },
            parsingSuccess: true
        };

        // Mock the sendLineToSupabase method to avoid actual API calls
        processor.sendLineToSupabase = jest.fn().mockResolvedValue(true);

        await processor.processSerialLine(rawLine, parsedData);

        expect(processor.sendLineToSupabase).toHaveBeenCalled();
        expect(processor.activeTransaction).toBeDefined();
    });

    test('should handle unknown lines by preserving them', async () => {
        const rawLine = 'EMPLOYEE DISCOUNT 15%';
        const parsedData = {
            description: 'UNKNOWN POS LINE: EMPLOYEE DISCOUNT 15%',
            extractedFields: {},
            parsingSuccess: false,
            needsAnalysis: true,
            analysisPriority: 'high'
        };

        processor.sendLineToSupabase = jest.fn().mockResolvedValue(true);

        await processor.processSerialLine(rawLine, parsedData);

        expect(processor.sendLineToSupabase).toHaveBeenCalledWith(
            expect.objectContaining({
                line_type: 'unknown',
                needs_analysis: true,
                analysis_priority: 'high',
                raw_line: rawLine
            })
        );
    });

    test('should create orphaned transactions for isolated lines', async () => {
        const rawLine = 'ISOLATED LINE';
        const parsedData = {
            description: 'ISOLATED LINE',
            extractedFields: {},
            parsingSuccess: false
        };

        processor.sendLineToSupabase = jest.fn().mockResolvedValue(true);
        processor.isTransactionStart = jest.fn().mockReturnValue(false);

        await processor.processSerialLine(rawLine, parsedData);

        expect(processor.activeTransaction).toBeDefined();
        expect(processor.activeTransaction.isOrphaned).toBe(true);
    });

    test('should format transaction lines with analysis metadata', () => {
        processor.activeTransaction = {
            id: 'test-transaction-id',
            frigateEventId: 'test-event'
        };

        const parsedData = {
            description: 'TEST LINE',
            amount: 5.00,
            extractedFields: { test: 'value' }
        };
        const rawLine = 'TEST LINE $5.00';

        const result = processor.formatTransactionLine(parsedData, rawLine);

        expect(result).toMatchObject({
            transaction_id: 'test-transaction-id',
            raw_line: rawLine,
            line_length: rawLine.length,
            contains_currency: true,
            contains_numbers: true,
            needs_analysis: false, // Has extracted fields
            parsed_successfully: true
        });
    });

    test('should calculate analysis priority correctly', () => {
        const testCases = [
            { line: 'TOTAL $25.99', expectedPriority: 'high' },
            { line: 'ITEM SCAN 12345', expectedPriority: 'medium' },
            { line: 'RANDOM TEXT', expectedPriority: 'low' }
        ];

        testCases.forEach(({ line, expectedPriority }) => {
            const priority = processor.calculateAnalysisPriority(line, {});
            expect(priority).toBe(expectedPriority);
        });
    });
});

describe('Integration Tests', () => {
    test('should process a complete transaction flow', async () => {
        const mockConfig = {
            deviceId: 'integration-test',
            supabase: { url: 'test', key: 'test' },
            frigate: { baseUrl: 'test', cameraName: 'test' },
            backup: { logDirectory: './test-logs' },
            posTypes: {
                verifone_commander: {
                    transaction: {
                        patterns: {
                            lineItem: '^(.+?)\\s+(\\d+\\.\\d{2})$',
                            total: '^TOTAL\\s+(\\d+\\.\\d{2})$',
                            endTransaction: '^THANK YOU.*$'
                        }
                    },
                    serial: {}
                }
            },
            posType: 'verifone_commander'
        };

        const processor = new SmartTransactionProcessor(mockConfig);
        const parser = new VerifoneCommanderParser(mockConfig.posTypes.verifone_commander);

        // Mock external dependencies
        processor.sendLineToSupabase = jest.fn().mockResolvedValue(true);
        processor.createFrigateEvent = jest.fn().mockResolvedValue('test-event-id');
        processor.endFrigateEvent = jest.fn().mockResolvedValue(true);
        processor.sendTransactionToSupabase = jest.fn().mockResolvedValue(true);
        processor.writeToHourlyLog = jest.fn().mockResolvedValue(true);

        // Simulate a complete transaction
        const transactionLines = [
            'COCA COLA                    2.50',
            'EMPLOYEE DISCOUNT 10%',      // Unknown line
            'TAX                          0.25',
            'TOTAL                       2.75',
            'THANK YOU FOR YOUR VISIT'
        ];

        for (const line of transactionLines) {
            const parsedData = parser.extractTransactionData(line);
            await processor.processSerialLine(line, parsedData);
        }

        // Verify all lines were processed
        expect(processor.sendLineToSupabase).toHaveBeenCalledTimes(5);
        
        // Verify transaction was completed
        expect(processor.sendTransactionToSupabase).toHaveBeenCalled();
        expect(processor.activeTransaction).toBeNull();
        
        // Verify unknown line was preserved
        const unknownLineCall = processor.sendLineToSupabase.mock.calls.find(
            call => call[0].raw_line === 'EMPLOYEE DISCOUNT 10%'
        );
        expect(unknownLineCall).toBeDefined();
        expect(unknownLineCall[0].line_type).toBe('unknown');
    });
});
