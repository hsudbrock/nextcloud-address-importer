# 09: Handle write failures and privacy-safe partial imports

**What to build:** CardDAV write failures retry once, then continue; partial imports exit `2`; reports distinguish created/skipped/warnings/failed writes without credentials or contact values by default.

**Blocked by:** 08: Create contacts with safe reporting.

**Status:** ready-for-agent

- [ ] Failed CardDAV writes retry once and then continue with remaining contacts if the retry fails.
- [ ] Partial import runs clearly report created contacts, skipped duplicates, warnings, and failed writes.
- [ ] Partial import runs exit `2` after write attempts fail.
- [ ] Reports and logs never include credentials and avoid contact values by default.
