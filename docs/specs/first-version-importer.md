# First-Version Nextcloud Address Importer Specification

## Purpose

Build a local CLI tool that imports contacts from a comma-separated or semicolon-separated CSV file directly into Nextcloud Contacts via CardDAV.

The first version is intentionally narrow: fixed CSV columns, create-only import, no destructive operations, and no configurable column mapping.

## Runtime And Packaging

- Implementation target: Node.js/TypeScript.
- Runtime support: Node.js current LTS or newer.
- Supported operating systems: Linux and macOS.
- Installed executable name: `nextcloud-address-importer`.
- The CLI must be runnable directly from the repository during development.
- The CLI must be npm-installable; public npm publication is optional for the first version.

## Commands

### Import

Primary command:

```sh
nextcloud-address-importer import contacts.csv
```

Supported flags:

- `--config <path>`
- `--server-url <url>`
- `--username <name>`
- `--app-password <password>`
- `--address-book <name-or-url>`
- `--dry-run`
- `--yes`
- `--json-report <path>`

`--dry-run` validates the CSV, connects to Nextcloud, discovers or selects the address book, checks for existing duplicates, and writes nothing.

Interactive import asks for confirmation before creating contacts. `--yes` skips confirmation. Non-interactive mode fails if confirmation, app-password prompt, or address-book selection would be required.

### Address Books

Discovery command:

```sh
nextcloud-address-importer address-books
```

This command tests connection/discovery and lists available address books.

## Configuration And Authentication

The importer requires:

- `server_url`
- `username`
- CSV file path
- Nextcloud app password

Connection configuration uses TOML. The default config path is:

```text
~/.config/nextcloud-address-importer/config.toml
```

`--config` may override the config path.

Config may contain:

```toml
server_url = "https://nextcloud.example.com"
username = "user"
address_book = "Contacts"
app_password = "app-password"
```

Storing `app_password` in config is permitted for convenience, but documentation should recommend environment variables or hidden interactive prompt instead.

Value precedence is:

1. CLI flags
2. Environment variables
3. Config file

Environment variables:

- `NEXTCLOUD_ADDRESS_IMPORTER_SERVER_URL`
- `NEXTCLOUD_ADDRESS_IMPORTER_USERNAME`
- `NEXTCLOUD_ADDRESS_IMPORTER_APP_PASSWORD`
- `NEXTCLOUD_ADDRESS_IMPORTER_ADDRESS_BOOK`

If no app password is available from flags, environment, or config, interactive mode prompts with hidden input. Non-interactive mode fails with setup guidance.

Documentation must explain that a Nextcloud app password is a separate Nextcloud-generated client password, not the user's normal web account password.

## Address Book Selection

The importer discovers address books through CardDAV.

- If exactly one address book exists, the importer may use it by default.
- If multiple address books exist and `address_book` is configured, the importer resolves it after discovery.
- `address_book` may identify either a display name or a CardDAV URL/path.
- If multiple address books exist and no address book is configured in interactive mode, the CLI shows a numbered list with display names and URLs and lets the user choose.
- Non-interactive mode fails if address-book selection would require prompting.

## CSV Contract

The first version accepts CSV files with a required header row.

Delimiter handling:

- Auto-detect either comma or semicolon from the header row.
- If delimiter usage in the header is mixed or ambiguous, fail and ask the user to use one delimiter type.
- Standard CSV quoting is supported.

File handling:

- Encoding: UTF-8, optional BOM allowed.
- Line endings: LF and CRLF accepted.
- Completely blank lines are ignored.
- Values are trimmed before validation and import.

Required canonical headers:

- `first_name`
- `last_name`
- `telephone`
- `group`

Header rules:

- Header order may vary.
- No aliases are accepted in the first version.
- Missing or duplicated required headers fail validation.
- Extra columns are ignored with a warning.

Row rules:

- All four required fields must be non-empty after trimming.
- Duplicate rows inside the same CSV, using the same `first_name`, `last_name`, and `telephone`, fail validation before any contacts are written.

Example comma-separated CSV:

```csv
first_name,last_name,telephone,group
Ada,Lovelace,+44 20 0000 0000,Friends
Grace,Hopper,+1 555 0100,Work
```

Example semicolon-separated CSV:

```csv
first_name;last_name;telephone;group
Ada;Lovelace;+44 20 0000 0000;Friends
Grace;Hopper;+1 555 0100;Work
```

## Contact Mapping

- `first_name` and `last_name` map to structured vCard name fields.
- Display name is `first_name last_name`.
- `telephone` maps to a generic phone number and preserves any non-empty text value.
- `group` maps to one Nextcloud contact group/category via vCard `CATEGORIES`.
- The first version supports exactly one group per row.

## CardDAV Behavior

The importer must use CardDAV discovery rather than hard-coded address book paths.

Discovery baseline:

- Start from the server DAV base at `/remote.php/dav`.
- Discover the current user principal.
- Discover the addressbook home set.
- List address book collections with `PROPFIND Depth: 1`.

Authentication baseline:

- Use HTTP Basic auth with the Nextcloud login name and app password.

Creation baseline:

- Create contacts with `PUT` to a new `.vcf` resource under the selected address book.
- Use `If-None-Match: *` for creates.
- Use `Content-Type: text/vcard; charset=utf-8`.
- Store exactly one vCard per address object resource.
- Generate a globally unique vCard `UID` per created contact.
- Prefer vCard 3.0 unless supported address data confirms vCard 4.0 support.

Response handling:

- Parse `207 Multi-Status` per response/property.
- Handle authentication failures, permission failures, conditional create conflicts, invalid vCard data, unsupported vCard versions, UID conflicts, invalid address book locations, and resource-size preconditions.

## Import Identity And Duplicates

The first version is create-only.

- It never updates, deletes, overwrites, or duplicate-overwrites contacts.
- It does not maintain a persistent import database.
- It does not use generated UIDs to recognize previous imports.

Before creating contacts, the importer checks the selected Nextcloud address book for likely duplicates.

A likely duplicate has the same:

- `first_name`
- `last_name`
- `telephone`

`group` is not part of the identity match because group membership can change without making the row a different person.

If a matching contact already exists in Nextcloud, the CSV row is skipped and reported clearly. Skipped existing duplicates are successful idempotent behavior.

## Validation, Errors, And Reporting

The importer validates the whole CSV before writing anything to Nextcloud. If validation fails, no contacts are written.

Row-level validation errors include:

- row number
- field name
- message

Existing Nextcloud duplicates, ignored extra columns, and other warnings do not make the run fail.

If a CardDAV write fails after validation:

- retry once
- if retry fails, continue with remaining contacts
- report the failed row

Because CardDAV writes are not transactional across contacts, the run report must clearly distinguish:

- created contacts
- skipped duplicates
- warnings
- failed writes

End-of-run reporting includes a human-readable terminal summary. The CLI may also write an optional JSON report file for automation.

Exit codes:

- `0`: success, including warnings and skipped duplicates
- `1`: validation, config, authentication, or discovery failure before writes
- `2`: partial import/write failures after some writes were attempted

Reports and logs must never include credentials. By default, reports and logs should avoid contact values and use row numbers, field names, and counts instead.

## Testing Requirements

The first version requires unit tests, mocked CardDAV tests, and Dockerized Nextcloud integration tests.

Unit tests cover:

- CSV parsing
- validation
- contact mapping
- config precedence
- report generation
- vCard generation

Mocked CardDAV tests cover deterministic protocol and error paths:

- authentication failure
- discovery failure
- address-book ambiguity
- create conflict
- invalid vCard
- network failure

Dockerized Nextcloud integration tests cover:

- address-book listing
- full happy path of creating contacts from CSV
- duplicate rerun behavior

Integration tests use synthetic contacts only, committed as fixtures.

Real Nextcloud tests should start from a clean isolated Docker state by creating and destroying volumes per run. Docker fixture credentials are fixed non-secret local test credentials committed with the Docker test setup.

There should be one obvious local command, such as:

```sh
npm run test:integration:nextcloud
```

Fast checks should include typecheck, lint, unit tests, and mocked CardDAV tests. Dockerized Nextcloud tests should be structured so they can run in CI later as an optional/slower job, but the first version does not require setting up hosted CI.

## Repository Safety

The repository ignores accidental repo-local config files:

- `.nextcloud-address-importer.toml`
- `config.toml`

## Out Of Scope For Version 1

- Hosted web UI.
- Nextcloud app/plugin UI.
- Developer-only library as the primary surface.
- Manual `.vcf` export/import target.
- Configurable column mapping.
- Header aliases.
- Multiple groups per row.
- Updates to existing contacts.
- Deletes.
- Overwrites.
- Persistent import database.
- Hosted CI setup for Dockerized Nextcloud tests.
