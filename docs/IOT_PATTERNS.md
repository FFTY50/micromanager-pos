# IoT Software Patterns in Micromanager

This guide explains the architectural decisions and patterns used in the Micromanager Edge device. It's designed to help both technical and semi-technical team members understand *why* the system is built this way.

---

## What is IoT Software?

**IoT** = Internet of Things. In this context, it means software running on a **small, specialized device at the edge** (in-store) that:
- Collects data from hardware (POS serial port)
- Processes it locally (parse receipts)
- Sends it to the cloud (n8n → Supabase)
- Handles network failures gracefully (queuing)

**Key difference from typical web apps**: IoT software must work **offline** and **unreliably**, so it queues, retries, and doesn't lose data.

---

## Pattern 1: UUID Generation at the Edge (Not in Database)

### The Problem

Traditional approach (❌ **avoided** here):
```
Edge sends: { micromanager_id, transaction_number, lines: [...] }
    ↓
Database trigger receives it
    ↓
Trigger generates UUID and links lines
    ↓
Problem: UUID is created *after* data arrives. Hard to track, errors lose data.
```

### The Solution (✅ **what you're doing now**)

```
Edge generates: UUID = randomUUID()
    ↓
Edge sends: { transaction_uuid, lines: [{ transaction_uuid, ... }] }
    ↓
Database receives it. UUID already exists everywhere.
    ↓
Benefit: All data leaving the device is complete + traceable.
```

### Why This Matters

1. **Traceability** – From the moment a transaction starts, it has a unique ID
2. **Resilience** – If the network fails after sending line 1, line 2 still has the same `transaction_uuid`
3. **Simplicity** – Supabase doesn't need complex trigger logic; it just stores what it receives
4. **Real-time UI** – UI can subscribe to lines as they arrive (same UUID the whole time)

---

## Pattern 2: State Machine for Transaction Lifecycle

### What is a State Machine?

Think of a transaction like a **light switch**:
- **OFF** (IDLE) – No transaction happening
- **ON** (IN_TXN) – Transaction in progress
- **OFF** (IDLE again) – Transaction complete, waiting for next one

Your `txnMachine.js` is a **state machine** that enforces:
- Only certain transitions are allowed
- Data is collected in a specific order
- No transaction can "leak" into the next one

### States in Micromanager

```
IDLE
  ↓ (first line arrives)
IN_TXN
  ├─ Collect lines (item, total, cash, debit, etc.)
  ├─ Track metadata (store_id, drawer_id, transaction_number)
  ├─ Build Frigate event (video bookmark)
  ↓ (CSH: line arrives = end signal)
IDLE (transaction finalized, ready for next)
```

### Why This Matters

1. **Correctness** – Lines can't get mixed between transactions
2. **Clarity** – Anyone reading the code knows exactly what stage we're in
3. **Testing** – You can test each state transition independently
4. **Safety** – If something crashes mid-transaction, the state is recoverable

---

## Pattern 3: Disk-Backed Queue (SQLite WAL)

### The Problem

Network fails. What happens to your POST request?

❌ **Naive approach** (lost data):
```
Line arrives → Send to n8n → Network fails → Line is gone forever
```

✅ **Micromanager approach** (resilient):
```
Line arrives → Save to local SQLite DB → Return success → Background thread sends
    ↓ (network fails)
SQLite retry logic kicks in → Exponential backoff → Finally delivers or logs
```

### How It Works

1. **Immediate persistence** – Every line is written to local disk (SQLite)
2. **Async posting** – Background thread (`processQueue()`) sends when ready
3. **Retry logic** – Starts at 1s, backs off to 60s, pauses after 10 retries
4. **Auto-cleanup** – Deletes succeeded items or ones older than 7 days

### Why This Matters

1. **No data loss** – Even if power fails, data is on disk
2. **Network resilience** – Retries automatically without app restart
3. **Performance** – App doesn't wait for n8n to respond (async)
4. **Observability** – Queue depth is a health metric

---

## Pattern 4: Frigate Integration for Video Bookmarking

### The Problem

You have:
- A receipt (from POS parser)
- Video footage (from Frigate NVR)

How do you link them?

### The Solution

When a transaction starts, tell Frigate: *"Start recording an event with this label"*
When it ends, tell Frigate: *"End event, tag it with this description"*

```javascript
transaction starts at 14:32:00
    ↓
frigateClient.startEvent() → Frigate records and returns eventId
    ↓
transaction completes at 14:32:45
    ↓
frigateClient.endEvent(eventId)
    ↓
Frigate has a 45-second video clip labeled with receipt details
```

### Why This Matters

1. **Loss Prevention** – Store associate can pull up video + receipt side-by-side
2. **Audit Trail** – Timestamp + video proof of what happened
3. **Integration** – UI can embed the Frigate URL into the receipt view

---

## Pattern 5: Real-time Line Streaming (vs. Batch)

### The Design Decision

**Before**: Wait for entire transaction, send all lines at once (batch)  
**Now**: Send each line as it arrives (streaming)

### Why Streaming is Better

```
Batch Approach (❌ for real-time):
14:32:00 – Item line arrives → held in memory
14:32:01 – Another item → held in memory
14:32:45 – Transaction ends → all lines sent together
14:32:46 – UI updates (45 seconds later)

Streaming Approach (✅ for real-time):
14:32:00 – Item line arrives → immediately queued → n8n → UI (instant)
14:32:01 – Another item → immediately queued → n8n → UI (instant)
14:32:45 – Transaction ends → sends summary
14:32:46 – UI is already up-to-date
```

### Why This Matters

1. **Real-time Visibility** – Loss prevention team sees lines as they're scanned
2. **Early Alerts** – Can flag suspicious items before transaction completes
3. **Better UX** – UI feels responsive, not batchy

---

## Pattern 6: Metadata Backfilling

### The Problem

When you scan the first item, you don't know:
- What store this is (`store_id`)
- Which drawer (`drawer_id`)
- What the transaction number is (`transaction_number`)

But that info arrives in the receipt **footer**.

### The Solution

1. Buffer all lines in memory
2. When footer arrives, extract `store_id`, `drawer_id`, `transaction_number`
3. **Backfill** these values to all buffered lines
4. Send updated lines

```javascript
Line 1: { item_name: "Milk", store_id: null }  // don't know yet
Line 2: { item_name: "Bread", store_id: null } // still don't know
Line 3: { type: "end_header", store: "AB123" } // NOW we know!
    ↓ (backfill)
Line 1: { item_name: "Milk", store_id: "AB123" }  // updated!
Line 2: { item_name: "Bread", store_id: "AB123" } // updated!
Line 3: { type: "end_header", store: "AB123" }
```

### Why This Matters

1. **Complete Data** – Every line has all context, even if it arrived before context was known
2. **Supabase Integrity** – No null `store_id` values; cleaner queries
3. **Correctness** – Loss prevention team can filter by store reliably

---

## Key Takeaways

| Pattern | Problem It Solves | Tech Used |
|---------|-------------------|-----------|
| **UUID at Edge** | Track data end-to-end | crypto.randomUUID() |
| **State Machine** | Prevent transaction leaks | makeTxnMachine() in txnMachine.js |
| **Disk Queue** | Handle network failures | SQLite WAL |
| **Frigate Events** | Link video to transactions | Frigate API |
| **Real-time Streaming** | Live loss prevention visibility | Individual POST per line |
| **Metadata Backfill** | Complete data before sending | onLine() handler |

---

## Next Steps: Understanding the Codebase

**Read these files in order** to see these patterns in action:

1. `src/state/txnMachine.js` – State machine + UUID generation (Patterns 1, 2)
2. `src/index.js` – Real-time streaming + backfilling (Patterns 5, 6)
3. `src/queue/sqliteQueue.js` – Resilient queuing (Pattern 3)
4. `src/http/frigate.js` – Video bookmarking (Pattern 4)

---

## Questions for Your Team

- Does the UI team understand that lines arrive individually (not in batches)?
- Does the Supabase team need a schema adjustment now that `transaction_uuid` is always present?
- Are there any loss prevention workflows that depend on batch arrival?

