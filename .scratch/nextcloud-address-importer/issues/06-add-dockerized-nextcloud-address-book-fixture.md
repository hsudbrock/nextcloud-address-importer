# 06: Add Dockerized Nextcloud address-book fixture

**What to build:** A single local command runs a clean Dockerized Nextcloud integration fixture with synthetic credentials and verifies address-book listing against a real server.

**Blocked by:** 05: Discover CardDAV address books.

**Status:** ready-for-agent

- [ ] A single local command runs the real Nextcloud integration fixture.
- [ ] The fixture uses fixed non-secret local test credentials and synthetic data only.
- [ ] Each run starts from a clean isolated Docker state by creating and destroying volumes.
- [ ] The integration fixture verifies address-book listing against a real Nextcloud instance.
