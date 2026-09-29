---
id: 0010
title: Decide testing strategy and Nextcloud Docker fixture
status: closed
labels:
  - wayfinder:grilling
assignee: openai/gpt-5.5
parent: 0001
blocked_by:
  - 0009
---

# Decide testing strategy and Nextcloud Docker fixture

## Question

What testing strategy should the specification require for the first version, including unit tests, integration tests, whether to run against a real Nextcloud instance in Docker, required fixture data, CI expectations, and how tests avoid leaking credentials or persistent personal data?

## Resolution

The first version requires unit tests, mocked CardDAV tests, and Dockerized Nextcloud integration tests.

Unit tests cover CSV parsing, validation, contact mapping, config precedence, report generation, and vCard generation.

Mocked CardDAV tests cover deterministic protocol and error paths: authentication failure, discovery failure, address-book ambiguity, create conflict, invalid vCard, and network failure.

Dockerized Nextcloud integration tests cover address-book listing, the full happy path of creating contacts from CSV, and duplicate rerun behavior. They use synthetic contacts only, committed as fixtures.

Real Nextcloud tests should start from a clean isolated Docker state by creating and destroying volumes per run. Docker fixture credentials are fixed non-secret local test credentials committed with the Docker test setup.

There should be one obvious local command, such as `npm run test:integration:nextcloud`, to run the real Nextcloud integration tests.

Fast checks should include typecheck, lint, unit tests, and mocked CardDAV tests. Dockerized Nextcloud tests should be structured so they can run in CI later as an optional/slower job, but the first spec does not require setting up hosted CI.
