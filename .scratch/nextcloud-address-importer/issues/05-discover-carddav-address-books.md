# 05: Discover CardDAV address books

**What to build:** `address-books` connects to Nextcloud/CardDAV, discovers principal/addressbook home/address books, handles auth/discovery/address-book ambiguity errors, and lists display names plus URLs.

**Blocked by:** 02: Resolve connection configuration safely.

**Status:** ready-for-agent

- [ ] The CLI discovers address books through CardDAV starting from the server DAV base rather than hard-coded address book paths.
- [ ] `address-books` lists discovered address book display names and URLs.
- [ ] Configured address book values can identify either a display name or CardDAV URL/path after discovery.
- [ ] Mocked CardDAV tests cover authentication failure, discovery failure, address-book ambiguity, and network failure.
