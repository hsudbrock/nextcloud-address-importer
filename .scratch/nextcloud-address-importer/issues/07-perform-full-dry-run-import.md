# 07: Perform full dry-run import

**What to build:** `import --dry-run` validates CSV, resolves the target address book, checks existing Nextcloud contacts for likely duplicates, reports would-create/skipped/warnings, and writes nothing.

**Blocked by:** 04: Map CSV rows to contact/vCard data; 05: Discover CardDAV address books.

**Status:** ready-for-agent

- [ ] Dry run performs full preflight validation and target address book resolution.
- [ ] Dry run checks existing contacts for likely duplicates by first name, last name, and telephone.
- [ ] Dry run reports contacts that would be created, skipped duplicates, and warnings.
- [ ] Dry run performs no CardDAV contact creation writes.
