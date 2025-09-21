# Micromanager Cloud Setup Guide

This guide covers how to set up the Micromanager Cloud service on a new machine.

## Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **Linux System**: For systemd service (Ubuntu/Debian/CentOS/RHEL)
- **Serial Port Access**: Physical or virtual serial port for POS data
- **Network Access**: To reach your n8n webhook endpoint

## Quick Setup (Development/Testing)

For development or testing without systemd:

```bash
# Clone the repository
git clone https://github.com/FFTY50/micromanager-pos.git
cd micromanager-cloud

# Run quick setup
chmod +x scripts/quick-setup.sh
./scripts/quick-setup.sh

# Edit configuration
nano .env

# Run the application
npm run dev
```

## Production Setup (Systemd Service)

For production deployment as a systemd service:

### 1. Clone and Prepare

```bash
# Clone the repository
git clone <your-repo-url> micromanager-cloud
cd micromanager-cloud

# Make the installer executable
chmod +x scripts/install-service.sh
```

### 2. Install as Service

```bash
# Run the installer (requires sudo)
sudo ./scripts/install-service.sh
```

This script will:
- Create a dedicated `micromanager` user
- Install the application to `/opt/micromanager-cloud`
- Install Node.js dependencies
- Create systemd service configuration
- Set up proper permissions and security

### 3. Configure Environment

Edit the configuration file:

```bash
sudo nano /opt/micromanager-cloud/.env
```

**Required Configuration:**
```bash
# N8N webhook URL (REQUIRED)
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/parse-pos-line

# Device identification
DEVICE_NAME=POS Terminal 101
POS_TYPE=verifone_commander

# Serial port configuration
SERIAL_PORT=/dev/ttyUSB0
SERIAL_BAUD_RATE=9600

# Frigate NVR URL for video correlation
# Local default; adjust if Frigate runs elsewhere
FRIGATE_URL=http://127.0.0.1:5000/
# App uses FRIGATE_BASE for direct calls
FRIGATE_BASE=http://127.0.0.1:5000
```

### 4. Start the Service

```bash
# Start the service
sudo systemctl start micromanager-cloud

# Check status
sudo systemctl status micromanager-cloud

# View logs
sudo journalctl -u micromanager-cloud -f
```

## Service Management

### Common Commands

```bash
# Service control
sudo systemctl start micromanager-cloud     # Start service
sudo systemctl stop micromanager-cloud      # Stop service
sudo systemctl restart micromanager-cloud   # Restart service
sudo systemctl status micromanager-cloud    # Check status

# Logs
sudo journalctl -u micromanager-cloud -f    # Follow logs
sudo journalctl -u micromanager-cloud -n 50 # Last 50 lines
```

### Configuration Updates

After changing configuration:

```bash
# Edit config
sudo nano /opt/micromanager-cloud/.env

# Restart service
sudo systemctl restart micromanager-cloud
```

### Application Updates

To update the application code:

```bash
# Navigate to your local copy
cd /path/to/your/micromanager-cloud

# Pull latest changes
git pull

# Re-run installer
sudo ./scripts/install-service.sh

# Restart service
sudo systemctl restart micromanager-cloud
```

## Troubleshooting

### Serial Port Issues

```bash
# Check if port exists
ls -la /dev/ttyUSB*

# Check permissions
sudo usermod -a -G dialout micromanager

# Test port access
sudo -u micromanager cat /dev/ttyUSB0
```

### Service Won't Start

```bash
# Check detailed logs
sudo journalctl -u micromanager-cloud -n 100

# Check configuration
sudo -u micromanager node -c "require('dotenv').config(); console.log(process.env)"

# Test manually
sudo -u micromanager /usr/bin/node /opt/micromanager-cloud/src/app.js
```

### Network Issues

```bash
# Test webhook connectivity
curl -X POST "YOUR_N8N_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"test": "connection"}'
```

## File Locations

- **Application**: `/opt/micromanager-cloud/`
- **Configuration**: `/opt/micromanager-cloud/.env`
- **Logs**: `/var/log/micromanager/` and `journalctl`
- **Service**: `/etc/systemd/system/micromanager-cloud.service`

## Security Notes

The systemd service runs with:
- Dedicated `micromanager` user (non-login)
- Restricted filesystem access
- No new privileges
- Access only to required directories and serial ports

## Support

For issues:
1. Check service logs: `sudo journalctl -u micromanager-cloud -f`
2. Verify configuration in `.env`
3. Test serial port access
4. Verify network connectivity to n8n webhook
