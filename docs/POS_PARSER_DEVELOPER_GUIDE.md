# POS Parser Developer Guide

## Overview
This guide provides requirements, best practices, and implementation patterns for creating new POS parsers in the Micromanager POS Transaction Processor system. It's based on lessons learned from implementing the Verifone Commander parser.

## Core Requirements

### 1. Parser Architecture
- **Extend BasePOSParser**: All parsers must inherit from `BasePOSParser` for consistency and shared functionality
- **Modular Design**: Each POS system gets its own parser class (e.g., `VerifoneCommanderParser`, `NCRParser`)
- **Self-Contained Logic**: All parsing patterns, rules, and logic are defined within the parser class itself
- **Configuration Independence**: Parsers do not rely on configuration files for parsing logic

### 2. Multi-Line Packet Handling ⭐ **NEW ARCHITECTURE**
**CRITICAL**: Parsers must handle multi-line packets from serial data streams.

#### Multi-Line Detection
Some POS systems send multiple logical lines in a single serial packet. Your parser must:
- **Detect multi-line packets** using control sequences or delimiters
- **Split packets into logical lines** before parsing
- **Return arrays of parsed results** instead of single objects
- **Track statistics per logical line** (not per packet)

```javascript
// Example: Multi-line packet detection
isMultiLinePacket(rawPacket) {
    const controlSeq = '\\x1bc0\\x01\\x1b!\\x00';
    return (rawPacket.match(new RegExp(controlSeq, 'g')) || []).length > 1;
}

// Example: Packet splitting
splitPacketIntoLines(rawPacket) {
    const controlSeq = '\\x1bc0\\x01\\x1b!\\x00';
    return rawPacket.split(controlSeq)
        .filter(part => part.trim().length > 0)
        .map(part => controlSeq + part.trim());
}
```

#### New extractTransactionData Interface
**BREAKING CHANGE**: `extractTransactionData()` now returns **arrays**:
```javascript
// OLD (deprecated):
const result = parser.extractTransactionData(line);

// NEW (required):
const results = parser.extractTransactionData(packet); // Always returns array
for (const result of results) {
    // Process each logical line
}
```

### 3. Output Requirements
Parsers must output data at two levels:

#### A. Individual Line Processing
Each logical line must return a standardized result object:
```javascript
{
  // Core fields (always present)
  lineType: 'item' | 'total' | 'payment' | 'prepay' | 'unknown',
  description: 'Full item/line description',
  amount: 12.34 | null,
  parsingSuccess: true | false,
  confidenceScore: 0-100,
  matchedPatterns: ['patternName1', 'patternName2'],
  
  // Optional extracted fields
  timestamp: '07/11/25 03:33:09',
  terminalId: '102',
  quantity: 1,
  transactionNumber: '1028364',
  
  // Metadata
  extractedFields: { /* structured data */ },
  extractionError: 'error message' | null
}
```

#### B. Transaction-Level Processing
- Group related lines into complete transactions
- Identify transaction boundaries (start/end markers)
- Maintain transaction context across multiple lines
- Support transaction validation and completeness checks

### 4. Line Type Classification
All logical lines must be classified into one of these types:

- **`item`**: Individual products/services with quantities and amounts
- **`total`**: Transaction subtotals, taxes, final totals
- **`payment`**: Payment method lines (cash, credit, debit, preauth, etc.)
- **`prepay`**: Prepaid items (gas, phone cards, etc.)
- **`transaction_start`**: Transaction initiation markers (Trans#123)
- **`receipt_footer`**: Receipt footer with store/drawer/transaction IDs
- **`unknown`**: Unrecognized lines (still included in transaction)

### 4. Unknown Line Handling
- **Always include unknown lines** in transactions
- Set `lineType: 'unknown'`
- Set `parsingSuccess: true` (so they're not filtered out)
- Use low confidence score (e.g., 10)
- Preserve original line content in description
- Format: `"UNKNOWN [PARSER_NAME] LINE: [original_content]"`

## Implementation Checklist

### Phase 1: Setup and Structure
- [ ] Create new parser class extending `BasePOSParser`
- [ ] Add parser to factory method in `src/app.js`
- [ ] Add POS type section to `micromanager.json` (operational settings only)
- [ ] Create test file with real POS data samples
- [ ] Define all parsing patterns within the parser class constructor

### Phase 2: Pattern Development
- [ ] Collect real ASCII/serial data samples from target POS system
- [ ] Analyze data format and identify patterns for:
  - [ ] Item lines (products with quantities/amounts)
  - [ ] Total lines (subtotals, taxes, final amounts)
  - [ ] Payment lines (cash, credit, debit, etc.)
  - [ ] Transaction boundaries (start/end markers)
  - [ ] Special lines (prepay, corrections, etc.)
- [ ] Create regex patterns that match actual data format
- [ ] **Avoid POS-specific item type parsing** (L/H/G prefixes should be part of description)

### Phase 3: Core Parser Methods
Implement these required methods:

#### `constructor(posConfig)`
```javascript
constructor(posConfig) {
    super(posConfig);
    this.posType = 'your_pos_type';
    
    // Define POS-specific regex patterns
    this.patterns = {
        itemLine: /your_item_pattern/,
        totalLine: /your_total_pattern/,
        // ... other patterns
    };
}
```

#### `extractTransactionData(rawPacket)` ⭐ **NEW MULTI-LINE INTERFACE**
```javascript
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
        return results; // ALWAYS returns array
    } else {
        // Single line - parse directly and return as array for consistency
        this.totalLinesProcessed++;
        const parsed = this.parseSingleLine(rawPacket);
        
        if (!parsed.parsingSuccess) {
            this.trackUnknownPattern(rawPacket);
            this.unknownLinesCount++;
        }
        
        return [parsed]; // ALWAYS returns array
    }
}

// Parse individual logical line (extracted from original extractTransactionData logic)
parseSingleLine(cleanedData) {
    const result = {
        lineType: null,
        description: null,
        amount: null,
        parsingSuccess: false,
        confidenceScore: 0,
        matchedPatterns: [],
        extractedFields: {},
        // ... other required fields
    };

    // Try patterns in order of specificity
    // Use early returns to avoid multiple matches
    // Always set lineType for matched patterns
    // Handle unknown lines at the end
    
    return result;
}
```

### Phase 4: Pattern Matching Strategy
- **Order patterns by specificity**: Most specific patterns first
- **Use early returns**: Return immediately after successful match to avoid conflicts
- **Set confidence scores**:
  - 100: Perfect pattern match with all expected fields
  - 50-90: Partial match or secondary patterns
  - 10: Unknown lines (still valid for inclusion)
  - 0: Parsing errors (should be rare)

### Phase 5: App.js Integration ⭐ **UPDATED FOR MULTI-LINE**
The main application now handles arrays of parsed results:

```javascript
// In app.js handleSerialData() method:
const parsedDataArray = this.posParser.extractTransactionData(cleanedData);

// Process each parsed result from multi-line packets
for (const parsedData of parsedDataArray) {
    // Add line-level metadata
    parsedData.description = parsedData.description || cleanedData.trim();
    parsedData.timestamp = new Date().toISOString();
    parsedData.rawLine = rawLine;

    // Process through smart transaction processor
    await this.transactionProcessor.processSerialLine(rawLine, parsedData);
}
```

**Key Changes:**
- App.js now loops through arrays of parsed results
- Each logical line is processed individually by SmartTransactionProcessor
- Multi-line packets result in multiple Supabase rows (more granular data)
- Transaction boundaries and analytics work at the logical line level

### Phase 6: Testing and Validation
- [ ] Create comprehensive test suite with real data
- [ ] Test multi-line packet detection and splitting
- [ ] Test all line types and edge cases
- [ ] Validate confidence scoring accuracy
- [ ] Test unknown line handling
- [ ] Verify transaction boundary detection
- [ ] Performance test with large data sets
- [ ] Test array return interface compatibility

## Migration Guide: Old → New Architecture

### Breaking Changes Summary
1. **`extractTransactionData()` now returns arrays** instead of single objects
2. **Multi-line packets are automatically split** into logical lines
3. **Statistics tracking happens per logical line** instead of per packet
4. **New line types added**: `transaction_start`, `receipt_footer`
5. **App.js integration updated** to handle arrays of results

### Migration Checklist for Existing Parsers
- [ ] Update `extractTransactionData()` to return arrays
- [ ] Implement `isMultiLinePacket()` and `splitPacketIntoLines()` methods
- [ ] Move parsing logic to `parseSingleLine()` method
- [ ] Add multi-line packet detection for your POS format
- [ ] Update tests to expect arrays instead of single objects
- [ ] Verify statistics tracking works with logical lines
- [ ] Test with real multi-line data from your POS system

### Example Migration: Simple Parser
```javascript
// OLD (deprecated):
extractTransactionData(cleanedData) {
    const result = { /* parsing logic */ };
    return result; // Single object
}

// NEW (required):
extractTransactionData(rawPacket) {
    // Check for multi-line packets (implement for your POS format)
    if (this.isMultiLinePacket(rawPacket)) {
        const lines = this.splitPacketIntoLines(rawPacket);
        return lines.map(line => this.parseSingleLine(line));
    }
    return [this.parseSingleLine(rawPacket)]; // Always return array
}

parseSingleLine(cleanedData) {
    const result = { /* same parsing logic as before */ };
    return result;
}
```

## Pattern Development Best Practices

### 1. Use Real Data
- Always start with actual POS output, not documentation
- Test with multiple transaction types and scenarios
- Include edge cases (corrections, voids, prepays)

### 2. Regex Pattern Guidelines
```javascript
// Good: Specific, matches actual format
itemLine: /^\\x1bc0\\x01\\x1b!\\x00(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(\d+)\s+(.+?)\s+(\d+)\s+([\d\.]+)\s*$/

// Bad: Too generic, will cause false matches
itemLine: /(.+)\s+([\d\.]+)/
```

### 3. Field Extraction
- Extract all available structured data (timestamps, IDs, quantities)
- Don't parse POS-specific prefixes as separate item types
- Preserve original formatting in descriptions when useful
- Handle decimal amounts correctly

### 4. Error Handling
```javascript
try {
    // Pattern matching logic
    const match = cleanedData.match(this.patterns.itemLine);
    if (match) {
        result.amount = parseFloat(match[6]);
        result.quantity = parseInt(match[5]);
        // ... other extractions
        result.parsingSuccess = true;
        result.confidenceScore = this.calculateConfidence(result);
        return result;
    }
} catch (error) {
    result.extractionError = error.message;
    result.parsingSuccess = false;
    return result;
}
```

## Configuration Template

Add to `micromanager.json`:
```json
{
  "posTypes": {
    "your_pos_type": {
      "name": "Your POS System Name",
      "version": "1.0.0",
      "serial": {
        "baudRate": 9600,
        "dataBits": 8,
        "parity": "none",
        "stopBits": 1
      },
      "transaction": {
        "patterns": {
          "itemLine": "regex_pattern_here",
          "totalLine": "regex_pattern_here"
        },
        "controlCharsSequence": "\\x1bc0\\x01",
        "transactionStartMarkers": ["Trans#"],
        "transactionEndMarkers": ["ST#", "DR#", "TRAN#"]
      }
    }
  }
}
```

## Testing Requirements

### Test File Structure
```javascript
// tests/parse-[pos-type]-lines.test.js
describe('[POS Type] Parser', () => {
  test('should parse sample transaction lines', async () => {
    // Load real POS data
    // Test individual line parsing
    // Verify line types and confidence scores
    // Check unknown line handling
    // Validate transaction boundaries
  });
});
```

### Test Data Requirements
- Minimum 100+ real POS lines for comprehensive testing
- Include all transaction types (cash, credit, debit, prepay)
- Test error conditions and corrections
- Include unknown/unrecognized lines
- Test transaction boundary scenarios

## Integration Points

### App.js Factory Method
```javascript
initializePOSParser() {
    const posConfig = this.config.posTypes[this.config.posType];
    
    switch (this.config.posType) {
        case 'your_pos_type':
            this.posParser = new YourPOSParser(posConfig);
            break;
        // ... other cases
        default:
            throw new Error(`Unsupported POS type: ${this.config.posType}`);
    }
}
```

### Transaction Processor Integration
- Parser output feeds into `SmartTransactionProcessor`
- Line-level results are buffered and grouped into transactions
- Transaction boundaries trigger processing and storage
- Unknown lines are preserved for analysis and debugging

## Performance Considerations

- **Regex Optimization**: Use specific patterns to avoid backtracking
- **Early Returns**: Exit pattern matching as soon as a match is found
- **Memory Management**: Don't store large amounts of historical data in parser
- **Logging**: Use appropriate log levels to avoid performance impact

## Debugging and Monitoring

### Built-in Analytics
- Pattern match statistics
- Unknown line tracking
- Confidence score distributions
- Processing performance metrics

### Debugging Tools
- Test scripts for isolated line parsing
- Pattern validation utilities
- Real-time parsing monitoring
- Transaction completeness validation

## Common Pitfalls to Avoid

1. **Don't parse item type prefixes** (L/H/G) as separate fields
2. **Don't use overly generic regex patterns** that cause false matches
3. **Don't ignore unknown lines** - always include them in transactions
4. **Don't hardcode POS-specific values** - use configuration
5. **Don't skip confidence scoring** - it's crucial for downstream processing
6. **Don't forget early returns** in pattern matching to avoid conflicts
7. **Don't assume documentation matches reality** - always use real data

## Success Criteria

A successful POS parser implementation should achieve:
- **100% line inclusion**: All input lines processed (known + unknown)
- **High accuracy**: >95% of known patterns correctly identified
- **Proper classification**: All lines have appropriate lineType values
- **Transaction completeness**: All transaction boundaries correctly identified
- **Performance**: Process 1000+ lines/second without memory leaks
- **Maintainability**: Clear, documented code with comprehensive tests

## Example Implementation Reference

See `src/parsers/VerifoneCommanderParser.js` for a complete reference implementation that follows all these guidelines and requirements.
