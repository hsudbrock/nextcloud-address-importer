# 08: Create contacts with safe reporting

**What to build:** `import --yes` creates non-duplicate contacts through CardDAV using `PUT`, `If-None-Match: *`, app-password auth, human summary, optional JSON report, and correct exit codes for success.

**Blocked by:** 07: Perform full dry-run import.

**Status:** ready-for-agent

- [ ] Import creates only non-duplicate contacts in the selected address book using CardDAV create semantics.
- [ ] Interactive import asks for confirmation before creating contacts, while `--yes` skips confirmation.
- [ ] Existing likely duplicates are skipped and reported as successful idempotent behavior.
- [ ] Successful runs produce a human-readable summary, optional JSON report, and exit `0` even when warnings or skipped duplicates are present.
