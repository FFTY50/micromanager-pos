# Micromanager POS Transaction Processor

A smart edge device application for capturing, parsing, and analyzing POS transaction data with real-time Supabase integration and Frigate NVR video recording.

## 🎯 Features

- **Smart Edge Processing**: Complete transaction formation on the micromanager device
- **Verifone POS Support**: Modular parser system with robust Verifone Commander support and extensible architecture for additional POS types
- **Unknown Line Capture**: Never lose transaction data - unknown patterns are preserved for analysis
- **Pattern Discovery**: Automatic detection and analysis of new POS patterns
- **Real-time Streaming**: Live transaction lines to web app via Supabase real-time
- **Video Integration**: Frigate NVR event creation for transaction video recording
- **Backup & Recovery**: Local JSON backup files with 30-day retention
- **Zero Data Loss**: Every line preserved, even unparsable data

## 🏗️ Architecture

```
Serial Data → Parser → Smart Processor → Real-time Supabase + Frigate Events + JSON Backup
```

### Key Components

- **BasePOSParser**: Extensible parsing framework with unknown line handling
- **SmartTransactionProcessor**: Edge processing with device-generated UUIDs
- **Pattern Discovery System**: Automatic learning from unknown lines
- **Frigate Integration**: Video event management for transactions
- **Real-time Output**: Immediate Supabase publishing for web app consumption

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Supabase project
- Frigate NVR instance (optional but recommended)
- Serial port connection to POS system

### Installation

```bash
# Clone or download the project
cd micromanager-pos

# Run automated setup
npm run setup

# Edit configuration
cp .env.example .env
# Edit .env with your Supabase, Frigate, and device settings

# Setup database tables
# Run the SQL files in sql/ directory on your Supabase project:
# - 01_core_tables.sql
# - 02_pattern_discovery.sql
```

### Configuration

Edit `.env` file:

```bash
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key

# Device
DEVICE_ID=micromanager-001
SERIAL_PORT=/dev/ttyUSB0
STORE_ID=store-123

# Frigate
FRIGATE_URL=http://localhost:5000
CAMERA_NAME=pos_camera

# POS Type
POS_TYPE=verifone_commander
```

### Running

```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start

# Health check
curl http://localhost:3001/health
```

## 📊 Real-time Receipt Display

Every transaction line appears instantly in your web app:

```javascript
// Supabase real-time subscription
const subscription = supabase
  .channel('transaction_lines')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'transaction_lines' },
    (payload) => {
      // Live line appears with transaction_id
      updateReceiptDisplay(payload.new);
    }
  )
  .subscribe();
```

## 🧠 Unknown Line Analysis

The system captures and analyzes unknown patterns:

```sql
-- Find high-priority unknown patterns
SELECT raw_line, COUNT(*) as frequency 
FROM transaction_lines 
WHERE line_type = 'unknown' AND analysis_priority = 'high'
GROUP BY raw_line 
ORDER BY frequency DESC;

-- Auto-discover new patterns
SELECT * FROM auto_discover_patterns(5, 7); -- 5+ occurrences in 7 days
```

## 🔧 Parser Configuration

Add new POS patterns in `config/micromanager.json`:

```json
{
  "posTypes": {
    "your_pos_brand": {
      "transaction": {
        "patterns": {
          "total": "^TOTAL\\s+(\\d+\\.\\d{2})$",
          "employee_discount": "^EMPLOYEE DISCOUNT (\\d+)%$",
          "endTransaction": "^(THANK YOU|RECEIPT).*$"
        }
      }
    }
  }
}
```

## 📈 Pattern Discovery Workflow

1. **Monitor Dashboard**: Unknown patterns ranked by frequency
2. **Analyze Patterns**: High-frequency unknowns become parsing candidates  
3. **Create Regex**: System suggests patterns, developer refines
4. **Deploy Update**: Add to parser configuration
5. **Track Success**: Measure parsing improvement

## 🎥 Frigate Integration

Automatic video event creation:

```javascript
// Transaction starts → Create Frigate event
POST /api/events/:camera_name/:label/create

// Transaction ends → End Frigate event  
PUT /api/events/:event_id/end
```

Event naming: `transaction-{uuid-last-6}-{timestamp}`

## 💾 Backup & Recovery

- **Hourly JSON logs**: Complete transaction data with video event IDs
- **30-day retention**: Automatic cleanup of old logs
- **Failed line backup**: Network failures don't lose data
- **Parse error preservation**: Even unparsable data is saved

## 🔍 Monitoring & Health

```bash
# Health check endpoint
curl http://localhost:3001/health

# Parser statistics  
curl http://localhost:3001/parser-stats

# Service status (Linux)
sudo systemctl status micromanager-pos
```

## 📋 Database Schema

### Core Tables

- `transactions`: Complete transaction records
- `transaction_lines`: Individual receipt lines (real-time)
- `pattern_discoveries`: Unknown pattern tracking
- `parser_configurations`: Parser version history

### Key Fields for Analysis

```sql
transaction_lines:
  - raw_line: Original POS data
  - parsed_successfully: Boolean success flag
  - needs_analysis: Marks unknown patterns
  - analysis_priority: high/medium/low/critical
  - matched_patterns: Which regex patterns matched
  - extraction_confidence: 0-100 parsing confidence
```

## 🚀 Production Deployment

### Linux Systemd Service

```bash
# Install service
sudo cp scripts/micromanager-pos.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable micromanager-pos
sudo systemctl start micromanager-pos

# Monitor logs
sudo journalctl -u micromanager-pos -f
```

### Environment Variables

```bash
NODE_ENV=production
LOG_LEVEL=info
HEALTH_CHECK_PORT=3001
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch

# Specific test suites
npm test -- --testNamePattern="VerifoneCommanderParser"
```

## 📚 Documentation

- **SQL Queries**: `sql/03_analysis_queries.sql` - Ready-to-use pattern analysis
- **Parser Examples**: `src/parsers/` - Reference implementations
- **Configuration**: `config/micromanager.json` - Complete POS type definitions

## 🛠️ Extending the System

### Adding New POS Types

1. Create parser class extending `BasePOSParser`
2. Define patterns in configuration
3. Add to parser factory in `src/app.js`
4. Test with unknown line analysis

### Custom Analysis

```javascript
// Export parser statistics
const stats = app.exportParserStats();

// Custom pattern discovery
const recommendations = parser.generateRecommendations();
```

## 🆘 Troubleshooting

### Common Issues

**Serial Port Access**:
```bash
sudo usermod -a -G dialout $USER
# Logout and login again
```

**Parsing Issues**:
```sql
-- Check recent unknown lines
SELECT * FROM unknown_patterns_analysis 
WHERE created_at >= NOW() - INTERVAL '1 hour';
```

**Performance**:
```bash
# Check memory usage
curl http://localhost:3001/health | jq '.memoryUsage'
```

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Submit pull request

## 📞 Support

- **Documentation**: Check SQL files and code comments
- **Issues**: Unknown patterns should be analyzed via dashboard
- **Health Monitoring**: Use `/health` endpoint for system status

---

**Built for reliable, intelligent POS data capture with zero data loss and continuous learning.**
