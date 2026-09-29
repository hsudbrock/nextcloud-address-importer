---
id: 0005
title: Decide import identity and duplicate handling
status: closed
labels:
  - wayfinder:grilling
assignee: openai/gpt-5.5
parent: 0001
blocked_by:
  - 0003
---

# Decide import identity and duplicate handling

## Question

How should the first-version import decide whether a CSV row creates a new contact, updates an existing contact, is skipped as a duplicate, or fails for human review?

## Resolution

The first version is create-only. It never updates existing Nextcloud contacts and does not maintain a persistent import database or use generated UIDs to recognize previous imports.

Before creating contacts, the importer checks the selected Nextcloud address book for likely duplicates. A likely duplicate is a contact with the same `first_name`, `last_name`, and `telephone` as a CSV row. `group` is not part of the identity match because group membership can change without making the row a different person.

If a matching contact already exists in Nextcloud, the CSV row is skipped and reported clearly. Duplicate rows inside the same CSV, using the same `first_name`, `last_name`, and `telephone`, fail validation before any contacts are written.
