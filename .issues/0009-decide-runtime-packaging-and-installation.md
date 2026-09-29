---
id: 0009
title: Decide runtime packaging and installation
status: closed
labels:
  - wayfinder:grilling
assignee: openai/gpt-5.5
parent: 0001
blocked_by:
  - 0007
---

# Decide runtime packaging and installation

## Question

What runtime, packaging, and installation expectations should the specification set for the first version of the local CLI, including implementation language/runtime assumptions, executable name, installation method, and supported operating systems?

## Resolution

The first implementation target is Node.js/TypeScript. CardDAV uses HTTP/WebDAV/XML and does not require a special native Nextcloud SDK; TypeScript has strong ecosystem support for CLI handling, HTTP, XML, CSV, TOML, prompts, vCard generation, and npm packaging.

Runtime support is Node.js current LTS or newer. Supported operating systems for the first version are Linux and macOS.

The CLI must be runnable directly from the repository during development, but the exact repo-local development command is left to implementation. The CLI must also be npm-installable, exposing the installed executable name `nextcloud-address-importer`. Public npm publication is optional for the first version.
