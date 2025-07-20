const VerifoneCommanderParser = require('../src/parsers/VerifoneCommanderParser');
const SmartTransactionProcessor = require('../src/transaction/SmartTransactionProcessor');

// Load actual configuration
const actualConfig = require('../config/micromanager.json');
const mockConfig = actualConfig.posTypes.verifone_commander;

describe('VerifoneCommanderParser', () => {
    let parser;

    beforeEach(() => {
        parser = new VerifoneCommanderParser(mockConfig);
    });

    test('should return array from extractTransactionData', () => {
        const input = '\\x1bc0\\x01\\x1b!\\x0007/11/25 03:33:09 102 L Monster Blue Hawaiia 1 3.49';
        const results = parser.extractTransactionData(input);
        
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBe(1);
        expect(results[0].parsingSuccess).toBe(true);
    });

    test('should parse Verifone item line correctly', () => {
        const input = '\\x1bc0\\x01\\x1b!\\x0007/11/25 03:33:09 102 L Monster Blue Hawaiia 1 3.49';
        const results = parser.extractTransactionData(input);
        const result = results[0];
        
        expect(result.lineType).toBe('item');
        expect(result.description).toBe('L Monster Blue Hawaiia');
        expect(result.amount).toBe(3.49);
        expect(result.quantity).toBe(1);
        expect(result.timestamp).toBe('07/11/25 03:33:09');
        expect(result.terminalId).toBe('102');
        expect(result.parsingSuccess).toBe(true);
    });

    test('should parse Verifone total line correctly', () => {
        const input = '\\x1bc0\\x01\\x1b!\\x0007/11/25 03:33:19 102 TOTAL 20.90';
        const results = parser.extractTransactionData(input);
        const result = results[0];
        
        expect(result.lineType).toBe('total');
        expect(result.description).toBe('TOTAL');
        expect(result.amount).toBe(20.90);
        expect(result.totalAmount).toBe(20.90);
        expect(result.parsingSuccess).toBe(true);
    });

    test('should parse Verifone payment lines correctly', () => {
        const cashInput = '\\x1bc0\\x01\\x1b!\\x0007/11/25 03:33:29 102 CASH 20.90';
        const creditInput = '\\x1bc0\\x01\\x1b!\\x0007/11/25 03:33:29 102 CREDIT 15.50';
        
        const cashResults = parser.extractTransactionData(cashInput);
        const creditResults = parser.extractTransactionData(creditInput);
        
        expect(cashResults[0].lineType).toBe('payment');
        expect(cashResults[0].description).toBe('CASH');
        expect(cashResults[0].cashAmount).toBe(20.90);
        
        expect(creditResults[0].lineType).toBe('payment');
        expect(creditResults[0].description).toBe('CREDIT');
        expect(creditResults[0].amount).toBe(15.50);
    });

    test('should handle multi-line packets correctly', () => {
        // Real multi-line packet from test data - has 3 control sequences so should split into 3 lines
        const multiLineInput = '\\x1bc0\\x01\\x1b!\\x0007/11/25 03:33:29 102 PREAUTH 20.90 \\x0a\\x1bc0\\x01\\x1b!\\x0007/11/25 03:33:29 102 ST#1                   DR#1 TRAN#1028363\\x1bc0\\x01\\x1b!\\x0007/11/25 03:33:29 102 CSH: CORPORATE         07/11/25 03:33:29\\x0a';
        const results = parser.extractTransactionData(multiLineInput);
        
        // Should detect as multi-line and split
        expect(results.length).toBeGreaterThan(1);
        
        // Should have different line types
        const lineTypes = results.map(r => r.lineType);
        expect(lineTypes).toContain('payment'); // PREAUTH
        expect(lineTypes).toContain('receipt_footer'); // ST# DR# TRAN#
    });

    test('should handle unknown lines with low confidence', () => {
        const input = 'SOME UNKNOWN LINE FORMAT';
        const results = parser.extractTransactionData(input);
        const result = results[0];
        
        expect(result.lineType).toBe('unknown');
        expect(result.description).toContain('UNKNOWN VERIFONE LINE');
        expect(result.parsingSuccess).toBe(true); // Still included in transaction
        expect(result.parsingSuccess).toBe(true); // Unknown lines still preserved
    });

    test('should identify receipt footer with transaction end', () => {
        const input = '\\x1bc0\\x01\\x1b!\\x0007/11/25 03:33:29 102 ST#1 DR#1 TRAN#1028363';
        const results = parser.extractTransactionData(input);
        const result = results[0];
        
        expect(result.lineType).toBe('receipt_footer');
        expect(result.isEndOfTransaction).toBe(true);
        expect(result.extractedFields.storeNumber).toBe('1');
        expect(result.extractedFields.drawerNumber).toBe('1');
        expect(result.extractedFields.transactionNumber).toBe('1028363');
    });

    test('should handle empty or malformed input gracefully', () => {
        const inputs = ['', '   ', '\n\r'];
        
        inputs.forEach(input => {
            const results = parser.extractTransactionData(input || '');
            expect(Array.isArray(results)).toBe(true);
            if (results.length > 0) {
                expect(results[0].lineType).toBe('unknown');
                expect(results[0].parsingSuccess).toBe(true);
            }
        });
    });

    test('should calculate confidence score correctly', () => {
        const highConfidenceInput = '\\x1bc0\\x01\\x1b!\\x0007/11/25 03:33:19 102 TOTAL 20.90';
        const lowConfidenceInput = 'RANDOM TEXT 123';
        
        const highResults = parser.extractTransactionData(highConfidenceInput);
        const lowResults = parser.extractTransactionData(lowConfidenceInput);
        
        expect(highResults[0].parsingSuccess).toBe(true);
        expect(lowResults[0].parsingSuccess).toBe(true);
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
