/**
 * Dockerized Nextcloud integration tests (issues 06 + 10).
 *
 * Runs against a real Nextcloud instance started by run.sh
 * (`npm run test:integration:nextcloud`). Uses only the synthetic
 * contacts fixture committed next to this test and the fixed
 * non-secret local test credentials from docker-compose.yml.
 *
 * Excluded from the default `npm test` run (see vitest.config.ts);
 * this file runs via vitest.integration.config.ts with long timeouts.
 */
import { describe, expect, it } from "vitest";

import { runCli } from "../../../src/cli.js";

// Fixed non-secret local test credentials, committed with the Docker setup.
// Overridable via env for CI flexibility, defaults match docker-compose.yml.
const SERVER_URL = process.env.NEXTCLOUD_TEST_SERVER_URL ?? "http://127.0.0.1:8087";
const USERNAME = process.env.NEXTCLOUD_TEST_USERNAME ?? "nc-test-admin";
const APP_PASSWORD = process.env.NEXTCLOUD_TEST_APP_PASSWORD ?? "nc-test-local-password";
const ADDRESS_BOOK = "Contacts";
const CSV_FIXTURE = new URL("./fixtures/synthetic-contacts.csv", import.meta.url).pathname;

const EXPECTED_CONTACTS = [
  { firstName: "Ava", lastName: "Synthetic", telephone: "+10000000001" },
  { firstName: "Liam", lastName: "Synthetic", telephone: "+10000000002" },
];

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${USERNAME}:${APP_PASSWORD}`, "utf8").toString("base64")}`;
}

function contactsBookUrl(listingStdout: string[]): string {
  const line = listingStdout.find((entry) => entry.startsWith(`${ADDRESS_BOOK}\t`));

  if (line === undefined) {
    throw new Error(`Address book "${ADDRESS_BOOK}" was not listed. Got:\n${listingStdout.join("\n")}`);
  }

  return line.slice(ADDRESS_BOOK.length + 1).trim();
}

function responseHrefs(xml: string): string[] {
  return Array.from(xml.matchAll(/<[^>]*:?response\b[\s\S]*?<\/[^>]*:?response>/giu), (match) => match[0])
    .map((block) => /<[^>]*:?href\b[^>]*>([\s\S]*?)<\/[^>]*:?href>/iu.exec(block)?.[1]?.trim())
    .filter((href): href is string => href !== undefined && href !== "");
}

/** Independently verify contacts exist via raw CardDAV reads (not the CLI). */
async function readAddressBookVcards(addressBookUrl: string): Promise<string[]> {
  const listingResponse = await fetch(addressBookUrl, {
    method: "PROPFIND",
    headers: {
      Authorization: basicAuthHeader(),
      Depth: "1",
      "Content-Type": "application/xml; charset=utf-8",
    },
    body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:resourcetype /><d:getetag /></d:prop>
</d:propfind>`,
  });
  expect(listingResponse.status).toBe(207);

  const origin = new URL(addressBookUrl).origin;
  const vcardHrefs = responseHrefs(await listingResponse.text()).filter((href) =>
    href.toLowerCase().endsWith(".vcf"),
  );
  expect(vcardHrefs.length).toBeGreaterThan(0);

  const vcards: string[] = [];
  for (const href of vcardHrefs) {
    const contactResponse = await fetch(new URL(href, origin), {
      headers: { Authorization: basicAuthHeader() },
    });
    expect(contactResponse.status).toBe(200);
    vcards.push(await contactResponse.text());
  }

  return vcards;
}

describe("Dockerized Nextcloud fixture", () => {
  it(
    "lists address books on a real Nextcloud instance (06)",
    async () => {
      const result = await runCli(
        ["address-books", "--server-url", SERVER_URL, "--username", USERNAME, "--app-password", APP_PASSWORD],
        { isInteractive: false },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toEqual([]);
      expect(result.stdout.length).toBeGreaterThan(0);

      const contactsLine = result.stdout.find((line) => line.startsWith(`${ADDRESS_BOOK}\t`));
      expect(contactsLine).toBeDefined();
      expect(contactsLine).toContain("/remote.php/dav/addressbooks/");
    },
    120_000,
  );

  it(
    "imports synthetic contacts, then skips them cleanly on duplicate rerun (10)",
    async () => {
      const baseArgs = [
        "import",
        CSV_FIXTURE,
        "--server-url",
        SERVER_URL,
        "--username",
        USERNAME,
        "--app-password",
        APP_PASSWORD,
        "--address-book",
        ADDRESS_BOOK,
        "--yes",
      ];

      const firstRun = await runCli(baseArgs, { isInteractive: false });
      expect(firstRun.exitCode).toBe(0);
      const firstSummary = firstRun.stdout.join("\n");
      expect(firstSummary).toContain("Created contacts: 2");
      expect(firstSummary).toContain("Skipped existing duplicates: 0");
      expect(firstSummary).toContain("Failed writes: 0");

      const listing = await runCli(
        ["address-books", "--server-url", SERVER_URL, "--username", USERNAME, "--app-password", APP_PASSWORD],
        { isInteractive: false },
      );
      expect(listing.exitCode).toBe(0);

      const vcards = await readAddressBookVcards(contactsBookUrl(listing.stdout));
      for (const contact of EXPECTED_CONTACTS) {
        const match = vcards.find(
          (vcard) => vcard.includes(`${contact.lastName};${contact.firstName}`) && vcard.includes(contact.telephone),
        );
        expect(match, `expected ${contact.firstName} ${contact.lastName} in address book`).toBeDefined();
      }

      const rerun = await runCli(baseArgs, { isInteractive: false });
      expect(rerun.exitCode).toBe(0);
      const rerunSummary = rerun.stdout.join("\n");
      expect(rerunSummary).toContain("Created contacts: 0");
      expect(rerunSummary).toContain("Skipped existing duplicates: 2");
      expect(rerunSummary).toContain("Failed writes: 0");
    },
    180_000,
  );
});
