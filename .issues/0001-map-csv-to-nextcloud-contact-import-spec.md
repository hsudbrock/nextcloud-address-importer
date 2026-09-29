---
id: 0001
title: CSV-to-Nextcloud contact import specification
status: closed
labels:
  - wayfinder:map
assignee:
parent:
blocked_by: []
---

# CSV-to-Nextcloud contact import specification

## Destination

A specification for a local CLI tool that imports contacts from comma-separated or semicolon-separated CSV files directly into Nextcloud Contacts via CardDAV.

The specification should be complete enough for a later implementation session to build the first version without making unresolved product or API decisions.

## Notes

Domain: local command-line import from CSV into Nextcloud Contacts.

Standing choices already made: the destination is a specification, the surface is a local CLI, the target is direct CardDAV import, and the first version uses a fixed CSV shape while leaving later user-configurable mapping out of the initial route.

Use the `grilling` and `domain-modeling` skills for decision tickets. Use the `research` skill for CardDAV/Nextcloud API facts.

Local tracker convention: open child tickets are files in `.issues/` whose `parent` is `0001`. A ticket is blocked when `blocked_by` contains an open ticket id. An empty `assignee` means unclaimed.

## Decisions so far

<!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [Decide the fixed CSV contract](0002-decide-fixed-csv-contract.md): v1 uses a required UTF-8 header-row CSV with comma/semicolon auto-detection, exactly `first_name`, `last_name`, `telephone`, and `group` as required non-empty fields, generic phone values, and one Nextcloud group/category per row.
- [Research Nextcloud CardDAV contact write requirements](0003-research-nextcloud-carddav-contact-write-requirements.md): Nextcloud imports should use CardDAV discovery from `/remote.php/dav`, app-password Basic auth as the first-version baseline, `PUT` of one vCard resource with unique `UID`, and ETag/conditional handling if updates are supported.
- [Decide Nextcloud connection and authentication inputs](0004-decide-nextcloud-connection-and-authentication-inputs.md): v1 uses TOML config plus CLI/env overrides, requires app-password auth, discovers address books, and selects the only address book automatically while requiring selection when multiple exist.
- [Decide import identity and duplicate handling](0005-decide-import-identity-and-duplicate-handling.md): v1 is create-only, skips existing Nextcloud contacts matched by first name, last name, and telephone, and fails before writing when the CSV itself contains duplicate identities.
- [Decide validation errors and run reporting](0006-decide-validation-errors-and-run-reporting.md): v1 prevalidates the full CSV before writing, treats skipped existing duplicates as successful idempotent behavior, retries failed writes once, reports partial failures, and uses exit codes `0`, `1`, and `2`.
- [Decide CLI commands and safety UX](0007-decide-cli-commands-and-safety-ux.md): v1 exposes `import` and `address-books`, supports config/env/flag overrides plus dry-run, confirmation, JSON reports, and has no destructive operations.
- [Decide runtime packaging and installation](0009-decide-runtime-packaging-and-installation.md): v1 targets Node.js/TypeScript on current LTS or newer, supports Linux and macOS, must run from the repo, and must be npm-installable as `nextcloud-address-importer`.
- [Decide testing strategy and Nextcloud Docker fixture](0010-decide-testing-strategy-and-nextcloud-docker-fixture.md): v1 requires unit tests, mocked CardDAV tests, and Dockerized Nextcloud integration tests using synthetic fixtures, clean isolated volumes, and a single local test command.
- [Assemble first-version import specification](0008-assemble-first-version-import-spec.md): The first-version specification is assembled in `docs/specs/first-version-importer.md`, and no further decision tickets are needed before implementation.

## Not yet specified

None.

## Out of scope

- Building the importer during this wayfinding map; this map produces decisions and a specification, not implementation.
- A hosted web UI, Nextcloud app/plugin UI, or developer-only library as the primary surface.
- Manual `.vcf` export/import as the first-version target.
