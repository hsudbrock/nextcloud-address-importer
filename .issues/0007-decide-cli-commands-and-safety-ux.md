---
id: 0007
title: Decide CLI commands and safety UX
status: closed
labels:
  - wayfinder:grilling
assignee: openai/gpt-5.5
parent: 0001
blocked_by:
  - 0002
  - 0004
  - 0005
  - 0006
---

# Decide CLI commands and safety UX

## Question

What command shape and safety UX should the specification require, including flags, dry-run behavior, confirmation prompts, address-book selection flow, sample command examples, and whether destructive updates are allowed in the first version?

## Resolution

The main command is `nextcloud-address-importer import contacts.csv`.

The first version also includes `nextcloud-address-importer address-books` to test connection/discovery and list available address books.

The import command supports `--config`, `--server-url`, `--username`, `--app-password`, `--address-book`, `--dry-run`, `--yes`, and `--json-report`.

`--dry-run` validates the CSV, connects to Nextcloud, discovers or selects the address book, checks for existing duplicates, and writes nothing.

Interactive import asks for confirmation before creating contacts. `--yes` skips confirmation. Non-interactive mode fails if confirmation, app-password prompt, or address-book selection would be required.

If multiple address books exist and no address book is configured in interactive mode, the CLI shows a numbered list with display names and URLs and lets the user choose.

The first version has no destructive operations: no updates, deletes, overwrites, or duplicate overwrites.
