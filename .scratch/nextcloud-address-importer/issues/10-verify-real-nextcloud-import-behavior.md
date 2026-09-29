# 10: Verify real Nextcloud import behavior

**What to build:** Dockerized Nextcloud integration tests cover happy-path contact creation from synthetic CSV and duplicate rerun behavior from a clean isolated volume.

**Blocked by:** 06: Add Dockerized Nextcloud address-book fixture; 08: Create contacts with safe reporting.

**Status:** ready-for-agent

- [ ] Integration tests create contacts from a synthetic CSV in a real Dockerized Nextcloud address book.
- [ ] Integration tests verify duplicate rerun behavior against the same synthetic import data.
- [ ] Integration tests use only synthetic contact fixtures committed to the repository.
- [ ] The Dockerized tests are structured so they can run as an optional slower CI job later.
