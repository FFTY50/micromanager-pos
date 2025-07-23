# 🚀 Simplified Micromanager

> **Raw POS Data Forwarder - Serial to n8n Webhook**

A lightweight, reliable POS data forwarder that captures raw serial data from Point-of-Sale systems and forwards it directly to n8n webhooks for cloud-based processing. No local parsing, maximum reliability.

## 🎯 Overview

Simplified Micromanager transforms the traditional complex POS processing approach into a streamlined data forwarding solution. It captures raw transaction data from serial interfaces and sends it directly to your n8n workflows, where all parsing and processing logic resides.

### Key Features

- **📡 Raw Data Forwarding**: Sends unprocessed POS data directly to n8n webhooks
- **🆔 Smart Device ID**: Auto-generates unique device IDs in format `mmd-rv1-{last6MAC}`
- **🛡️ Zero Data Loss**: Robust local backup with 30-day retention during network outages
- **🔄 Auto-Recovery**: Exponential backoff retry logic with offline queuing
- **☁️ Cloud-First Processing**: All parsing and business logic handled in n8n workflows
- **📊 Comprehensive Monitoring**: Health checks, statistics, and status reporting
- **🔧 Minimal Configuration**: Environment-based setup with intelligent defaults

## 🏗️ Architecture

### Current (Simplified):
```
POS → Serial → Micromanager → [Raw Data + Local Backup] → n8n Webhook → [Cloud Processing]
```

### Previous (Complex):
```
POS → Serial → Micromanager → [VerifoneParser + SmartTransactionProcessor + Frigate API] → Supabase
```

### Key Components

- **DeviceInitializer**: Auto-generates unique device IDs and manages configuration
- **SimplifiedMicromanager**: Core data forwarding engine with retry logic
- **Local Backup System**: Daily JSON files with automatic 30-day cleanup
- **Health Monitoring**: Built-in status reporting and statistics tracking

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- n8n instance with webhook endpoint
- Serial port connection to POS system
- Network connectivity for webhook calls

### Installation

```bash
# Clone the project
git clone <repository-url>
cd micromanager-cloud

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your n8n webhook URL and device settings
```

### Configuration

Edit `.env` file with your settings:

```bash
# Required: n8n webhook URL
N8N_WEBHOOK_URL=https://n8n.yourserver.com/webhook/parse-pos-line

# Device configuration
DEVICE_NAME=POS Terminal 101
POS_TYPE=verifone_commander
SERIAL_PORT=/dev/ttyUSB0
SERIAL_BAUD_RATE=9600

# Optional: Retry configuration
RETRY_ATTEMPTS=3
RETRY_DELAY_MS=1000

```

### Running

```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start

# Optional: Enable health check server
ENABLE_HEALTH_SERVER=true npm start

# Check health (if enabled)
curl http://localhost:3000/health
```

## 📡 Device Configuration

The micromanager automatically generates a unique device ID on first run:

```bash
# Device ID format: mmd-rv1-{last6MAC}
# Example: mmd-rv1-ddeeff (from MAC aa:bb:cc:dd:ee:ff)
```

Configuration is stored in `config/device.json`:

```json
{
  "deviceId": "mmd-rv1-ddeeff",
  "deviceName": "POS Terminal 101",
  "posType": "verifone_commander",
  "n8nWebhookUrl": "https://n8n.yourserver.com/webhook/parse-pos-line",
  "serialPort": "/dev/ttyUSB0",
  "serialBaudRate": 9600,
  "localBackupEnabled": true,
  "retryAttempts": 3,
  "retryDelayMs": 1000
}
```

## 📊 Data Flow

### Webhook Payload

Each POS line is sent to your n8n webhook as:

```json
{
  "micromanager_id": "mmd-rv1-ddeeff",
  "device_name": "POS Terminal 101",
  "pos_type": "verifone_commander",
  "raw_line": "07/11/25 03:33:19 102 COCA COLA 1 2.50",
  "timestamp": "2025-01-15T10:30:45.123Z",
  "line_length": 42
}
```

### HTTP Headers

```
Content-Type: application/json
X-Device-ID: mmd-rv1-ddeeff
X-Device-Name: POS Terminal 101
X-POS-Type: verifone_commander
User-Agent: SimplifiedMicromanager/mmd-rv1-ddeeff
```

## 🛡️ Reliability Features

### Local Backup

- **Daily Files**: `transaction-logs/raw_data-YYYY-MM-DD.json`
- **Failed Webhooks**: `transaction-logs/failed_webhooks-YYYY-MM-DD.json`
- **30-Day Retention**: Automatic cleanup of old backup files
- **Zero Data Loss**: All POS data preserved locally regardless of network status

### Network Resilience

- **Exponential Backoff**: 1s, 2s, 4s retry delays
- **Offline Queuing**: Failed webhook calls queued for retry
- **Auto-Recovery**: Automatic reconnection when network restored
- **Batch Processing**: Queued items sent in sequence after reconnection
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
