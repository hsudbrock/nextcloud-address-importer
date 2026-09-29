# 02: Resolve connection configuration safely

**What to build:** Commands resolve TOML config, environment variables, and CLI flags with the required precedence; missing app password prompts interactively or fails in non-interactive mode; secrets are never printed.

**Blocked by:** 01: Bootstrap installable TypeScript CLI.

**Status:** ready-for-agent

- [ ] Connection configuration is resolved from config file, environment variables, and CLI flags with CLI flags taking precedence over environment variables, which take precedence over config.
- [ ] The default config path and `--config` override are supported.
- [ ] Missing app password prompts with hidden input in interactive mode and fails with setup guidance in non-interactive mode.
- [ ] Logs, errors, and reports do not print app passwords or other credentials.
