# Glossary

## Contact Import Specification

A written description of the first version of the local CLI importer. It resolves product and API decisions so a later implementation session can build without inventing behavior.

## Local CLI Importer

A command-line tool run on the user's machine that reads a CSV file and writes contacts directly to a Nextcloud address book.

## Fixed CSV Contract

The first-version CSV format accepted by the importer: delimiter rules, headers, required fields, optional fields, and contact-field mapping.

## Contact Group

A label on a contact used by Nextcloud Contacts to group contacts. In this project, the CSV `group` field represents one contact group for the imported contact.

## Direct CardDAV Import

Writing contacts into Nextcloud Contacts through CardDAV rather than generating a file for manual import.

## Address Book

A Nextcloud Contacts collection that contains contact resources. The importer writes contacts into one selected address book.

## App Password

A Nextcloud-generated password for client access. In this project, app-password authentication is the baseline way for the local CLI importer to authenticate without using the user's main account password.

## CardDAV Discovery

The process of locating the user's principal, address book home, and available address books from a Nextcloud server's DAV endpoint instead of assuming fixed address book URLs.

## Connection Configuration

The user-provided settings that let the local CLI importer reach Nextcloud and choose a target address book, including server URL, username, address book, and authentication secret.

## Create-Only Import

An import mode that creates new contacts but never updates existing contacts.

## Import Identity

The set of contact fields used to decide whether a CSV row represents the same contact as another row or an existing Nextcloud contact. In the first version, import identity is `first_name`, `last_name`, and `telephone`.

## Likely Duplicate

A CSV row or existing Nextcloud contact that has the same import identity as another row being imported.

## Preflight Validation

Validation performed across the whole CSV before any contacts are written to Nextcloud.

## Partial Import

A run where validation passed and some CardDAV writes were attempted, but one or more contact writes failed after retry.

## Run Report

The end-of-run summary that tells the user how many contacts were created, skipped, warned, or failed without exposing credentials or contact values by default.

## Dry Run

An import execution mode that validates input, connects to Nextcloud, resolves the target address book, and checks duplicates without creating contacts.

## Non-Interactive Mode

A CLI execution context where the importer cannot prompt the user. In this mode, missing secrets, required confirmations, and unresolved address-book selection fail instead of prompting.

## Runtime Target

The language and runtime environment expected for the first implementation. In this project, the runtime target is Node.js/TypeScript on Node.js current LTS or newer.

## npm-Installable CLI

A command-line tool packaged so it can be installed through npm-compatible workflows and expose a named executable.

## Mocked CardDAV Test

A test that simulates CardDAV server responses without running Nextcloud, used for deterministic protocol and error-path coverage.

## Dockerized Nextcloud Integration Test

A test that runs against a real Nextcloud instance in Docker to verify CardDAV discovery, address-book listing, contact creation, and duplicate rerun behavior.

## Synthetic Contact Fixture

Committed test contact data invented for testing and not derived from a real person's private contact data.
