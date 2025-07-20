const fs = require('fs');
const path = require('path');
const VerifoneCommanderParser = require('../src/parsers/VerifoneCommanderParser');
const Sams4sPOSParser = require('../src/parsers/Sams4sPOSParser');

// Load the actual configuration
const actualConfig = require('../config/micromanager.json');
const verifoneConfig = actualConfig.posTypes.verifone_commander;
const sam4sConfig = actualConfig.posTypes.sams4s;

// Load test data
const testDataPath = path.join(__dirname, 'ascii_output_chunk02.txt');
const testLines = fs.readFileSync(testDataPath, 'utf8')
  .split('\n')
  .filter(line => {
    const cleanLine = line.trim();
    return cleanLine && 
           !cleanLine.startsWith('#') && 
           !cleanLine.startsWith('[') &&
           !cleanLine.includes('Raw Serial Data') &&
           cleanLine !== 'ASCII';
  })
  .slice(0, 10); // Test first 10 lines

console.log('=== PARSER MISLABELING INVESTIGATION ===\n');

// Initialize both parsers
const verifoneParser = new VerifoneCommanderParser(verifoneConfig);
const sam4sParser = new Sams4sPOSParser(sam4sConfig);

console.log('Testing sample lines with both parsers...\n');

testLines.forEach((rawLine, index) => {
  console.log(`--- LINE ${index + 1} ---`);
  console.log(`Raw: ${rawLine.substring(0, 80)}...`);
  
  try {
    // Test with Verifone parser
    const verifoneResult = verifoneParser.extractTransactionData(rawLine);
    console.log('VERIFONE PARSER:');
    console.log(`  - Matched patterns: ${verifoneResult.matchedPatterns?.length || 0}`);
    console.log(`  - Description: ${verifoneResult.description || 'null'}`);
    console.log(`  - Amount: ${verifoneResult.amount || 'null'}`);
    console.log(`  - Confidence: ${verifoneResult.confidenceScore || 0}%`);
    
    // Test with SAM4S parser
    const sam4sResult = sam4sParser.extractTransactionData(rawLine);
    console.log('SAM4S PARSER:');
    console.log(`  - Matched patterns: ${sam4sResult.matchedPatterns?.length || 0}`);
    console.log(`  - Description: ${sam4sResult.description || 'null'}`);
    console.log(`  - Amount: ${sam4sResult.amount || 'null'}`);
    console.log(`  - Confidence: ${sam4sResult.confidenceScore || 0}%`);
    
    // Compare results
    const verifoneScore = verifoneResult.confidenceScore || 0;
    const sam4sScore = sam4sResult.confidenceScore || 0;
    
    if (sam4sScore > verifoneScore) {
      console.log('🚨 SAM4S PARSER PERFORMED BETTER!');
    } else if (verifoneScore > sam4sScore) {
      console.log('✅ Verifone parser performed better');
    } else {
      console.log('⚖️  Both parsers performed equally');
    }
    
  } catch (error) {
    console.log(`❌ Error testing line: ${error.message}`);
  }
  
  console.log('');
});

console.log('=== INVESTIGATION COMPLETE ===');
