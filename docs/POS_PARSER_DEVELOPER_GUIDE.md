# POS Parser Developer Guide

## Overview
This guide provides requirements, best practices, and implementation patterns for creating new POS parsers in the Micromanager POS Transaction Processor system. It's based on lessons learned from implementing the Verifone Commander parser.

## Core Requirements

### 1. Parser Architecture
- **Extend BasePOSParser**: All parsers must inherit from `BasePOSParser` for consistency and shared functionality
- **Modular Design**: Each POS system gets its own parser class (e.g., `VerifoneCommanderParser`, `NCRParser`)
- **Configuration-Driven**: Parser behavior should be configurable via `micromanager.json`

### 2. Output Requirements
Parsers must output data at two levels:

#### A. Individual Line Processing
Each line must return a standardized result object:
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

### 3. Line Type Classification
All lines must be classified into one of these types:

- **`item`**: Individual products/services with quantities and amounts
- **`total`**: Transaction subtotals, taxes, final totals
- **`payment`**: Payment method lines (cash, credit, debit, etc.)
- **`prepay`**: Prepaid items (gas, phone cards, etc.)
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
- [ ] Add configuration section to `micromanager.json`
- [ ] Create test file with real POS data samples

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

#### `extractTransactionData(cleanedData)`
```javascript
extractTransactionData(cleanedData) {
    const result = {
        lineType: null,
        description: null,
        amount: null,
        parsingSuccess: false,
        confidenceScore: 0,
        matchedPatterns: [],
        extractedFields: {}
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

### Phase 5: Testing and Validation
- [ ] Create comprehensive test suite with real data
- [ ] Test all line types and edge cases
- [ ] Validate confidence scoring accuracy
- [ ] Test unknown line handling
- [ ] Verify transaction boundary detection
- [ ] Performance test with large data sets

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
