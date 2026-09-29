# Nextcloud CardDAV Contact Write Requirements

## Scope

Facts relevant to a local CLI that writes contacts to a user's Nextcloud address book over CardDAV. Sources are Nextcloud documentation, IETF RFCs, and SabreDAV client guidance.

## Endpoint Discovery

- Nextcloud documents the DAV base URL as `https://<server>/remote.php/dav` for calendar/contact sync clients. The iOS guide gives the principal path as `https://example.com/remote.php/dav/principals/users/username/`; the Android guide gives the base URL as `https://sub.example.com/remote.php/dav`. [Nextcloud Android sync docs](https://docs.nextcloud.com/server/latest/user_manual/en/groupware/sync_android.html), [Nextcloud iOS sync docs](https://docs.nextcloud.com/server/latest/user_manual/en/groupware/sync_ios.html)
- Generic CardDAV discovery is: `PROPFIND` the service root with `Depth: 0` for `DAV:current-user-principal`, then `PROPFIND` that principal for `CARDDAV:addressbook-home-set`, then `PROPFIND` the addressbook home with `Depth: 1` to list address books. [SabreDAV CardDAV client guide](https://sabre.io/dav/building-a-carddav-client/), [RFC 6352 section 7.1.1](https://www.rfc-editor.org/rfc/rfc6352.html#section-7.1.1)
- Address book collections report `DAV:collection` and `CARDDAV:addressbook` in `DAV:resourcetype`; clients should ignore non-addressbook children returned while listing. [RFC 6352 section 5.2](https://www.rfc-editor.org/rfc/rfc6352.html#section-5.2), [SabreDAV CardDAV client guide](https://sabre.io/dav/building-a-carddav-client/)
- CardDAV support can also be checked with `OPTIONS`; a CardDAV-capable namespace includes `addressbook` in the `DAV` response header. [RFC 6352 section 6.1](https://www.rfc-editor.org/rfc/rfc6352.html#section-6.1)

## Authentication

- Nextcloud sync docs expect clients to use a dedicated app password rather than the account password. If two-factor authentication is enabled, device-specific passwords are the only way to configure clients and password-based client connections are denied. [Nextcloud Android sync docs](https://docs.nextcloud.com/server/latest/user_manual/en/groupware/sync_android.html), [Nextcloud session management docs](https://docs.nextcloud.com/server/latest/user_manual/en/session_management.html)
- For a CLI, the simplest supported credential shape is HTTP Basic auth using the Nextcloud login name and app password. SabreDAV notes CardDAV servers typically use HTTP Basic or Digest. [SabreDAV CardDAV client guide](https://sabre.io/dav/building-a-carddav-client/)
- Nextcloud's Login Flow v2 can obtain a `loginName` and `appPassword` for clients without storing the user's real password; polling returns `404` until the user grants access and `200` once credentials are ready. [Nextcloud Login Flow docs](https://docs.nextcloud.com/server/latest/developer_manual/client_apis/LoginFlow/index.html)
- The login name returned by Nextcloud's login flow may differ from the internal username used in DAV URLs; docs recommend fetching the actual username from `<server>/ocs/v1.php/cloud/user` when needed. [Nextcloud Login Flow docs](https://docs.nextcloud.com/server/latest/developer_manual/client_apis/LoginFlow/index.html)

## Address Book Selection And Listing

- List address books by `PROPFIND` on the addressbook home with `Depth: 1`, requesting at least `DAV:resourcetype`, `DAV:displayname`, and optionally `CS:getctag`. Select only responses whose `resourcetype` contains the CardDAV `addressbook` element. [SabreDAV CardDAV client guide](https://sabre.io/dav/building-a-carddav-client/), [RFC 6352 section 5.2](https://www.rfc-editor.org/rfc/rfc6352.html#section-5.2)
- `DAV:displayname` is the human-readable address book name. If missing, clients may use the final URI segment, but RFC 6352 warns it can be opaque. [RFC 6352 section 6.3.1](https://www.rfc-editor.org/rfc/rfc6352.html#section-6.3.1)
- `CS:getctag` is a common change token used by clients, but it is not guaranteed; SabreDAV guidance shows it may be returned as `404 Not Found` at the property level inside a `207 Multi-Status`. [SabreDAV CardDAV client guide](https://sabre.io/dav/building-a-carddav-client/)

## Creating Contacts

- Create an address object by `PUT` to a new, unmapped URI under the selected address book. RFC 6352 recommends `If-None-Match: *` so a create operation cannot overwrite an existing resource if the chosen URL collides. [RFC 6352 section 6.3.2](https://www.rfc-editor.org/rfc/rfc6352.html#section-6.3.2)
- `.vcf` file names are common and reasonable, but the URL and the vCard `UID` have no guaranteed relationship. Treat the resource URL and UID as separate identifiers. [RFC 6352 section 6.3.2](https://www.rfc-editor.org/rfc/rfc6352.html#section-6.3.2), [SabreDAV CardDAV client guide](https://sabre.io/dav/building-a-carddav-client/)
- Each address object resource must contain exactly one vCard, and the vCard must have a `UID` unique within the address book collection. [RFC 6352 section 5.1](https://www.rfc-editor.org/rfc/rfc6352.html#section-5.1)
- CardDAV servers must support vCard 3.0 and should support vCard 4.0; clients should inspect `CARDDAV:supported-address-data` for accepted content type/version. If that property is absent, clients can assume only `text/vcard` with vCard `VERSION:3.0` is accepted. [RFC 6352 sections 3 and 6.2.2](https://www.rfc-editor.org/rfc/rfc6352.html#section-6.2.2)
- Use `Content-Type: text/vcard` for vCard PUT requests. Including `charset=utf-8` is common in SabreDAV examples. For vCard 4.0 specifically, RFC 6350 says the charset is UTF-8 and cannot be overridden. [RFC 6352 section 6.3.2](https://www.rfc-editor.org/rfc/rfc6352.html#section-6.3.2), [RFC 6350 section 3.1](https://www.rfc-editor.org/rfc/rfc6350.html#section-3.1), [SabreDAV CardDAV client guide](https://sabre.io/dav/building-a-carddav-client/)
- Minimal vCard 4.0 syntax is `BEGIN:VCARD`, `VERSION:4.0`, at least one content line including required `FN`, and `END:VCARD`; `VERSION` must immediately follow `BEGIN:VCARD`. Lines are CRLF-delimited and long lines should be folded at 75 octets without splitting UTF-8 sequences. [RFC 6350 sections 3.2 and 3.3](https://www.rfc-editor.org/rfc/rfc6350.html#section-3.3)
- A successful create commonly returns `201 Created` and may include an `ETag`. [RFC 6352 section 6.3.2](https://www.rfc-editor.org/rfc/rfc6352.html#section-6.3.2), [SabreDAV CardDAV client guide](https://sabre.io/dav/building-a-carddav-client/)

## Updating Contacts

- Update an existing contact with `PUT` to the existing resource URL, normally sending `If-Match: <etag>` to avoid lost updates. RFC 6352 explicitly distinguishes this from create-time `If-None-Match: *`. [RFC 6352 section 6.3.2](https://www.rfc-editor.org/rfc/rfc6352.html#section-6.3.2)
- CardDAV requires strong ETags on address object resources. `GET` responses must contain an `ETag`; PUT responses should return a strong `ETag` only when the stored bytes are octet-equivalent to the submitted body. If the server rewrites the vCard and omits a usable ETag, the client may need to `GET` the resource again before future edits. [RFC 6352 section 6.3.2.3](https://www.rfc-editor.org/rfc/rfc6352.html#section-6.3.2.3), [SabreDAV CardDAV client guide](https://sabre.io/dav/building-a-carddav-client/)
- Do not change the vCard `UID` or resource URL during update. SabreDAV guidance says changing either confuses clients and servers should reject such changes; RFC 6352's `CARDDAV:no-uid-conflict` precondition covers overwriting an existing resource with a different UID. [SabreDAV CardDAV client guide](https://sabre.io/dav/building-a-carddav-client/), [RFC 6352 section 6.3.2.1](https://www.rfc-editor.org/rfc/rfc6352.html#section-6.3.2.1)
- When modifying existing remote contacts, preserve unknown vCard properties/parameters and other data. SabreDAV warns that lossy read/modify/write destroys user data and recommends retaining the whole vCard or another lossless representation. [SabreDAV CardDAV client guide](https://sabre.io/dav/building-a-carddav-client/)

## Error Handling And Status Codes

- Many CardDAV/WebDAV operations return `207 Multi-Status`; parse per-response and per-property `DAV:status` values rather than treating the top-level status as the outcome for every property. Missing optional properties can appear as property-level `404 Not Found`. [SabreDAV CardDAV client guide](https://sabre.io/dav/building-a-carddav-client/)
- Authentication or permission failures should be expected as normal HTTP/WebDAV errors: `401 Unauthorized` for missing/bad credentials and `403 Forbidden` for denied access. Nextcloud Login Flow v2 also uses `404 Not Found` while polling before the user grants access. [Nextcloud Login Flow docs](https://docs.nextcloud.com/server/latest/developer_manual/client_apis/LoginFlow/index.html), [RFC 4918 status code references via CardDAV dependency](https://www.rfc-editor.org/rfc/rfc4918.html)
- Create conflicts are prevented with `If-None-Match: *`; if the chosen URI already exists, HTTP conditional semantics produce a precondition failure rather than an overwrite. Update conflicts are handled with `If-Match`; stale or missing matching ETags should be treated as a conflict requiring refetch/retry. [RFC 6352 section 6.3.2](https://www.rfc-editor.org/rfc/rfc6352.html#section-6.3.2)
- CardDAV PUT/COPY/MOVE can fail with CardDAV preconditions: unsupported media/version (`CARDDAV:supported-address-data`), invalid vCard (`CARDDAV:valid-address-data`), duplicate or changed UID (`CARDDAV:no-uid-conflict`), invalid addressbook collection location, or resource too large (`CARDDAV:max-resource-size`). [RFC 6352 section 6.3.2.1](https://www.rfc-editor.org/rfc/rfc6352.html#section-6.3.2.1)
- If a client uses WebDAV sync tokens later, servers can forget old tokens; SabreDAV emits `403` for an unrecognized sync token, requiring a full resync. [SabreDAV CardDAV client guide](https://sabre.io/dav/building-a-carddav-client/)

## Practical CLI Baseline

- Ask for server URL, login name, app password, and either an address book name/URL or a default selection strategy.
- Normalize/discover from `https://<server>/remote.php/dav`, then resolve principal and addressbook home rather than hard-coding `/addressbooks/users/...`.
- List address books via `PROPFIND Depth: 1`; display `DAV:displayname` and keep the collection `href`.
- Create contacts with `PUT <addressbook>/<random-or-uid>.vcf`, `If-None-Match: *`, `Content-Type: text/vcard; charset=utf-8`, a single valid vCard, and a generated globally unique `UID`.
- Prefer vCard 3.0 unless `supported-address-data` confirms vCard 4.0 support, or make the vCard version configurable.
- Store returned resource URL and ETag if future updates are planned; update with `If-Match` and refetch after conflict or server-side rewrite.
