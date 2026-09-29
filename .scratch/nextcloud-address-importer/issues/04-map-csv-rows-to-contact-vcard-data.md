# 04: Map CSV rows to contact/vCard data

**What to build:** Valid CSV rows become create-only contact plans with structured name, display name, generic telephone, one contact group/category, generated UID, and vCard output covered by unit tests.

**Blocked by:** 03: Validate the fixed CSV contract.

**Status:** ready-for-agent

- [ ] Valid rows map `first_name` and `last_name` to structured name fields and display name `first_name last_name`.
- [ ] `telephone` maps to a generic phone number while preserving the non-empty input text.
- [ ] `group` maps to one contact group/category via vCard categories.
- [ ] Generated vCards contain one contact with a unique UID and valid content suitable for CardDAV creation.
