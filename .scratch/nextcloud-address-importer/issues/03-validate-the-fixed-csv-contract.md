# 03: Validate the fixed CSV contract

**What to build:** `import` can preflight a CSV for delimiter detection, headers, UTF-8/BOM, blank lines, required non-empty fields, extra-column warnings, and duplicate CSV identities without writing anything.

**Blocked by:** 01: Bootstrap installable TypeScript CLI.

**Status:** ready-for-agent

- [ ] CSV validation accepts comma-separated and semicolon-separated files with a required header row and standard CSV quoting.
- [ ] Validation enforces the exact required headers `first_name`, `last_name`, `telephone`, and `group` in any order, with no aliases.
- [ ] Validation fails on missing or duplicated required headers, ambiguous delimiter usage, empty required values after trimming, and duplicate CSV import identities.
- [ ] Extra columns and ignored blank lines are reported according to the spec without causing failure.
