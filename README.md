# Micromanager Edge v1

Micromanager Edge is a single-container edge agent for Verifone Commander POS systems. It reads raw serial data at the store, parses transactions locally, queues payloads to disk, posts `transaction_line` and `transactions` batches to n8n, and signals nearby Frigate NVR instances for video bookmarking.

## Features

- **On-device parsing** for the Verifone Commander journal format with resilient handling of mashed end-of-receipt lines.
- **Stateful transaction machine** that emits line payloads, tallies tenders, and finalises transactions when the `CSH:` line arrives.
- **Disk-backed queue** using SQLite WAL with exponential backoff (1s → 60s, 5 minute pause after 10 retries) and FIFO trimming once older than seven days or when 500 MB is exceeded.
- **Frigate integration** to start, annotate, optionally retain, and end camera events for every transaction window.
- **Health endpoint** at `/healthz` plus optional Prometheus metrics (`/metrics`) exposing queue depth, parse errors, processed lines, and HTTP post latency histograms.
- **Docker-ready** Node.js 20 image that autodetects `/dev/ttyUSB*` ports and ships helper scripts for directory prep and host MAC discovery.

## Directory Layout

```
config/defaults.json        # Runtime defaults (serial, queue, frigate, etc.)
scripts/prepare-dirs.js     # Ensures queue/log directories exist
scripts/get-host-mac.sh     # Host helper to capture NIC MAC address
src/index.js                # Application entry point / bootstrapper
src/parser/verifoneCommander.js
src/state/txnMachine.js
src/queue/sqliteQueue.js
src/http/{client,frigate}.js
src/serial/autoDetect.js
src/server/{health,metrics}.js
```

## Requirements

- Node.js 20 (LTS) and npm
- Access to the POS serial device (`/dev/ttyUSB*`)
- n8n webhooks:
  - `N8N_LINES_URL`
  - `N8N_TXNS_URL`
- Host MAC address exposed via environment variable (preferably `HOST_ETH0_MAC`)
- Optional: Frigate reachable at `FRIGATE_BASE`

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   npm run prepare:dirs
   ```
2. **Configure environment**
   ```bash
   export N8N_LINES_URL=https://example/webhook/transaction_lines
   export N8N_TXNS_URL=https://example/webhook/transactions
   export HOST_ETH0_MAC=$(./scripts/get-host-mac.sh)
   export MICROMANAGER_ID=$(cat /etc/machine-id)
   export DEVICE_NAME=$(hostname -s)
   # optional overrides
   export SERIAL_PORT=/dev/ttyUSB0
   export SERIAL_BAUD=9600
   export POST_LINES_AS_BATCH=true
   export FRIGATE_BASE=http://frigate:5000
   ```
3. **Run the agent**
   ```bash
   npm start
   ```
4. **Check health**
   ```bash
   curl http://localhost:3000/healthz
   # Optional metrics
   curl http://localhost:3000/metrics
   ```

## Configuration Highlights

- `SERIAL_PORT` – explicit serial device (otherwise autodetects `/dev/ttyUSB*`).
- `SERIAL_BAUD` – defaults to 9600.
- `POST_LINES_AS_BATCH` – when `true`, posts `{ lines: [...] }` once per transaction; otherwise enqueues individual line payloads.
- `FRIGATE_*` variables – control camera name, label, duration, remote-role header, and retention behaviour.
- `QUEUE_DB_PATH`, `QUEUE_MAX_BYTES`, `QUEUE_MAX_AGE_SECONDS` – tune SQLite queue location and retention limits.

All defaults are defined in `config/defaults.json` and merged with environment overrides at runtime.

## Data Contracts

Transaction line payloads follow:
```json
{
  "micromanager_id": "string",
  "device_name": "string",
  "device_timestamp": "ISO8601",
  "line_type": "item|total|cash|debit|end_header|cashier|unknown",
  "description": "string",
  "qty": 1,
  "amount": 12.34,
  "raw_line": "string",
  "parsed_successfully": true,
  "transaction_position": 0,
  "transaction_number": "1023612",
  "pos_metadata": {
    "pos_type": "verifone_commander",
    "parser_version": "v1.0.0",
    "terminal_id": "aa:bb:cc:dd:ee:ff",
    "drawer_id": "1",
    "store_id": "AB123"
  },
  "frigate_url": null
}
```

The transaction summary payload contains:
```json
{
  "micromanager_id": "string",
  "device_name": "string",
  "terminal_id": "aa:bb:cc:dd:ee:ff",
  "transaction_number": "1023612",
  "drawer_id": "1",
  "store_id": "AB123",
  "started_at": "ISO8601",
  "ended_at": "ISO8601",
  "item_count": 3,
  "total": 27.54,
  "tenders": { "cash": 20.0, "debit": 7.54 },
  "line_count": 9,
  "parser_version": "v1.0.0"
}
```

## Docker

A production container can be built with the included Dockerfile:
```bash
docker build -t micromanager-edge .
```

Sample compose service snippet (joining Frigate on `nvrnet`):
```yaml
micromanager:
  build: ./micromanager
  networks: [nvrnet]
  restart: unless-stopped
  devices:
    - /dev/ttyUSB0:/dev/ttyUSB0
    - /dev/ttyUSB1:/dev/ttyUSB1
  env_file:
    - /opt/micromanager/.env
  environment:
    N8N_LINES_URL: https://n8n.../webhook/transaction_lines
    N8N_TXNS_URL:  https://n8n.../webhook/transactions
    FRIGATE_BASE:  http://frigate:5000
    POST_LINES_AS_BATCH: "true"
```
Prepare the host environment once:
```bash
sudo mkdir -p /opt/micromanager
./scripts/get-host-mac.sh | sudo tee /opt/micromanager/.env
echo "MICROMANAGER_ID=$(cat /etc/machine-id)" | sudo tee -a /opt/micromanager/.env
echo "DEVICE_NAME=$(hostname -s)" | sudo tee -a /opt/micromanager/.env
```

## Testing

Use the bundled Jest suite and mocked serial port:
```bash
npm test
```

The tests cover parser accuracy, state-machine transitions, and transaction roll-up/queue integration using captured journal snippets.

## Troubleshooting

- **No serial data** – ensure the container has access to `/dev/ttyUSB*` and that `SERIAL_BAUD` matches the Commander configuration.
- **Queue growth** – check `/healthz` for `queue_depth`; the queue trims automatically beyond 7 days or 500 MB but may indicate downstream network issues.
- **Frigate failures** – verify `FRIGATE_BASE`, camera name, and remote role header. Errors are logged but do not block transaction delivery.

## License

MIT
