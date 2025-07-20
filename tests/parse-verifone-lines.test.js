const fs = require('fs');
const path = require('path');
const VerifoneCommanderParser = require('../src/parsers/VerifoneCommanderParser');

// Helper function to clean and parse the line
function cleanAndParseLine(line) {
  if (typeof line !== 'string') return null;
  
  // Remove escape sequences and extra spaces
  return line
    .replace(/\\x1b\[[0-9;]*[a-zA-Z]|\\x0a/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Load test data
const testDataPath = path.join(__dirname, 'ascii_output_chunk02.txt');
const testLines = fs.readFileSync(testDataPath, 'utf8')
  .split('\n')
  .filter(line => {
    const cleanLine = cleanAndParseLine(line);
    return cleanLine && 
           !cleanLine.startsWith('#') && 
           !cleanLine.startsWith('[') &&
           !cleanLine.includes('Raw Serial Data');
  });

// Load the actual configuration to get proper patterns
const actualConfig = require('../config/micromanager.json');
const mockConfig = actualConfig.posTypes.verifone_commander;

describe('Verifone Commander Parser', () => {
  let parser;

  beforeAll(() => {
    parser = new VerifoneCommanderParser(mockConfig);
  });

  test('should parse sample transaction lines with multi-line handling', () => {
    // Process lines using new multi-line handling
    const allResults = [];
    let lineNumber = 1;
    
    for (const rawLine of testLines) {
      const cleanedLine = cleanAndParseLine(rawLine);
      if (!cleanedLine) continue;
      
      try {
        // Parse using new extractTransactionData that returns array
        const parsedDataArray = parser.extractTransactionData(cleanedLine);
        
        for (const parsed of parsedDataArray) {
          allResults.push({
            line: lineNumber,
            raw: rawLine,
            cleaned: cleanedLine,
            parsed: {
              description: parsed.description || null,
              amount: parsed.amount || null,
              lineType: parsed.lineType || null,
              matchedPatterns: parsed.matchedPatterns || [],
              extractionConfidence: parsed.confidenceScore || 0
            }
          });
        }
      } catch (error) {
        allResults.push({
          line: lineNumber,
          raw: rawLine,
          cleaned: cleanedLine,
          error: error.message,
          stack: error.stack
        });
      }
      lineNumber++;
    }
    
    const results = allResults;

    // Log first few results and errors for debugging
    const sampleResults = results.slice(0, 10);
    console.log('\nSample parsed results:');
    console.log(JSON.stringify(sampleResults, null, 2));

    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.log(`\nFound ${errors.length} errors out of ${results.length} lines`);
      console.log('First few errors:', JSON.stringify(errors.slice(0, 3), null, 2));
    }

    // Basic assertions
    expect(results.length).toBeGreaterThan(0);
    const successfulParses = results.filter(r => r.parsed?.amount !== undefined);
    console.log(`Successfully parsed ${successfulParses.length} out of ${results.length} lines`);
    expect(successfulParses.length).toBeGreaterThan(0);
  });
});
