# Release Notes: v1.0.0 – Field Testing Release

**Release Date**: November 27, 2025  
**Target**: Field deployment for loss prevention testing  
**Status**: ✅ Ready for production validation

---

## What's New

### 🎯 Transaction UUID Generation (Major Feature)

**Summary**: Edge device now generates and sends `transaction_uuid` for every transaction and line.

**Why This Matters**:
- ✅ **End-to-end traceability**: Every transaction has a unique ID from the moment it starts
- ✅ **Real-time linking**: UI can display lines as they arrive, knowing they belong to the same transaction
- ✅ **Simplified backend**: Supabase no longer needs complex trigger logic to infer UUIDs
- ✅ **IoT best practice**: ID generation at the edge (not in the database) is a proven pattern

**Technical Details**:
```javascript
// txnMachine.js now generates UUID on transaction start:
currentTxnId = randomUUID();  // crypto.randomUUID()

// Each line includes this UUID:
{
  "transaction_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "transaction_number": "1023612",
  ...
}

// Transaction summary also includes matching UUID:
{
  "transaction_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "total_amount": 27.54,
  ...
}
```

**Impact on Teams**:
- 📱 **UI Team**: Lines now arrive with consistent `transaction_uuid` throughout the transaction lifecycle. No changes needed to link logic, just use the UUID.
- 💾 **Supabase Team**: Schema can use `transaction_uuid` as the primary linking field. No trigger logic required.
- 🔧 **n8n Team**: No changes. Still acts as passthrough.

---

## Code Changes

### Modified Files

#### `src/state/txnMachine.js`
- ✅ Import `randomUUID` from crypto module
- ✅ Generate `currentTxnId` when transaction starts (IDLE → IN_TXN)
- ✅ Pass `txnId` through all callbacks (`onStart`, `onLine`, `onEnd`)
- ✅ Ensure `txnId` is consistent across all lines in a transaction

**Before**:
```javascript
// No UUID generation
if (state === 'IDLE') {
  state = 'IN_TXN';
  // ... no txnId
}
```

**After**:
```javascript
// Generate UUID on start
if (state === 'IDLE') {
  state = 'IN_TXN';
  currentTxnId = randomUUID();  // ← NEW
  if (typeof onStart === 'function') onStart(nowMs, currentTxnId);
}
```

#### `src/index.js`
- ✅ Receive `txnId` in `onStart` callback
- ✅ Include `transaction_uuid` in every line object
- ✅ Include `transaction_uuid` in transaction summary
- ✅ Apply UUID to Frigate event annotations
- ✅ Removed unused `POST_LINES_AS_BATCH` variable (was legacy config)

**Before**:
```javascript
line = {
  // ... no transaction_uuid
  transaction_number: currentTxn.meta.transaction_number || null,
}
```

**After**:
```javascript
line = {
  // ... 
  transaction_uuid: txnId || null,  // ← NEW
  transaction_number: currentTxn.meta.transaction_number || null,
}
```

#### `package-lock.json`
- Auto-generated npm lock file (dependencies unchanged)

---

## Payload Changes (⚠️ Important for Backend Teams)

### Transaction Line Payload (Now with UUID)

```json
{
  "micromanager_id": "mmd-rv1-2461b4-0",
  "transaction_uuid": "550e8400-e29b-41d4-a716-446655440000",  // ← NEW
  "transaction_number": "1023612",
  "line_type": "item",
  "description": "Large Pepperoni Pizza",
  "amount": 12.34,
  ...
}
```

### Transaction Summary Payload (Now with UUID)

```json
{
  "micromanager_id": "mmd-rv1-2461b4-0",
  "transaction_uuid": "550e8400-e29b-41d4-a716-446655440000",  // ← NEW
  "transaction_number": "1023612",
  "total_amount": 27.54,
  "frigate_event_id": "550e8400-e29b-41d4-a716-446655440000",
  ...
}
```

---

## Testing & Validation

### ✅ Lint: Passes
```bash
npm run lint
# ✓ No errors
```

### ✅ Unit Tests: Pass
```bash
npm test -- txnMachine
# PASS tests/unit/txnMachine.test.js
# ✓ transitions from idle to in_txn and back
```

### ✅ Integration Tests: TBD
Recommend running full suite in staging before field deployment:
```bash
npm test
```

### Manual Testing Checklist
- [ ] Connect edge device to test POS
- [ ] Process a test transaction
- [ ] Verify `transaction_uuid` appears in n8n webhook logs
- [ ] Confirm all lines for transaction have **same** UUID
- [ ] Check Frigate event annotation includes description
- [ ] Verify queue processes all lines successfully

---

## Documentation Updates

### New Docs (Read These!)
1. **`docs/IOT_PATTERNS.md`** – Explains the architectural decisions (UUID generation, state machine, queuing, real-time streaming)
   - *Audience*: Technical teams, new developers
   - *Length*: ~15 min read

2. **`docs/INTEGRATION_CONTRACT.md`** – Payload schemas, Supabase queries, error handling
   - *Audience*: Backend (Supabase), n8n, UI teams
   - *Use as*: Source of truth for data contracts

3. **`scripts/test-uuid-generation.js`** – Utility to verify UUID generation works (added earlier)

### Deprecated Docs
- ⚠️ `docs/DATA_FLOW_SUMMARY.md` – Outdated (assumes no UUID generation)
- ⚠️ `docs/BACKEND_MIGRATION_GUIDE.md` – May need updates for new schema

**Recommendation**: Review deprecated docs and archive or update them.

---

## Deployment Notes

### For Field Technicians
1. Build Docker image: `docker build -t micromanager-edge:v1.0.0 .`
2. Deploy to edge devices
3. Set environment variables:
   ```env
   N8N_LINES_URL=https://n8n-instance/webhook/transaction_lines
   N8N_TXNS_URL=https://n8n-instance/webhook/transactions
   MICROMANAGER_ID=mmd-rv1-<MAC-suffix>-<port>
   ```
4. Verify health: `curl http://edge-device:3000/healthz`

### For Backend Teams (Supabase)
1. **No schema changes required** for this release
2. **Verify**:
   - `transaction_lines` table can accept `transaction_uuid` column
   - `transactions` table can accept `transaction_uuid` column (as unique field)
3. **Update queries** to use `transaction_uuid` as primary linking field (not `micromanager_id + transaction_number`)
4. **Add foreign key**: `transaction_lines.transaction_uuid` → `transactions.transaction_uuid`

### For UI Teams
1. **No UI changes required** for this release (UI already expects UUIDs)
2. **Verify**:
   - Real-time subscription works with new payload structure
   - Lines display correctly with `transaction_uuid`
   - Video URL embedding works

### For n8n Teams
1. **No n8n changes required** (still acts as passthrough)
2. **Verify** webhooks receive payloads with new `transaction_uuid` field
3. **Consider adding**: Idempotency key generation (for deduplication safety)

---

## Known Limitations & Future Work

### Current Limitations
- ⚠️ Multi-terminal transactions not supported (each terminal = separate transaction)
- ⚠️ Frigate video bookmarking may timeout on very long transactions (>5 min)
- ⚠️ No built-in deduplication at n8n level (use idempotency keys if needed)

### Potential Improvements (Post-Testing)
- [ ] Add idempotency keys to prevent duplicate line posts
- [ ] Implement transaction "continuation" (if same `transaction_number` on multiple terminals)
- [ ] Add metrics export for Prometheus scraping
- [ ] Support for other POS systems beyond Verifone Commander

---

## Rollback Plan

If issues occur in the field:

1. **Immediate**: Revert to previous version
   ```bash
   git revert HEAD
   docker build -t micromanager-edge:v0.9.9 .
   # Redeploy to edge devices
   ```

2. **Supabase**: If lines were already inserted with `transaction_uuid`:
   ```sql
   -- Keep them; just don't link yet
   -- No data loss, just incomplete linking
   ```

3. **Contact**: If rollback needed, ping [Trey] with logs

---

## Questions & Support

### Debugging
- Check edge device logs: `journalctl -u micromanager-edge@<port>`
- Check queue depth: `curl http://edge-device:3000/healthz`
- View payloads in n8n webhook logs

### Feedback
- Report issues in GitHub/Slack
- Include: edge logs, n8n webhook history, Supabase query results

### Next Steps
- Field test for 7 days
- Gather feedback from loss prevention team
- Validate UUID linking in Supabase
- Plan UI dashboard deployment

---

## Signed Off By
- **Edge Device**: Trey ✅
- **Testing**: [TBD]
- **Supabase Backend**: [Other Agent] [TBD]
- **UI**: [Other Agent] [TBD]


