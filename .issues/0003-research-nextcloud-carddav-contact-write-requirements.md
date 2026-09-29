---
id: 0003
title: Research Nextcloud CardDAV contact write requirements
status: closed
labels:
  - wayfinder:research
assignee: openai/gpt-5.5
parent: 0001
blocked_by: []
---

# Research Nextcloud CardDAV contact write requirements

## Question

What CardDAV and vCard requirements must the CLI satisfy to create or update contacts in Nextcloud Contacts, including endpoint discovery, address book selection, authentication expectations, vCard version/content requirements, UID/ETag behavior, and relevant error responses?

## Research pointer

See [Nextcloud CardDAV contact write requirements](../research/nextcloud-carddav-contact-write-requirements.md).

## Resolution

Nextcloud CardDAV contact writes should be specified around standard CardDAV discovery and WebDAV operations rather than hard-coded user address book paths. The CLI should start from the server's DAV base at `/remote.php/dav`, discover the current user principal, discover the addressbook home set, and list address book collections with `PROPFIND Depth: 1`.

The first-version authentication baseline should assume HTTP Basic auth with a Nextcloud login name and app password. Nextcloud Login Flow v2 is available for richer client authorization, but the research supports app-password credentials as the simpler first-version route.

Contact creation should use `PUT` to a new `.vcf` resource under the selected address book, with `If-None-Match: *`, `Content-Type: text/vcard; charset=utf-8`, exactly one vCard per address object, and a generated unique vCard `UID`. Prefer vCard 3.0 unless supported address data confirms vCard 4.0 support.

Updates, if included in the first-version behavior, should use the existing resource URL and `If-Match` with a known ETag, preserve unknown vCard data, and never change an existing contact's UID. WebDAV/CardDAV responses must be handled per response/property for `207 Multi-Status`, and the spec should call out auth failures, conditional conflicts, invalid vCard data, unsupported vCard versions, UID conflicts, and address-book size/location preconditions.
