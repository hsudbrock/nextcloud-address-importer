---
id: 0006
title: Decide validation errors and run reporting
status: closed
labels:
  - wayfinder:grilling
assignee: openai/gpt-5.5
parent: 0001
blocked_by:
  - 0002
  - 0003
---

# Decide validation errors and run reporting

## Question

What validation, error-handling, partial-failure, logging, summary reporting, and exit-code behavior should the CLI specify for malformed CSV rows and CardDAV failures?

## Resolution

The importer validates the whole CSV before writing anything to Nextcloud. If validation fails, no contacts are written. Row-level validation errors include row number, field name, and message.

Existing Nextcloud duplicates are skipped, reported clearly, and treated as successful idempotent behavior. Skipped duplicates, ignored extra columns, and other warnings do not make the run fail.

If a CardDAV write fails after validation, the importer retries once. If the retry fails, the importer continues with remaining contacts and reports the failed row. Because CardDAV writes are not transactional across contacts, the run report must clearly distinguish created contacts, skipped duplicates, warnings, and failed writes.

End-of-run reporting includes a human-readable terminal summary. The CLI may also write an optional JSON report file for automation.

Exit codes are `0` for success, including warnings and skipped duplicates; `1` for validation, config, authentication, or discovery failure before writes; and `2` for partial import/write failures after some writes were attempted.

Reports and logs must never include credentials. By default they should avoid contact values and use row numbers, field names, and counts instead.
