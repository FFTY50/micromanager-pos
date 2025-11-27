# Multi-Agent Coordination Guide

**Purpose**: Enable Claude/Cursor agents across multiple workspaces to coordinate on $50 Manager Micromanager project.

**Current Setup**: 
- **Agent A** (this workspace): Edge Device (Node.js backend)
- **Agent B** (another workspace): Supabase Backend + UI (React/TypeScript)

---

## The Problem

Agents cannot directly communicate with each other. However, we can use **shared documentation and explicit handoffs** to coordinate work.

---

## Solution: Source-of-Truth Documents

### 1. **INTEGRATION_CONTRACT.md** (Already Created)

This is your **single source of truth** for the data flowing between systems.

**For Agent B (Supabase/UI Team)**:
- Read `INTEGRATION_CONTRACT.md` section 3 for schema requirements
- Read section 4 for Supabase query contracts
- Read section 5 for real-time data flow examples
- Read section 9 for deployment checklist

**Key Takeaway for Agent B**:
```
✅ Transaction lines now arrive with transaction_uuid
✅ Each line is streamed immediately (not batched)
✅ Transaction summary arrives when CSH: line detected
✅ Use transaction_uuid to link transaction_lines → transactions
```

---

## 2. **IOT_PATTERNS.md** (Already Created)

Explains the *why* behind architectural decisions.

**For all new team members**:
- Read to understand state machine, UUID generation, queuing, Frigate integration
- Understand why we stream lines individually (real-time)
- Understand why UUID is generated at edge (not in database)

---

## 3. **RELEASE_NOTES.md** (Already Created)

Documents what changed and deployment steps.

**For Agent B (Backend/UI)**:
- Section "Payload Changes": See new UUID field in payloads
- Section "For Backend Teams": Supabase steps
- Section "For UI Teams": UI integration steps
- Section "Deployment Notes": Synchronized deployment checklist

---

## How Agent B Should Use These Docs

### Step 1: Understand the Contract
```
Agent B reads: INTEGRATION_CONTRACT.md section 1
Question: "What payloads does the edge device send?"
Answer: Tables 1a (lines) and 1b (transactions) show exact schemas
```

### Step 2: Implement Schema
```
Agent B reads: INTEGRATION_CONTRACT.md section 3
Task: "Create transaction_lines and transactions tables"
Action: Run the SQL provided in section 3
```

### Step 3: Implement Queries
```
Agent B reads: INTEGRATION_CONTRACT.md section 4
Task: "Build Supabase queries for UI"
Action: Copy the GraphQL queries provided in section 4
```

### Step 4: Build UI
```
Agent B reads: RELEASE_NOTES.md "For UI Teams"
Task: "Integrate real-time transaction display"
Action: Follow deployment checklist, test with real payloads
```

---

## Adding Agent B's Work Back to Agent A

When Agent B completes work (e.g., "Supabase queries are ready"), they should document it in a new file that Agent A can read.

**Suggested File**: `docs/BACKEND_READY_CHECKLIST.md`

```markdown
# Backend Readiness Checklist

**Last Updated**: [Date]
**Status**: [In Progress | Ready]

## Supabase Schema ✅
- [x] transaction_lines table created
- [x] transactions table created
- [x] Foreign keys configured
- [x] Indexes created
- [x] RLS policies applied

## Queries ✅
- [x] Query: Get transaction with lines
- [x] Query: Real-time subscription for lines
- [x] Query: Sales aggregate by store

## n8n Integration ✅
- [x] Webhook for transaction_lines endpoint ready
- [x] Webhook for transactions endpoint ready
- [x] Error handling implemented
- [x] Retry logic tested

## Known Issues / Blockers
- None currently

## Ready for Edge Device to Deploy?
✅ YES – Agent B is ready to receive payloads

## Contact
- Supabase Owner: [Agent B]
- Question? Comment on this file or file a GitHub issue
```

**Agent A (you)** would then read this before pushing, knowing the backend is ready.

---

## Practical Workflow for Coordination

### Day 1: Agent A (You) – Release Edge Device v1.0.0
1. ✅ Generate UUIDs
2. ✅ Include UUIDs in payloads
3. ✅ Create INTEGRATION_CONTRACT.md
4. ✅ Commit and document in RELEASE_NOTES.md
5. ✅ Notify Agent B: "Read INTEGRATION_CONTRACT.md section 3 & 4"

### Days 2-3: Agent B – Build Backend & UI
1. Read INTEGRATION_CONTRACT.md
2. Create Supabase schema (transactions, transaction_lines tables)
3. Create Supabase queries (real-time subscriptions, aggregates)
4. Build React components for receipt display
5. Create BACKEND_READY_CHECKLIST.md

### Day 4: Agent A – Receive Status
1. Read BACKEND_READY_CHECKLIST.md
2. If ✅ Ready, proceed to field testing
3. If ❌ Blockers, address them

### Day 5+: Joint Field Testing
1. Edge device sends UUIDs
2. Supabase receives and stores them
3. UI displays them in real-time
4. All teams monitor for issues

---

## Repository Structure for Coordination

```
/docs/
  ├─ INTEGRATION_CONTRACT.md        ← Source of truth (edge → supabase → ui)
  ├─ IOT_PATTERNS.md                ← Why decisions were made
  ├─ BACKEND_READY_CHECKLIST.md     ← Agent B's status (created by Agent B)
  ├─ DEPLOYMENT_CHECKLIST.md        ← [Existing] deployment steps
  └─ ...

/RELEASE_NOTES.md                   ← What changed
/AGENTS_COORDINATION.md             ← This file
```

---

## What I (Agent A) Cannot Do

❌ I cannot:
- Call the other agent
- Access the other workspace
- Run code in the other workspace
- See the other agent's progress in real-time

✅ But I (and both agents) can:
- Read shared docs in git
- Use INTEGRATION_CONTRACT.md as the contract
- Ask clarifying questions via comments/issues
- Update coordination docs for the other agent to read

---

## Tips for Success

### 1. Keep Contracts Versioned
```
# INTEGRATION_CONTRACT.md
**Version**: 1.0.0
**Last Updated**: Nov 27, 2025
**Breaking Changes**: None
```

If Agent B needs to change payloads, bump the version and notify Agent A.

### 2. Use Comments in Code
When Agent B implements a query, add a comment pointing to the contract:
```javascript
// See INTEGRATION_CONTRACT.md section 4, Query 1
const getTransactionWithLines = async (txn_uuid) => {
  // implementation
};
```

### 3. Create "Blockers" Issues
If Agent B is stuck waiting on something from Agent A, document it:
```markdown
## Blocker
Agent A needs to confirm: "Will edge device always send frigate_url, or can it be null?"
See INTEGRATION_CONTRACT.md section 5, error scenario 3.
```

### 4. Test with Real Payloads
Create a `test-payloads.json` file that both agents can reference:
```json
{
  "transaction_line_sample": { ... },
  "transaction_summary_sample": { ... }
}
```

Agent B uses this to build/test queries before Agent A deploys.

---

## Next Steps

1. **Send this file to Agent B**: Paste AGENTS_COORDINATION.md + INTEGRATION_CONTRACT.md
2. **Tag Agent B**: "Start with INTEGRATION_CONTRACT.md section 3, implement Supabase schema"
3. **Set DRI (Directly Responsible Individual)**: 
   - Agent A = Edge Device reliability
   - Agent B = Supabase schema + query performance
4. **Weekly Sync**: Agents share status via BACKEND_READY_CHECKLIST.md + similar files

---

## Example: What Agent B Should See

(This is what you'd send them)

```markdown
# For Cursor Agent B (Supabase/UI Team)

You have been assigned the Supabase Backend and React UI for $50 Manager Micromanager.

## Your Task
Build the database backend and real-time UI to display transactions + video.

## Start Here
1. Read `/docs/INTEGRATION_CONTRACT.md` (10 min)
2. Read `/docs/IOT_PATTERNS.md` (15 min)
3. Review `/RELEASE_NOTES.md` section "For Backend/UI Teams"

## What You Need to Build
1. **Supabase Schema** (INTEGRATION_CONTRACT.md section 3)
   - `transactions` table
   - `transaction_lines` table
   - Foreign keys + indexes

2. **Supabase Queries** (INTEGRATION_CONTRACT.md section 4)
   - Get transaction with all lines
   - Real-time subscription for lines
   - Sales aggregate by store

3. **React UI** (RELEASE_NOTES.md "For UI Teams")
   - Receipt display (transaction lines)
   - Real-time update (as lines stream in)
   - Embed Frigate video (if available)
   - Sales dashboard

## What Agent A (Edge Device) Will Send
- Real-time transaction lines (each has transaction_uuid)
- Transaction summary (when cashier line detected)
- Video event URL (if Frigate integration enabled)
- All via n8n webhooks

## Questions?
Comment on AGENTS_COORDINATION.md or create a GitHub issue.
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Agent B starts work before reading contract | Keep INTEGRATION_CONTRACT.md as README (first thing to read) |
| Payload changes break Agent B's work | Use versioning in contract; require Agent A approval before changes |
| Agent B finishes before Agent A deploys | Both stage code; use feature flags if needed |
| Supabase schema doesn't match payloads | Regular syncs; test with real payloads from Agent A |

---

## Success Criteria

✅ **Agent Coordination Works When**:
1. Agent B can read INTEGRATION_CONTRACT.md and build schema without asking
2. Agent A can push code and Agent B seamlessly receives payloads
3. UI displays real-time transactions + video without delays
4. Field test runs for 7 days with no coordination issues
5. Both agents use AGENTS_COORDINATION.md for future handoffs

---

## Revision History

| Date | Agent | Change |
|------|-------|--------|
| Nov 27, 2025 | A | Initial coordination framework |

---

**Remember**: The contract (INTEGRATION_CONTRACT.md) is your shared language. Keep it updated, and both agents will stay in sync.

