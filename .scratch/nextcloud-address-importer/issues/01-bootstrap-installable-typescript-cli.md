# 01: Bootstrap installable TypeScript CLI

**What to build:** A runnable Node.js/TypeScript CLI named `nextcloud-address-importer` with `import` and `address-books` command shells, npm-installable executable wiring, repo-local run support, lint/typecheck/test scripts, and config files ignored.

**Blocked by:** None (can start immediately).

**Status:** completed

- [x] The CLI can be run from the repository during development and exposes `import` and `address-books` commands.
- [x] The package is wired so an npm-compatible install exposes the `nextcloud-address-importer` executable.
- [x] Fast project scripts exist for linting, typechecking, and running tests.
- [x] Repo-local config files `.nextcloud-address-importer.toml` and `config.toml` remain ignored.
