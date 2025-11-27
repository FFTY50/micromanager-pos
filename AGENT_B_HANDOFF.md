# 🤝 Handoff to Agent B: Supabase Backend & React UI

**From**: Trey (Agent A - Edge Device)  
**To**: Agent B (Supabase Backend + UI Team)  
**Date**: November 27, 2025  
**Status**: Ready for your work  

---

## TL;DR

Edge device now generates **transaction UUIDs** for every transaction. Your job:

1. Create Supabase schema (`transactions` + `transaction_lines` tables)
2. Build GraphQL queries for real-time transaction display
3. Build React components to show receipts + video in real-time
4. Test end-to-end with live payloads

**Estimated effort**: ~2-3 days for backend + UI  
**Blocker risk**: ⏳ Will coordinate on deployment timing

---

## What Agent A (Edge Device) Just Did ✅

- ✅ Generate `transaction_uuid` (UUID) for every transaction
- ✅ Stream individual lines in **real-time** (not batch)
- ✅ Include UUID in every payload (lines + transaction summary)
- ✅ Tag Frigate video events with transaction metadata
- ✅ Handle network retries with SQLite queue

**Result**: Edge device sends payloads with this structure:
```json
{
  "transaction_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "transaction_number": "1023612",
  "lines": [
    { "line_type": "item", "amount": 12.34, "transaction_uuid": "550e8400..." },
    { "line_type": "item", "amount": 15.20, "transaction_uuid": "550e8400..." },
    ...
  ]
}
```

---

## What You Need to Build

### Phase 1: Database Schema (Day 1)

**Read**: `docs/INTEGRATION_CONTRACT.md` section 3

Create these tables in Supabase:

```sql
-- transactions (parent)
-- transaction_lines (individual lines)
```

Schema, indexes, and foreign keys are defined in the doc. Copy-paste ready.

### Phase 2: Backend Queries (Day 1-2)

**Read**: `docs/INTEGRATION_CONTRACT.md` section 4

Implement these GraphQL queries:

1. **Get transaction with all lines** – For receipt detail view
2. **Real-time subscription for lines** – For live POS feed
3. **Sales aggregate by store** – For dashboard

All query examples are in the contract.

### Phase 3: React UI (Day 2-3)

**Read**: `RELEASE_NOTES.md` section "For UI Teams"

Build:
- Receipt display component (shows transaction lines as they arrive)
- Real-time updates (subscribe to new lines, auto-refresh)
- Video embed (if `frigate_url` is present)
- Sales dashboard (aggregate view by store)

---

## Key Documents (Read in Order)

| Document | Purpose | Read Time |
|----------|---------|-----------|
| **INTEGRATION_CONTRACT.md** | Payload schemas + schema + queries | 25 min |
| **IOT_PATTERNS.md** | Why the system works this way | 15 min |
| **AGENTS_COORDINATION.md** | How we coordinate across workspaces | 10 min |
| **RELEASE_NOTES.md** | What changed in this deployment | 10 min |

**Start with**: `docs/INTEGRATION_CONTRACT.md` section 1-4

---

## Data Flow (High Level)

```
📱 POS Terminal
    ↓ (serial data)
🔧 Edge Device (Agent A)
    ├─ Parse receipt
    ├─ Generate transaction_uuid
    ├─ Stream individual lines
    └─ Send summary when done
    ↓ (HTTP POST with UUID)
🔗 n8n (Passthrough)
    ↓ (REST API)
💾 Supabase (Agent B Builds)
    ├─ Store transactions
    └─ Store transaction_lines
    ↓ (GraphQL Subscription)
📊 React UI (Agent B Builds)
    ├─ Display receipt in real-time
    ├─ Show video bookmark
    └─ Show sales dashboard
```

---

## Real-Time Flow Example

**What you'll see as lines arrive**:

```
14:32:00 – Edge detects line 1
  → POST {transaction_uuid, line_type: "item", ...}
  → Supabase INSERT
  → UI subscription receives → displays "Item 1"

14:32:01 – Line 2 arrives
  → POST {transaction_uuid, line_type: "item", ...}
  → Supabase INSERT
  → UI updates → shows "Item 1", "Item 2"

14:32:45 – Cashier line (end)
  → POST {transaction_uuid, total_amount: 27.54, ...}
  → Supabase INSERT transactions summary
  → UI shows "Complete" + Frigate video link
```

**Your UI should handle**: Lines arriving individually, not all at once.

---

## Acceptance Criteria ✅

Your work is done when:

- [ ] Supabase schema created (transactions + transaction_lines tables)
- [ ] All indexes + foreign keys in place
- [ ] GraphQL queries implemented (all 3 from contract)
- [ ] React components built (receipt + dashboard)
- [ ] Real-time subscription working
- [ ] Video URL embeds correctly when present
- [ ] Can display 50+ lines in real-time without lag
- [ ] Handles null `frigate_url` gracefully
- [ ] **Create `BACKEND_READY_CHECKLIST.md`** when done

---

## Communication Format

### When You Start
Create `docs/BACKEND_READY_CHECKLIST.md` and fill it as you progress:

```markdown
# Backend Readiness Checklist

**Status**: [In Progress | Ready]
**Last Updated**: [Date]

## Schema ✅
- [x] transactions table
- [x] transaction_lines table
- [x] Foreign keys
- [ ] Indexes

## Queries ✅
- [x] Get transaction with lines
- [ ] Real-time subscription
- [ ] Sales aggregate

## UI
- [ ] Receipt component
- [ ] Real-time updates
- [ ] Video embed

## Blockers / Questions
- None yet

## Contact
- Backend: Agent B
- Question? File GitHub issue or update this doc
```

### When You're Ready
1. Update `BACKEND_READY_CHECKLIST.md` with ✅ all items
2. Set status to "✅ Ready"
3. Ping Agent A: "Backend ready, standing by for coordinated deployment"

---

## Important Notes

### ⚠️ Real-Time = Individual Lines
- Each line is POSTed **immediately** (not batched)
- UI must handle lines arriving one at a time
- Don't wait for transaction to complete before updating

### ⚠️ UUID is Always Present
- `transaction_uuid` appears in every line
- All lines in a transaction have the **same UUID**
- Use UUID to group lines in the UI

### ⚠️ Transaction Number May Be Null
- Early lines might have `transaction_number: null`
- It's backfilled when receipt footer arrives
- Query by `transaction_uuid`, not `transaction_number`

### ⚠️ Video URL May Be Null
- If Frigate fails, `frigate_url` is null
- UI should show "Video unavailable" (not break)
- Handle gracefully

---

## Questions You Might Have

**Q: When does Agent A deploy?**  
A: After you signal "Backend Ready". We'll coordinate timing.

**Q: Can I test before Agent A deploys?**  
A: Use `scripts/test-uuid-generation.js` in edge repo to generate sample payloads.

**Q: What if I need to change the schema?**  
A: Update INTEGRATION_CONTRACT.md section 3, notify Agent A. We'll sync.

**Q: How often do lines arrive?**  
A: 1-50 lines per transaction, 1 line every 0.5-2 seconds (typical checkout).

**Q: Can I use the same database as the old system?**  
A: Yes, new tables are separate. Old system untouched. Plan migration later.

---

## Next Steps

1. ✅ Read `docs/INTEGRATION_CONTRACT.md` (sections 1-4)
2. ✅ Create Supabase schema
3. ✅ Implement queries
4. ✅ Build React components
5. ✅ Create `BACKEND_READY_CHECKLIST.md`
6. ✅ Signal Agent A: "Ready"

---

## Coordination Contacts

- **Edge Device (Agent A)**: Trey
- **This Handoff**: Auto-generated by Agent A
- **Questions?**: File GitHub issues or comment on this doc

---

**Ready to build?** Start with `docs/INTEGRATION_CONTRACT.md` section 1. You got this! 🚀

