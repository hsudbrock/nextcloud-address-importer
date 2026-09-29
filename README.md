# nextcloud-address-importer

Local CLI that imports contacts from a fixed-contract CSV file directly into Nextcloud Contacts via CardDAV.

Version 1 is intentionally narrow: fixed CSV columns, create-only import, no updates, no deletes, no overwrites, no configurable column mapping. See `docs/specs/first-version-importer.md` for the full specification.

## Requirements

- Node.js 20 or newer, on Linux or macOS.
- A Nextcloud instance with Contacts (CardDAV) reachable from your machine.
- Docker, only for the optional Dockerized integration tests.

## Running the CLI

During development, run directly from the repository:

```sh
npm run dev -- import contacts.csv --yes
npm run dev -- address-books
```

Or build once and run the compiled CLI:

```sh
npm run build
npm start -- import contacts.csv --yes
```

The package exposes the `nextcloud-address-importer` executable, so an npm-compatible install also works:

```sh
npm pack
npm install --global nextcloud-address-importer-0.1.0.tgz
nextcloud-address-importer import contacts.csv --yes
```

## Configuration and authentication

The importer needs a server URL, a username, the CSV path, and a Nextcloud app password.

A Nextcloud app password is a separate client password you generate in Nextcloud under Personal Settings → Security → Devices & sessions. It is **not** your normal web account password. Prefer passing it via flag or environment variable, or typing it at the hidden interactive prompt, rather than storing it in a file.

Value precedence (highest first):

1. CLI flags
2. Environment variables
3. Config file

| Setting       | Flag             | Environment variable                                | Config key     |
| ------------- | ---------------- | --------------------------------------------------- | -------------- |
| Server URL    | `--server-url`   | `NEXTCLOUD_ADDRESS_IMPORTER_SERVER_URL`             | `server_url`   |
| Username      | `--username`     | `NEXTCLOUD_ADDRESS_IMPORTER_USERNAME`               | `username`     |
| App password  | `--app-password` | `NEXTCLOUD_ADDRESS_IMPORTER_APP_PASSWORD`           | `app_password` |
| Address book  | `--address-book` | `NEXTCLOUD_ADDRESS_IMPORTER_ADDRESS_BOOK`           | `address_book` |

The default config path is `~/.config/nextcloud-address-importer/config.toml`; `--config <path>` overrides it. Example:

```toml
server_url = "https://nextcloud.example.com"
username = "ada"
address_book = "Contacts"
# Optional: prefer env var or prompt instead.
# app_password = "..."
```

If no app password is available from flags, environment, or config, interactive mode prompts for it with hidden input. Non-interactive mode fails with setup guidance instead.

Repo-local files named `.nextcloud-address-importer.toml` or `config.toml` are git-ignored so credentials are not committed by accident.

## Address books

List discoverable address books (also a connection/discovery check):

```sh
nextcloud-address-importer address-books \
  --server-url https://nextcloud.example.com \
  --username ada \
  --app-password <app-password>
```

Output is one `display-name<TAB>url` line per address book:

```text
Contacts	https://nextcloud.example.com/remote.php/dav/addressbooks/users/ada/contacts/
```

Address-book selection for `import`: if exactly one address book exists it is used by default; if several exist, pass `--address-book` with a display name or CardDAV URL/path. Interactive mode offers a numbered choice when several exist and none is configured; non-interactive mode fails and asks you to set `--address-book`.

## CSV format

Required header row (order may vary, no aliases):

```csv
first_name,last_name,telephone,group
Ada,Lovelace,+44 20 0000 0000,Friends
Grace,Hopper,+1 555 0100,Work
```

Semicolons work too:

```csv
first_name;last_name;telephone;group
Ada;Lovelace;+44 20 0000 0000;Friends
Grace;Hopper;+1 555 0100;Work
```

Rules:

- Delimiter is auto-detected from the header row: comma or semicolon, not mixed.
- UTF-8 (optional BOM), LF or CRLF line endings, standard quoting.
- Blank lines are ignored; values are trimmed.
- All four fields must be non-empty after trimming.
- Missing or duplicated required headers fail validation; extra columns are ignored with a warning.
- Duplicate rows in the same file (same `first_name`, `last_name`, `telephone`) fail validation before anything is written.
- `telephone` keeps any non-empty text; `group` maps to one contact category.

## Importing

The CSV file path is a required positional argument; connection settings come from flags, environment, or config as above.

Dry run first — validates the CSV, connects to Nextcloud, discovers or selects the address book, checks duplicates, and writes no contacts (a `--json-report` file is still written if requested):

```sh
nextcloud-address-importer import contacts.csv \
  --server-url https://nextcloud.example.com \
  --username ada \
  --app-password <app-password> \
  --address-book Contacts \
  --dry-run
```

Real import — interactive mode asks for confirmation before writing. Pass `--yes` to confirm non-interactively; without it, non-interactive import refuses to write and exits 1:

```sh
nextcloud-address-importer import contacts.csv \
  --server-url https://nextcloud.example.com \
  --username ada \
  --app-password <app-password> \
  --address-book Contacts \
  --yes \
  --json-report ./import-report.json
```

The importer is create-only: rows matching an existing contact (same `first_name`, `last_name`, `telephone`; group ignored) are skipped and reported. Re-running the same CSV is safe — the second run skips everything as duplicates. A failed write is retried once, then reported while the remaining contacts continue.

## Exit codes and reports

| Code | Meaning                                                              |
| ---- | -------------------------------------------------------------------- |
| `0`  | Success, including warnings and skipped duplicates                   |
| `1`  | Validation, config, authentication, or discovery failure before writes |
| `2`  | Partial import — some writes failed after writes were attempted      |

Every run prints a human-readable summary (created / skipped duplicates / warnings / failed writes with row numbers). `--json-report <path>` additionally writes a machine-readable report (`status`, `dryRun`, `created` / `skippedDuplicates` / `warnings` / `failedWrites` with per-row `rowNumber` entries and failure `message`s). It works for both dry-run and real imports.

Reports and logs never include credentials. They use row numbers, field names, and counts rather than contact values.

## Testing

Fast checks (no Docker needed):

```sh
npm run typecheck
npm run lint
npm test
```

`npm test` runs unit tests plus mocked CardDAV protocol tests (authentication failure, discovery failure, address-book ambiguity, create conflict, invalid vCard, network failure).

Slower Dockerized integration tests run the CLI against a real Nextcloud instance (pinned `nextcloud:32-apache` image, SQLite, clean isolated volumes created and destroyed per run, fixed non-secret local-only credentials, synthetic contacts fixture only):

```sh
npm run test:integration:nextcloud
```

This verifies address-book listing, a full happy-path CSV import, and duplicate-rerun behavior. It is structured as an optional slower job for CI later; no hosted CI is set up in version 1.
