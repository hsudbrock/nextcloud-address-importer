---
id: 0002
title: Decide the fixed CSV contract
status: closed
labels:
  - wayfinder:grilling
assignee: openai/gpt-5.5
parent: 0001
blocked_by: []
---

# Decide the fixed CSV contract

## Question

What exact fixed CSV input contract should the first-version CLI accept: delimiter detection rules, header names, required columns, optional columns, encoding expectations, empty-value behavior, and how names/addresses/phones/emails map into contacts?

## Resolution

The first-version CLI accepts CSV files with a required header row and auto-detects either comma or semicolon as the delimiter. If delimiter usage in the header is mixed or ambiguous, validation fails and asks the user to use one delimiter type.

Files must be UTF-8, with an optional BOM allowed. LF and CRLF line endings are accepted. Standard CSV quoting is supported. Completely blank lines are ignored.

The required canonical headers are exactly `first_name`, `last_name`, `telephone`, and `group`. Header order may vary, but no aliases are accepted in the first version. Missing or duplicated required headers fail validation. Extra columns are ignored with a warning.

All four required fields must be non-empty after trimming leading and trailing whitespace. Values are trimmed before validation and import.

`first_name` and `last_name` map to structured vCard name fields, and the display name is `first_name last_name`. `telephone` maps to a generic phone number and preserves any non-empty text value. `group` maps to one Nextcloud contact group/category via vCard `CATEGORIES`; the first version supports exactly one group per row.
