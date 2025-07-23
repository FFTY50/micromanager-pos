# 🚀 Micromanager POS Deployment Checklist

## Pre-Deployment Requirements

### ✅ Hardware Setup
- [ ] **Micromanager device** powered on and accessible
- [ ] **POS system** connected via serial cable
- [ ] **Serial port identified** (e.g., `/dev/ttyUSB0`, `/dev/ttyACM0`)
- [ ] **Camera mounted** and positioned for transaction area
- [ ] **Network connectivity** verified (ethernet/wifi)
- [ ] **Power backup** configured (UPS recommended)

### ✅ Software Prerequisites  
- [ ] **Node.js 18+** installed on micromanager device
- [ ] **Frigate NVR** running and accessible
- [ ] **Supabase project** created and configured
- [ ] **Database schema** deployed (SQL files)
- [ ] **SSH access** to micromanager device configured

## Database Setup

### ✅ Supabase Configuration
- [ ] **Project created** in Supabase dashboard
- [ ] **API keys** generated (anon and service role)
- [ ] **Database tables** created via SQL files:
  - [ ] `01_core_tables.sql` - Core transaction tables
  - [ ] `02_pattern_discovery.sql` - Pattern analysis system
- [ ] **Row Level Security** policies configured
- [ ] **Real-time subscriptions** enabled for transaction_lines
- [ ] **Test store record** created in stores table

### ✅ Database Verification
```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('transactions', 'transaction_lines', 'pattern_discoveries');

-- Test insert permissions
INSERT INTO stores (name) VALUES ('Test Store') RETURNING id;
```

## Frigate Setup

### ✅ Frigate Configuration
- [ ] **Frigate installed** and running
- [ ] **Camera configured** in Frigate config
- [ ] **Camera name** matches configuration (e.g., `pos_camera`)
- [ ] **API endpoint accessible** from micromanager device
- [ ] **Video recording** enabled for camera
- [ ] **Event creation API** tested

### ✅ Frigate Verification
```bash
# Test Frigate API
curl http://localhost:5000/api/config
curl -X POST http://localhost:5000/api/events/pos_camera/transaction/create \
  -H "Content-Type: application/json" \
  -d '{"duration": 60, "source_type": "api"}'
```

## Application Configuration

### ✅ Environment Setup
- [ ] **`.env` file** created from `.env.example`
- [ ] **Supabase credentials** configured
- [ ] **Device ID** set (unique identifier)
- [ ] **Serial port** path configured
- [ ] **POS type** selected (only verifone_commander supported with authentic field data)
- [ ] **Frigate URL** and camera name set
- [ ] **Store information** configured

### ✅ Configuration Validation
```bash
# Verify environment
node -e "
require('dotenv').config();
console.log('✅ Supabase URL:', process.env.SUPABASE_URL ? '✓' : '✗');
console.log('✅ Device ID:', process.env.DEVICE_ID ? '✓' : '✗');
console.log('✅ Serial Port:', process.env.SERIAL_PORT ? '✓' : '✗');
"
```

## Connectivity Testing

### ✅ Serial Port Access
```bash
# Check serial port permissions
ls -l /dev/ttyUSB* /dev/ttyACM*
sudo usermod -a -G dialout $USER
# Logout and login after adding to group

# Test serial port reading
cat /dev/ttyUSB0  # Should show POS data (Ctrl+C to stop)
```

### ✅ Network Connectivity
```bash
# Test Supabase connection
curl -H "apikey: YOUR_ANON_KEY" "https://your-project.supabase.co/rest/v1/"

# Test Frigate connection  
curl http://frigate-ip:5000/api/stats
```

## Application Deployment

### ✅ Installation
```bash
# Clone/copy application to device
cd /opt/micromanager-pos
npm install --production

# Run setup script
npm run setup

# Verify installation
npm test
```

### ✅ Service Configuration (Linux)
```bash
# Create systemd service
sudo cp scripts/micromanager-pos.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable micromanager-pos

# Start service
sudo systemctl start micromanager-pos
sudo systemctl status micromanager-pos
```

### ✅ Manual Testing
```bash
# Test application manually first
npm run dev

# In another terminal, generate mock data
node scripts/mock-serial-data.js verifone_commander 3000

# Verify data appears in Supabase
```

## Monitoring Setup

### ✅ Health Monitoring
- [ ] **Health check endpoint** responding (`/health`)
- [ ] **Log files** being created in `logs/` directory
- [ ] **Transaction logs** being created in `transaction-logs/`
- [ ] **Parsing statistics** available (`/parser-stats`)

### ✅ Real-time Verification
```bash
# Health check
curl http://localhost:3001/health | jq

# Parser statistics  
curl http://localhost:3001/parser-stats | jq

# Check recent transaction lines in Supabase
```

## Production Validation

### ✅ End-to-End Testing
- [ ] **Real POS transaction** processed successfully
- [ ] **Transaction lines** appear in Supabase real-time
- [ ] **Complete transaction** record created
- [ ] **Frigate event** created and ended
- [ ] **Unknown lines** properly captured and flagged
- [ ] **JSON backup files** created in transaction-logs

### ✅ Error Handling
- [ ] **Network disconnection** handled gracefully
- [ ] **Serial port errors** logged and recovered
- [ ] **Parse errors** captured without crashing
- [ ] **Frigate unavailable** handled (marked as 'no-video')
- [ ] **Service restart** resumes operation correctly

## Security & Maintenance

### ✅ Security Configuration
- [ ] **Firewall configured** (allow only necessary ports)
- [ ] **SSH keys** configured (disable password auth)
- [ ] **User permissions** properly restricted
- [ ] **Supabase API keys** secured (not in logs)
- [ ] **Log rotation** configured
- [ ] **Automatic updates** disabled (manual control)

### ✅ Backup & Recovery
- [ ] **Configuration backup** stored securely
- [ ] **Transaction log retention** configured (30 days)
- [ ] **Database backup** strategy in place
- [ ] **Device recovery plan** documented
- [ ] **Rollback procedure** tested

## Go-Live Checklist

### ✅ Final Verification
- [ ] **All tests passing** (unit, integration, end-to-end)
- [ ] **Performance acceptable** (memory, CPU usage)
- [ ] **Data accuracy verified** (manual transaction comparison)
- [ ] **Real-time display** working in web application
- [ ] **Pattern discovery** system operational
- [ ] **Alerts configured** for critical issues

### ✅ Documentation
- [ ] **Deployment notes** documented
- [ ] **Configuration changes** logged
- [ ] **Known issues** documented
- [ ] **Support contacts** updated
- [ ] **Monitoring procedures** documented

### ✅ Handoff
- [ ] **Operations team** trained on monitoring
- [ ] **Troubleshooting guide** provided
- [ ] **Parser update process** documented
- [ ] **Emergency contacts** established
- [ ] **Success metrics** baseline established

## Post-Deployment Monitoring

### ✅ First 24 Hours
- [ ] **Service stability** monitored
- [ ] **Transaction accuracy** spot-checked
- [ ] **Error rates** within acceptable limits
- [ ] **Performance metrics** baseline established
- [ ] **Unknown pattern frequency** reviewed

### ✅ First Week
- [ ] **Pattern discovery** results analyzed
- [ ] **Parser success rate** measured
- [ ] **Video event quality** verified
- [ ] **Backup files** accumulating correctly
- [ ] **Web app integration** confirmed stable

### ✅ Ongoing Maintenance
- [ ] **Weekly pattern analysis** scheduled
- [ ] **Monthly parser updates** planned
- [ ] **Quarterly performance review** scheduled
- [ ] **Annual system upgrade** planned

---

## Emergency Contacts

- **System Administrator**: _[Name/Phone/Email]_
- **Database Administrator**: _[Name/Phone/Email]_  
- **Network Administrator**: _[Name/Phone/Email]_
- **Application Developer**: _[Name/Phone/Email]_

## Support Resources

- **Application Logs**: `/opt/micromanager-pos/logs/`
- **Transaction Logs**: `/opt/micromanager-pos/transaction-logs/`
- **Health Check**: `http://device-ip:3001/health`
- **Supabase Dashboard**: `https://app.supabase.com/project/[project-id]`
- **Frigate Interface**: `http://frigate-ip:5000`

---

**Deployment completed by**: _[Name]_  
**Date**: _[Date]_  
**Version**: _[Application Version]_  
**Notes**: _[Any additional deployment notes]_
