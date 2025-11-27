# Integration Contract: Edge → n8n → Supabase → UI

**Last Updated**: November 2025  
**Status**: Field Testing v1.0  
**Coordination**: [Edge Device] ↔️ [n8n Middleware] ↔️ [Supabase Backend] ↔️ [React UI]

This document defines the **interface contract** between all components. If either the Edge Device or UI teams make changes, **update this document first**.

---

## Overview

```
POS Terminal
    ↓ (serial)
[EDGE DEVICE] — generates transaction_uuid, streams lines
    ↓ (HTTP POST)
[N8N WEBHOOKS] — acts as passthrough
    ↓ (REST API / SQL)
[SUPABASE] — stores transaction_lines + transactions
    ↓ (GraphQL / REST)
[REACT UI] — displays real-time receipt + video
```

---

## 1. Edge Device → n8n: Payload Schemas

### Webhook Endpoints Required

```env
N8N_LINES_URL=https://n8n-instance/webhook/transaction_lines
N8N_TXNS_URL=https://n8n-instance/webhook/transactions
```

### 1a. Transaction Line Payload (Posted per line, REAL-TIME)

**Endpoint**: `POST {N8N_LINES_URL}`  
**Timing**: Immediately when line is parsed  
**Frequency**: One POST per POS line (10–50 lines per transaction typical)

```json
{
  "micromanager_id": "mmd-rv1-2461b4-0",
  "device_name": "register-1",
  "device_timestamp": "2025-11-27T14:32:01.000Z",
  "line_type": "item|total|cash|debit|credit|preauth|end_header|cashier|unknown",
  "description": "Large Pepperoni Pizza",
  "qty": 1,
  "amount": 12.34,
  "raw_line": "ITEM#001 Large Pepperoni Pizza        12.34",
  "parsed_successfully": true,
  "transaction_position": 0,
  "transaction_number": "1023612",
  "transaction_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "pos_metadata": {
    "pos_type": "verifone_commander",
    "parser_version": "v1.0.0",
    "terminal_id": "aa:bb:cc:dd:ee:ff",
    "drawer_id": "1",
    "store_id": "AB123"
  },
  "frigate_url": "https://frigate-instance/events/550e8400-e29b-41d4-a716-446655440000"
}
```

**Key Notes**:
- ✅ `transaction_uuid` is **always present** (generated at edge device)
- ✅ `transaction_number` is **backfilled** (extracted from receipt footer, applied retroactively to all lines)
- ✅ `frigate_url` may be null initially, populated when video event starts
- ℹ️ `parsed_successfully: false` indicates an unparseable line; still sent for audit trail

**Supabase Table**: `transaction_lines`

---

### 1b. Transaction Summary Payload (Posted at end of transaction)

**Endpoint**: `POST {N8N_TXNS_URL}`  
**Timing**: When CSH: (cashier) line arrives  
**Frequency**: One POST per transaction

```json
{
  "micromanager_id": "mmd-rv1-2461b4-0",
  "device_name": "register-1",
  "terminal_id": "aa:bb:cc:dd:ee:ff",
  "pos_type": "verifone_commander",
  "transaction_number": "1023612",
  "transaction_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "total_amount": 27.54,
  "item_count": 3,
  "line_count": 9,
  "cash_amount": 20.00,
  "credit_amount": 7.54,
  "debit_amount": null,
  "preauth_amount": null,
  "transaction_started_at": "2025-11-27T14:32:00.000Z",
  "transaction_completed_at": "2025-11-27T14:32:45.000Z",
  "video_start_time": "2025-11-27T14:32:00.000Z",
  "video_end_time": "2025-11-27T14:32:45.000Z",
  "frigate_event_id": "550e8400-e29b-41d4-a716-446655440000",
  "pos_metadata": {
    "parser_version": "v1.0.0",
    "drawer_id": "1",
    "store_id": "AB123"
  }
}
```

**Key Notes**:
- ✅ Sent **after** all lines for this transaction have been streamed
- ✅ `transaction_uuid` matches all lines (same UUID)
- ✅ Summary includes aggregates: `total_amount`, `item_count`, `cash_amount`, etc.
- ℹ️ `frigate_event_id` links to video bookmarks

**Supabase Table**: `transactions`

---

## 2. n8n → Supabase: Passthrough Logic

### Current Role

n8n **does not transform** these payloads. It:
1. Receives the webhook
2. Validates the shape (optional, but recommended)
3. Forwards to Supabase REST API

### Future Enhancements (Not Yet Implemented)

- Rate limiting per `micromanager_id`
- Deduplication (if line already in DB)
- Logging/audit of all payloads

### Error Handling

If n8n fails to post to Supabase:
- Edge device **will retry** (it doesn't know n8n failed)
- n8n should retry as well (standard webhook retry)
- Both must implement exponential backoff

---

## 3. Supabase Schema Requirements

### Table: `transactions`

```sql
CREATE TABLE transactions (
  id BIGSERIAL PRIMARY KEY,
  transaction_uuid UUID NOT NULL UNIQUE,  -- Edge-generated UUID
  micromanager_id VARCHAR NOT NULL,
  transaction_number VARCHAR NOT NULL,    -- POS receipt #
  device_name VARCHAR,
  terminal_id VARCHAR,
  pos_type VARCHAR,
  store_id VARCHAR,
  drawer_id VARCHAR,
  total_amount NUMERIC(10, 2),
  item_count INT,
  line_count INT,
  cash_amount NUMERIC(10, 2),
  credit_amount NUMERIC(10, 2),
  debit_amount NUMERIC(10, 2),
  preauth_amount NUMERIC(10, 2),
  transaction_started_at TIMESTAMP WITH TIME ZONE,
  transaction_completed_at TIMESTAMP WITH TIME ZONE,
  video_start_time TIMESTAMP WITH TIME ZONE,
  video_end_time TIMESTAMP WITH TIME ZONE,
  frigate_event_id VARCHAR,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_txn_per_device UNIQUE(micromanager_id, transaction_number)
);
```

### Table: `transaction_lines`

```sql
CREATE TABLE transaction_lines (
  id BIGSERIAL PRIMARY KEY,
  transaction_uuid UUID NOT NULL,  -- FOREIGN KEY reference
  transaction_number VARCHAR NOT NULL,
  micromanager_id VARCHAR NOT NULL,
  device_name VARCHAR,
  device_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  line_type VARCHAR NOT NULL,
  description VARCHAR,
  qty INT,
  amount NUMERIC(10, 2),
  raw_line TEXT,
  parsed_successfully BOOLEAN,
  transaction_position INT,
  pos_metadata JSONB,
  frigate_url VARCHAR,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_transaction FOREIGN KEY(transaction_uuid) 
    REFERENCES transactions(transaction_uuid)
);
```

**Indexes for Performance**:
```sql
CREATE INDEX idx_txn_lines_txn_uuid ON transaction_lines(transaction_uuid);
CREATE INDEX idx_txn_lines_micromanager ON transaction_lines(micromanager_id);
CREATE INDEX idx_txn_lines_created ON transaction_lines(created_at DESC);
CREATE INDEX idx_txn_mmgr_txn_num ON transactions(micromanager_id, transaction_number);
```

---

## 4. Supabase → UI: Query Contracts

### Query 1: Get Transaction Summary + All Lines

**Purpose**: Display receipt + video  
**Called by**: Receipt detail view

```graphql
query GetTransactionWithLines($txn_uuid: UUID!) {
  transactions(where: { transaction_uuid: { eq: $txn_uuid } }) {
    transaction_uuid
    transaction_number
    total_amount
    transaction_started_at
    frigate_event_id
    transaction_lines {
      transaction_position
      line_type
      description
      amount
      parsed_successfully
    }
  }
}
```

### Query 2: Stream Recent Lines (Real-time Subscription)

**Purpose**: Live receipt display (as cashier scans items)  
**Called by**: POS dashboard realtime feed

```graphql
subscription WatchRecentLines($store_id: String!) {
  transaction_lines(
    where: { 
      pos_metadata: { store_id: { eq: $store_id } }
      created_at: { gte: now() - interval '5 minutes' }
    }
    order_by: { created_at: desc }
  ) {
    transaction_uuid
    description
    amount
    line_type
    device_timestamp
  }
}
```

### Query 3: Aggregate Summary by Store (Dashboard)

**Purpose**: Today's summary (total sales, transaction count)  
**Called by**: Management dashboard

```graphql
query SalesAggregateByStore($store_id: String!, $date: Date!) {
  transactions_aggregate(
    where: { 
      store_id: { eq: $store_id }
      transaction_completed_at: { gte: $date, lt: $date + interval '1 day' }
    }
  ) {
    aggregate {
      count
      sum { total_amount }
      avg { total_amount }
    }
  }
}
```

---

## 5. Real-time Data Flow Example

**Scenario**: Customer buys milk, bread, pays with credit card.

```
14:32:00.000 – Edge detects first line
├─ POST /n8n/transaction_lines { line_type: "item", description: "Milk", ... }
├─ n8n → Supabase INSERT transaction_lines
└─ UI subscription receives update → shows "Milk" immediately

14:32:01.500 – Second item scanned
├─ POST /n8n/transaction_lines { line_type: "item", description: "Bread", ... }
├─ n8n → Supabase INSERT transaction_lines
└─ UI updates → shows "Bread" below "Milk"

14:32:30.000 – Cashier presses total, then credit card
├─ POST /n8n/transaction_lines { line_type: "total", amount: 25.50 }
├─ POST /n8n/transaction_lines { line_type: "credit", amount: 25.50 }
└─ Both appear in real-time

14:32:45.000 – CSH: (end) line arrives
├─ Edge finalizes transaction
├─ Edge tags Frigate event with description
├─ POST /n8n/transactions { transaction_uuid: "...", total_amount: 25.50, ... }
├─ n8n → Supabase UPDATE transactions (insert if not exists)
└─ UI shows "Complete" badge, embeds Frigate video URL
```

---

## 6. Error Scenarios & Handling

### Scenario: Network fails mid-transaction

**What happens**:
1. Edge device detects failure
2. Lines already sent are queued locally (SQLite)
3. Edge retries per exponential backoff (1s, 2s, 5s, ..., 60s)
4. After 10 retries, pauses for 5 minutes
5. On recovery, all lines are delivered (in order)

**What UI should do**:
- Don't assume all lines for a transaction have arrived
- Use timestamps to group lines by transaction_uuid
- Show "(awaiting video)" if frigate_url is null
- Refresh transaction_lines subscription periodically

### Scenario: Duplicate line arrives

**What happens**:
1. Edge sends line
2. n8n posts to Supabase
3. n8n retry fires (thinks it failed)
4. Same line posted again

**How to prevent**:
- n8n should include an idempotency key (hash of line content)
- Supabase could add UNIQUE constraint on (transaction_uuid, transaction_position)

### Scenario: Frigate event creation fails

**What happens**:
1. Edge tries to create Frigate event (may timeout)
2. Lines are still sent with `frigate_url: null`
3. Edge logs warning but continues

**What UI should do**:
- Gracefully handle null frigate_url
- Show "Video unavailable" instead of broken embed

---

## 7. Monitoring & Health Checks

### Edge Device Health Endpoint

```bash
curl http://edge-device:3000/healthz
```

**Response**:
```json
{
  "status": "healthy",
  "queue_depth": 2,
  "queue_age_seconds": 45,
  "last_line_received": "2025-11-27T14:32:45.000Z",
  "last_line_posted": "2025-11-27T14:32:43.000Z",
  "parser_version": "v1.0.0"
}
```

**UI should poll** every 30 seconds to detect stale edges.

### Supabase Health Indicators

- `transaction_lines.created_at` – Are lines still arriving?
- `MAX(transaction_completed_at)` – When was last transaction?
- Missing transactions with `frigate_event_id IS NULL` – Video bookmarking failures?

---

## 8. Versioning & Compatibility

### Current Version
- Edge Device: v1.0.0
- Payload schema: v1.0.0
- Supabase schema: v1.0.0

### Breaking Changes Require

1. **Major version bump** (v1.0.0 → v2.0.0)
2. **New n8n workflow** (parallel route while old routes wind down)
3. **DB migration** (add columns, don't remove yet)
4. **UI feature flag** (new UI can subscribe to v2 data)

### Example: Adding a new field

```diff
// OK (additive, backward-compatible):
+ "loyalty_program_id": "12345"

// NOT OK (breaking):
- "raw_line": "ITEM..." (field removed)
```

---

## 9. Checklist for Deployments

### Before Pushing Edge Device Code
- [ ] All lines pass `npm run lint`
- [ ] Tests pass: `npm test`
- [ ] No unused variables (like the old `POST_LINES_AS_BATCH`)
- [ ] `transaction_uuid` is generated and included in all payloads

### Before Deploying UI Changes
- [ ] UI handles `frigate_url: null` gracefully
- [ ] Subscription handles stale connections (retry logic)
- [ ] Real-time updates don't overwrite user's scroll position

### Before Deploying Supabase Schema
- [ ] New indexes don't cause query performance regressions
- [ ] Foreign key constraints don't break existing data
- [ ] RLS (Row-Level Security) policies are in place for multi-tenant safety

### Before Merging n8n Workflows
- [ ] Webhook validates payload shape
- [ ] Error logging includes full request/response
- [ ] Retry logic is idempotent (can safely retry)

---

## 10. Questions & Clarifications

**Q: What if a transaction takes > 5 minutes?**  
A: Edge keeps buffering lines. Frigate event duration is configurable (`FRIGATE_DURATION_SECONDS`). Adjust if needed.

**Q: Can we batch lines again if network is slow?**  
A: Yes, but requires schema changes. Current design prioritizes real-time. File a separate issue if needed.

**Q: What if `transaction_number` is missing from the footer?**  
A: Lines will have `transaction_number: null`. Supabase UNIQUE constraint won't apply. Still gets tracked by `transaction_uuid`.

**Q: How do we handle multi-terminal transactions (e.g., customer moved to different register)?**  
A: Each terminal has its own `terminal_id`. Each starts a new `transaction_uuid`. Not currently handled as a single "parent" transaction.

---

## Contact & Updates

- **Edge Device Owner**: [Trey]
- **Supabase Backend Owner**: [Other Agent]
- **UI Owner**: [Other Agent]

When updating this document, post in the Slack thread or add a comment to the PR. All three teams depend on this contract.

