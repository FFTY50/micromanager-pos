# Configuration Guide

## Overview
The Micromanager POS Transaction Processor uses a clean configuration architecture where **parsing logic is entirely contained within parser classes**, not in configuration files.

## Configuration Philosophy

### ✅ What Configuration Contains
- **Operational settings**: Device IDs, serial ports, connection parameters
- **Environment settings**: Supabase URLs, Frigate endpoints, logging levels
- **Hardware settings**: Serial port configuration (baud rate, data bits, etc.)
- **Business settings**: Store IDs, terminal IDs, backup retention

### ❌ What Configuration Does NOT Contain
- **Parsing patterns**: Regex patterns are defined in parser classes
- **Line type definitions**: Line classification logic is in parsers
- **POS-specific logic**: All POS behavior is encapsulated in parser implementations
- **Transaction rules**: Business logic is handled by processors

## Configuration Structure

```json
{
  // Device identification
  "deviceId": "micromanager-001",
  "posType": "verifone_commander",
  "storeId": "store-123", 
  "storeNumber": "001",
  "posTerminalId": "terminal-456",
  "parserVersion": "1.0.0",
  
  // Hardware configuration
  "serialPort": "/dev/ttyUSB0",
  "baudRate": 9600,
  
  // External service connections
  "supabase": {
    "url": "https://your-project.supabase.co",
    "key": "your-supabase-anon-key"
  },
  
  "frigate": {
    "baseUrl": "http://localhost:5000",
    "cameraName": "pos_camera"
  },
  
  // Operational settings
  "backup": {
    "logDirectory": "./transaction-logs",
    "retentionDays": 30
  },
  
  "logging": {
    "level": "info",
    "console": true,
    "file": "./logs/micromanager.log",
    "maxSize": "10m",
    "maxFiles": 5
  },
  
  // POS type configurations (operational only)
  "posTypes": {
    "verifone_commander": {
      "name": "Verifone Commander",
      "description": "Verifone Commander POS system with multi-line packet support",
      "transaction": {
        "maxDelayMs": 5000
      },
      "serial": {
        "dataBits": 8,
        "stopBits": 1,
        "parity": "none",
        "rtscts": false,
        "xon": false,
        "xoff": false,
        "xany": false
      }
    }
  }
}
```

## Configuration Fields Reference

### Core Settings
- **`deviceId`**: Unique identifier for this micromanager device
- **`posType`**: Parser type to use (must match available parser classes)
- **`storeId`**: UUID of the store in the database
- **`storeNumber`**: Human-readable store number
- **`posTerminalId`**: Terminal identifier for this POS system
- **`parserVersion`**: Version tracking for parser compatibility

### Hardware Settings
- **`serialPort`**: Serial port path (e.g., `/dev/ttyUSB0`, `COM1`)
- **`baudRate`**: Serial communication baud rate

### External Services
- **`supabase.url`**: Supabase project URL
- **`supabase.key`**: Supabase anonymous key
- **`frigate.baseUrl`**: Frigate NVR base URL
- **`frigate.cameraName`**: Camera name for video event creation

### Operational Settings
- **`backup.logDirectory`**: Directory for JSON backup files
- **`backup.retentionDays`**: Days to keep backup files
- **`logging.level`**: Log level (debug, info, warn, error)
- **`logging.console`**: Enable console logging
- **`logging.file`**: Log file path

### POS Type Settings
- **`posTypes[type].name`**: Human-readable POS system name
- **`posTypes[type].description`**: Description of POS system capabilities
- **`posTypes[type].transaction.maxDelayMs`**: Max delay between transaction lines
- **`posTypes[type].serial.*`**: Serial port configuration for this POS type

## Environment Variable Overrides

Configuration values can be overridden with environment variables:

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_KEY="your-supabase-anon-key"
export FRIGATE_URL="http://localhost:5000"
export DEVICE_ID="micromanager-002"
export SERIAL_PORT="/dev/ttyUSB1"
```

## Adding New POS Types

To add a new POS type:

1. **Create parser class** (e.g., `NCRParser.js`) with all parsing logic
2. **Add to factory** in `src/app.js` switch statement
3. **Add config section** with operational settings only:

```json
"ncr_aloha": {
  "name": "NCR Aloha",
  "description": "NCR Aloha POS system",
  "transaction": {
    "maxDelayMs": 3000
  },
  "serial": {
    "dataBits": 8,
    "stopBits": 1,
    "parity": "even"
  }
}
```

## Migration from Old Configuration

If upgrading from a configuration that contained parsing patterns:

1. **Remove all `patterns` sections** - these are now in parser classes
2. **Remove all `lineTypes` sections** - these are now in parser classes  
3. **Keep operational settings** - hardware, connections, logging
4. **Update POS type sections** to contain only operational parameters

## Validation

The application will validate:
- ✅ Required fields are present
- ✅ POS type exists and has a corresponding parser class
- ✅ External service URLs are accessible
- ✅ Serial port configuration is valid

The application will NOT validate:
- ❌ Parsing patterns (they don't exist in config)
- ❌ Line type definitions (they're in parser code)
- ❌ POS-specific business rules (they're in parser code)

---
*Configuration Guide - Updated for Multi-Line Architecture*
