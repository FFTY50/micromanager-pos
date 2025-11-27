# ⚠️ DEPRECATED: Data Flow & Transaction ID Generation Summary

**Status**: DEPRECATED as of Nov 27, 2025  
**Reason**: Superseded by edge device UUID generation (see INTEGRATION_CONTRACT.md)  
**Archive Date**: This file will be removed in v2.0.0  

---

## Migration Path

**If you're new**: Read these instead:
1. `docs/INTEGRATION_CONTRACT.md` – Current payload schemas and database design
2. `docs/IOT_PATTERNS.md` – Understanding UUID generation at edge
3. `RELEASE_NOTES.md` – What changed and why

**If you have existing code based on this doc**: You need to update:
- ✅ Old assumption: "Database generates UUIDs" → ❌ New: "Edge generates UUIDs"
- ✅ Old assumption: "Postgres trigger links lines to transactions" → ❌ New: "transaction_uuid links them directly"
- ✅ Old design: "v2_transaction_lines table" → ❌ New: "transaction_lines table (schema in INTEGRATION_CONTRACT.md section 3)"

---

## What Changed (Summary)

### Old Flow (❌ Deprecated)
```
Edge Device sends: { micromanager_id, transaction_number, lines: [...] }
    ↓
Database trigger receives it
    ↓
Trigger generates UUID + links lines
    ↓
Problem: UUID generated after arrival, complex trigger logic
```

### New Flow (✅ Current)
```
Edge Device generates: UUID = randomUUID()
    ↓
Edge Device sends: { transaction_uuid, lines: [{ transaction_uuid, ... }] }
    ↓
Database stores it directly (no trigger needed)
    ↓
Benefit: UUID present from start to finish, simpler backend
```

---

## Archived Content

The original content is preserved below for historical reference but should not be used for new implementations.

---

# [ORIGINAL CONTENT - DO NOT USE]

*[Original DATA_FLOW_SUMMARY.md content removed from active documentation]*

To view the original archived version, see git history:
```bash
git show HEAD~5:docs/DATA_FLOW_SUMMARY.md
```

---

## Questions?

See `docs/INTEGRATION_CONTRACT.md` or ask in GitHub issues.
