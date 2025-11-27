# ⚠️ DEPRECATED: Backend Migration Guide (V2 Architecture)

**Status**: DEPRECATED as of Nov 27, 2025  
**Reason**: Superseded by current INTEGRATION_CONTRACT.md (v1.0.0 schema, no v2_ prefix needed)  
**Archive Date**: This file will be removed in v2.0.0  

---

## Migration Path

**If you're setting up the backend**: Read these instead:
1. `docs/INTEGRATION_CONTRACT.md` section 3 – Current schema (transactions + transaction_lines tables)
2. `docs/INTEGRATION_CONTRACT.md` section 4 – Required queries
3. `RELEASE_NOTES.md` section "For Backend Teams" – Deployment steps

**Key Difference from This Deprecated Doc**:
- ✅ Old doc recommended `v2_transactions` + `v2_transaction_lines` tables
- ❌ New approach: Use standard `transactions` + `transaction_lines` tables (no v2_ prefix)
- ✅ Reason: v1.0.0 is already the modern design (UUID-based, no triggers needed)

---

## What Changed (Summary)

### Old Recommendation (❌ Deprecated)
- Create `v2_transactions` and `v2_transaction_lines` tables
- Run parallel migration alongside old tables
- Use Postgres triggers to link them

### New Recommendation (✅ Current)
- Create single `transactions` and `transaction_lines` tables
- Use `transaction_uuid` as primary linking field (generated at edge)
- No triggers needed
- Simpler, faster, cleaner

---

## If You Already Used the Old Schema

**Option 1**: Migrate to new schema
```sql
-- After implementing new tables per INTEGRATION_CONTRACT.md:
ALTER TABLE transactions RENAME TO transactions_old;
ALTER TABLE transaction_lines RENAME TO transaction_lines_old;
-- New tables are now active (created by deploy script)
```

**Option 2**: Keep old schema, add new tables in parallel
```sql
-- Keep v2_transactions and v2_transaction_lines
-- Also create transactions and transaction_lines per INTEGRATION_CONTRACT.md
-- Route new deployments to new tables, old deployments to old tables
```

**Contact**: If you're in the middle of this migration, reach out in GitHub issues.

---

## Archived Content

The original content is preserved below for historical reference but should not be used for new implementations.

---

# [ORIGINAL CONTENT - DO NOT USE]

*[Original BACKEND_MIGRATION_GUIDE.md content removed from active documentation]*

To view the original archived version, see git history:
```bash
git show HEAD~5:docs/BACKEND_MIGRATION_GUIDE.md
```

---

## Questions?

See `docs/INTEGRATION_CONTRACT.md` or ask in GitHub issues.
