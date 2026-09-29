---
id: 0004
title: Decide Nextcloud connection and authentication inputs
status: closed
labels:
  - wayfinder:grilling
assignee: openai/gpt-5.5
parent: 0001
blocked_by:
  - 0003
---

# Decide Nextcloud connection and authentication inputs

## Question

What connection and authentication inputs should the CLI require or support for the first version: server URL, username, app password/password, address book selection, credential prompting, environment variables, config files, and secret-handling expectations?

## Resolution

The first-version CLI requires a Nextcloud `server_url`, `username`, CSV file path, and app password. The app password is mandatory authentication material; documentation must explain that it is a separate Nextcloud-generated client password rather than the user's normal web account password.

Connection configuration uses a TOML config file. The default config path is `~/.config/nextcloud-address-importer/config.toml`, and `--config` may override that path. The config file may contain `server_url`, `username`, optional `address_book`, and may contain `app_password`. Storing the app password in config is permitted for user convenience, but should not be the recommended secret-handling path.

Values can come from config, environment variables, or CLI flags. Precedence is CLI flags, then environment variables, then config file. The environment variable names are `NEXTCLOUD_ADDRESS_IMPORTER_SERVER_URL`, `NEXTCLOUD_ADDRESS_IMPORTER_USERNAME`, `NEXTCLOUD_ADDRESS_IMPORTER_APP_PASSWORD`, and `NEXTCLOUD_ADDRESS_IMPORTER_ADDRESS_BOOK`.

If no app password is available from flags, environment, or config, the CLI prompts interactively with hidden input. In non-interactive mode, missing app password is a failure with setup guidance.

Address books are discovered through CardDAV. If exactly one address book exists, the CLI may use it by default. If multiple address books exist, the user must select one. `address_book` may identify either a display name or a CardDAV URL/path, resolved after discovery.

The repository should ignore accidental repo-local config files named `.nextcloud-address-importer.toml` and `config.toml`.
