#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { parse as parseToml } from "smol-toml";

export type CliResult = {
  exitCode: number;
  stdout: string[];
  stderr: string[];
  connection?: ConnectionConfig;
};

export type ConnectionConfig = {
  serverUrl: string;
  username: string;
  appPassword: string;
  addressBook?: string;
};

export type ContactPlan = {
  operation: "create";
  uid: string;
  name: {
    givenName: string;
    familyName: string;
  };
  displayName: string;
  telephone: string;
  categories: [string];
  vcard: string;
};

export type CliRuntime = {
  env?: Record<string, string | undefined>;
  readFile?: (path: string) => Promise<string | Buffer>;
  fetch?: typeof fetch;
  homeDir?: string;
  isInteractive?: boolean;
  promptHidden?: (prompt: string) => Promise<string>;
};

export type AddressBook = {
  displayName: string;
  url: string;
};

type ConfigFileValues = {
  server_url?: string;
  username?: string;
  app_password?: string;
  address_book?: string;
};

type CliConnectionOptions = {
  config?: string;
  serverUrl?: string;
  username?: string;
  appPassword?: string;
  addressBook?: string;
};

type ParsedArgs = {
  positionals: string[];
  options: CliConnectionOptions;
  error?: string;
};

type CsvValidationResult = {
  rowCount: number;
  warnings: string[];
  contactPlans: ContactPlan[];
};

type CsvRecord = {
  fields: string[];
  lineNumber: number;
};

type CsvRowValues = Record<(typeof requiredCsvHeaders)[number], string>;

const defaultConfigRelativePath = ".config/nextcloud-address-importer/config.toml";
const requiredCsvHeaders = ["first_name", "last_name", "telephone", "group"] as const;

const usage = `nextcloud-address-importer

Usage:
  nextcloud-address-importer import <contacts.csv> [options]
  nextcloud-address-importer address-books [options]

Commands:
  import         Import contacts from a fixed-contract CSV file.
  address-books  List discoverable Nextcloud address books.

Options:
  --help, -h     Show this help message.
  --version, -v  Show the CLI version.
`;

export async function runCli(argv: string[], runtime: CliRuntime = {}): Promise<CliResult> {
  const [command, ...args] = argv;

  if (command === undefined || command === "--help" || command === "-h") {
    return ok(usage.trimEnd());
  }

  if (command === "--version" || command === "-v") {
    return ok("nextcloud-address-importer 0.1.0");
  }

  if (command === "import") {
    return runImportShell(args, runtime);
  }

  if (command === "address-books") {
    return runAddressBooksShell(args, runtime);
  }

  return fail(`Unknown command: ${command}\n\n${usage.trimEnd()}`);
}

async function runImportShell(args: string[], runtime: CliRuntime): Promise<CliResult> {
  if (args.includes("--help") || args.includes("-h")) {
    return ok(`Usage: nextcloud-address-importer import <contacts.csv> [options]

Options:
  --config <path>
  --server-url <url>
  --username <name>
  --app-password <password>
  --address-book <name-or-url>
  --dry-run
  --yes
  --json-report <path>
`);
  }

  const parsedArgs = parseArgs(args);

  if (parsedArgs.error !== undefined) {
    return fail(parsedArgs.error);
  }

  const [csvPath] = parsedArgs.positionals;

  if (csvPath === undefined) {
    return fail("Missing CSV file path. Usage: nextcloud-address-importer import <contacts.csv>");
  }

  const connectionResult = await resolveConnectionConfig(parsedArgs.options, runtime);

  if (connectionResult.exitCode !== 0) {
    return connectionResult;
  }

  const csvValidationResult = await validateCsvFile(csvPath, runtime);

  if (typeof csvValidationResult === "string") {
    return fail(csvValidationResult);
  }

  const rowLabel = csvValidationResult.rowCount === 1 ? "contact row" : "contact rows";

  return {
    exitCode: 0,
    stdout: [
      `CSV validation passed: ${csvValidationResult.rowCount} ${rowLabel} ready from ${csvPath}`,
      ...csvValidationResult.warnings,
    ],
    stderr: [],
    connection: connectionResult.connection,
  };
}

async function validateCsvFile(path: string, runtime: CliRuntime): Promise<CsvValidationResult | string> {
  const readFile = runtime.readFile ?? ((filePath: string) => fs.readFile(filePath));
  let contents: string | Buffer;

  try {
    contents = await readFile(path);
  } catch {
    return `Could not read CSV file: ${path}`;
  }

  if (Buffer.isBuffer(contents)) {
    try {
      return validateCsv(new TextDecoder("utf-8", { fatal: true }).decode(contents));
    } catch {
      return "CSV file is not valid UTF-8.";
    }
  }

  return validateCsv(contents);
}

function validateCsv(contents: string): CsvValidationResult | string {
  const withoutBom = contents.startsWith("\uFEFF") ? contents.slice(1) : contents;
  const blankLineCount = countBlankLines(withoutBom);
  const headerLine = firstNonBlankLine(withoutBom);

  if (headerLine === "") {
    return "CSV file is empty or only contains blank lines.";
  }

  const delimiter = detectDelimiter(headerLine);

  if (!isCsvDelimiter(delimiter)) {
    return delimiter;
  }

  const parsedRecords = parseCsvRecords(withoutBom, delimiter);
  const [parsedHeaderRecord, ...parsedRows] = parsedRecords;

  if (parsedHeaderRecord === undefined) {
    return "CSV file is empty or only contains blank lines.";
  }

  const headerErrors = validateHeaders(parsedHeaderRecord.fields);

  if (headerErrors.length > 0) {
    return headerErrors.join("\n");
  }

  const warnings = warningsForExtraHeaders(parsedHeaderRecord.fields);

  if (blankLineCount > 0) {
    const lineLabel = blankLineCount === 1 ? "blank line" : "blank lines";
    warnings.push(`Warning: ignored ${blankLineCount} ${lineLabel}`);
  }

  const headerIndexes = requiredHeaderIndexes(parsedHeaderRecord.fields);
  const seenIdentities = new Map<string, number>();
  const validRows: CsvRowValues[] = [];

  for (const row of parsedRows) {
    const valuesByHeader = valuesForRequiredHeaders(row.fields, headerIndexes);
    const emptyHeaders = requiredCsvHeaders.filter((header) => valuesByHeader[header] === "");

    if (emptyHeaders.length > 0) {
      return `CSV row ${row.lineNumber} has empty required values: ${emptyHeaders.join(", ")}`;
    }

    const identity = [valuesByHeader.first_name, valuesByHeader.last_name, valuesByHeader.telephone].join("\u0000");
    const firstSeenLine = seenIdentities.get(identity);

    if (firstSeenLine !== undefined) {
      return `Duplicate CSV import identity on rows ${firstSeenLine} and ${row.lineNumber}`;
    }

    seenIdentities.set(identity, row.lineNumber);
    validRows.push(valuesByHeader);

    if (row.fields.length > parsedHeaderRecord.fields.length) {
      warnings.push(`Warning: ignored ${row.fields.length - parsedHeaderRecord.fields.length} extra value(s) on CSV row ${row.lineNumber}`);
    }
  }

  return { rowCount: parsedRows.length, warnings, contactPlans: mapCsvRowsToContactPlans(validRows) };
}

export function mapCsvRowsToContactPlans(
  rows: CsvRowValues[],
  generateUid: () => string = randomUUID,
): ContactPlan[] {
  const generatedUids = new Set<string>();

  return rows.map((row) => {
    const uid = generateUid();

    if (generatedUids.has(uid)) {
      throw new Error(`Generated duplicate vCard UID: ${uid}`);
    }

    generatedUids.add(uid);

    const displayName = `${row.first_name} ${row.last_name}`;

    return {
      operation: "create",
      uid,
      name: {
        givenName: row.first_name,
        familyName: row.last_name,
      },
      displayName,
      telephone: row.telephone,
      categories: [row.group],
      vcard: renderContactVcard({
        uid,
        givenName: row.first_name,
        familyName: row.last_name,
        displayName,
        telephone: row.telephone,
        category: row.group,
      }),
    };
  });
}

function renderContactVcard(contact: {
  uid: string;
  givenName: string;
  familyName: string;
  displayName: string;
  telephone: string;
  category: string;
}): string {
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `UID:${escapeVcardText(contact.uid)}`,
    `N:${escapeVcardText(contact.familyName)};${escapeVcardText(contact.givenName)};;;`,
    `FN:${escapeVcardText(contact.displayName)}`,
    `TEL:${escapeVcardPhoneNumber(contact.telephone)}`,
    `CATEGORIES:${escapeVcardText(contact.category)}`,
    "END:VCARD",
    "",
  ].join("\r\n");
}

function escapeVcardPhoneNumber(value: string): string {
  return value.replaceAll("\r\n", "\\n").replaceAll("\r", "\\n").replaceAll("\n", "\\n");
}

function escapeVcardText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

function parseCsvRecords(contents: string, delimiter?: "," | ";"): CsvRecord[] {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let lineNumber = 1;
  let recordStartLine = 1;

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index];
    const nextCharacter = contents[index + 1];

    if (inQuotes && (character === "\n" || character === "\r")) {
      field += character === "\r" && nextCharacter === "\n" ? "\n" : character;

      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      lineNumber += 1;
      continue;
    }

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && delimiter !== undefined && character === delimiter) {
      fields.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (character === "\n" || character === "\r")) {
      fields.push(field);
      pushCsvRecord(records, fields, recordStartLine);
      fields = [];
      field = "";

      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      lineNumber += 1;
      recordStartLine = lineNumber;
      continue;
    }

    field += character;
  }

  fields.push(field);
  pushCsvRecord(records, fields, recordStartLine);

  return records;
}

function pushCsvRecord(records: CsvRecord[], fields: string[], lineNumber: number): void {
  if (fields.every((value) => value.trim() === "")) {
    return;
  }

  records.push({ fields: fields.map((value) => value.trim()), lineNumber });
}

function countBlankLines(contents: string): number {
  let count = 0;
  let line = "";
  let inQuotes = false;

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index];
    const nextCharacter = contents[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      line += character;
      continue;
    }

    if (!inQuotes && (character === "\n" || character === "\r")) {
      if (line.trim() === "") {
        count += 1;
      }
      line = "";

      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      continue;
    }

    line += character;
  }

  return line === "" ? count : count + (line.trim() === "" ? 1 : 0);
}

function firstNonBlankLine(contents: string): string {
  return contents.split(/\r\n|\n|\r/u).find((line) => line.trim() !== "") ?? "";
}

function detectDelimiter(headerLine: string): "," | ";" | string {
  const commaCount = countUnquotedCharacter(headerLine, ",");
  const semicolonCount = countUnquotedCharacter(headerLine, ";");

  if (commaCount > 0 && semicolonCount > 0) {
    return "CSV header mixes comma and semicolon delimiters. Use one delimiter type.";
  }

  if (commaCount > 0) {
    return ",";
  }

  if (semicolonCount > 0) {
    return ";";
  }

  return "CSV delimiter could not be detected from the header row. Use comma or semicolon delimiters.";
}

function isCsvDelimiter(value: string): value is "," | ";" {
  return value === "," || value === ";";
}

function countUnquotedCharacter(value: string, target: string): number {
  let count = 0;
  let inQuotes = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const nextCharacter = value[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && character === target) {
      count += 1;
    }
  }

  return count;
}

function validateHeaders(headers: string[]): string[] {
  const errors: string[] = [];
  const missingHeaders = requiredCsvHeaders.filter((header) => !headers.includes(header));
  const duplicatedHeaders = requiredCsvHeaders.filter((header) => headers.filter((candidate) => candidate === header).length > 1);

  if (missingHeaders.length > 0) {
    errors.push(`Missing required CSV headers: ${missingHeaders.join(", ")}`);
  }

  if (duplicatedHeaders.length > 0) {
    errors.push(`Duplicated required CSV headers: ${duplicatedHeaders.join(", ")}`);
  }

  return errors;
}

function warningsForExtraHeaders(headers: string[]): string[] {
  const extraHeaders = headers.filter((header) => !requiredCsvHeaders.includes(header as (typeof requiredCsvHeaders)[number]));
  return extraHeaders.length === 0 ? [] : [`Warning: ignored extra CSV columns: ${extraHeaders.join(", ")}`];
}

function requiredHeaderIndexes(headers: string[]): Record<(typeof requiredCsvHeaders)[number], number> {
  return {
    first_name: headers.indexOf("first_name"),
    last_name: headers.indexOf("last_name"),
    telephone: headers.indexOf("telephone"),
    group: headers.indexOf("group"),
  };
}

function valuesForRequiredHeaders(
  fields: string[],
  headerIndexes: Record<(typeof requiredCsvHeaders)[number], number>,
): CsvRowValues {
  return {
    first_name: fields[headerIndexes.first_name]?.trim() ?? "",
    last_name: fields[headerIndexes.last_name]?.trim() ?? "",
    telephone: fields[headerIndexes.telephone]?.trim() ?? "",
    group: fields[headerIndexes.group]?.trim() ?? "",
  };
}

async function runAddressBooksShell(args: string[], runtime: CliRuntime): Promise<CliResult> {
  if (args.includes("--help") || args.includes("-h")) {
    return ok(`Usage: nextcloud-address-importer address-books [options]

Options:
  --config <path>
  --server-url <url>
  --username <name>
  --app-password <password>
`);
  }

  const parsedArgs = parseArgs(args);

  if (parsedArgs.error !== undefined) {
    return fail(parsedArgs.error);
  }

  if (parsedArgs.positionals.length > 0) {
    return fail(`Unexpected argument: ${parsedArgs.positionals[0]}`);
  }

  const connectionResult = await resolveConnectionConfig(parsedArgs.options, runtime);

  if (connectionResult.exitCode !== 0) {
    return connectionResult;
  }

  const connection = connectionResult.connection;

  if (connection === undefined) {
    return fail("Connection configuration could not be resolved.");
  }

  const discoveryResult = await discoverAddressBooks(connection, runtime);

  if (typeof discoveryResult === "string") {
    return fail(discoveryResult);
  }

  if (connection.addressBook !== undefined) {
    const selectionResult = selectAddressBook(discoveryResult, connection.addressBook);

    if (typeof selectionResult === "string") {
      return fail(selectionResult);
    }
  }

  return {
    exitCode: 0,
    stdout: discoveryResult.map((addressBook) => `${addressBook.displayName}\t${addressBook.url}`),
    stderr: [],
    connection,
  };
}

async function discoverAddressBooks(connection: ConnectionConfig, runtime: CliRuntime): Promise<AddressBook[] | string> {
  const davBaseUrl = new URL("/remote.php/dav/", normalizedServerUrl(connection.serverUrl));
  const principalResponse = await propfind(
    davBaseUrl,
    connection,
    runtime,
    "0",
    `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:current-user-principal /></d:prop>
</d:propfind>`,
    "discover current user principal",
  );

  if (principalResponse.error !== undefined) {
    return principalResponse.error;
  }

  const principalHref = propertyValue(principalResponse.body, "current-user-principal");

  if (principalHref === undefined) {
    return "CardDAV discovery failed: current user principal was not returned.";
  }

  const homeSetResponse = await propfind(
    resolveDavHref(principalHref, davBaseUrl),
    connection,
    runtime,
    "0",
    `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop><card:addressbook-home-set /></d:prop>
</d:propfind>`,
    "discover address book home set",
  );

  if (homeSetResponse.error !== undefined) {
    return homeSetResponse.error;
  }

  const addressBookHomeHref = propertyValue(homeSetResponse.body, "addressbook-home-set");

  if (addressBookHomeHref === undefined) {
    return "CardDAV discovery failed: address book home set was not returned.";
  }

  const addressBooksResponse = await propfind(
    resolveDavHref(addressBookHomeHref, davBaseUrl),
    connection,
    runtime,
    "1",
    `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:displayname /><d:resourcetype /></d:prop>
</d:propfind>`,
    "list address books",
  );

  if (addressBooksResponse.error !== undefined) {
    return addressBooksResponse.error;
  }

  const addressBooks = responseBlocks(addressBooksResponse.body)
    .filter((response) => /<[^>]*:?addressbook(?:\s|>|\/)/u.test(response))
    .map((response) => {
      const href = firstHref(response);
      const url = href === undefined ? undefined : resolveDavHref(href, davBaseUrl).href;
      const displayName = propertyText(response, "displayname") ?? (url === undefined ? undefined : lastUrlSegment(url));
      return url === undefined || displayName === undefined ? undefined : { displayName, url };
    })
    .filter((addressBook): addressBook is AddressBook => addressBook !== undefined);

  if (addressBooks.length === 0) {
    return "CardDAV discovery failed: no address books were returned.";
  }

  return addressBooks;
}

async function propfind(
  url: URL,
  connection: ConnectionConfig,
  runtime: CliRuntime,
  depth: "0" | "1",
  body: string,
  action: string,
): Promise<{ body: string; error?: undefined } | { body?: undefined; error: string }> {
  const fetchImplementation = runtime.fetch ?? fetch;
  let response: Response;

  try {
    response = await fetchImplementation(url, {
      method: "PROPFIND",
      headers: {
        Authorization: `Basic ${Buffer.from(`${connection.username}:${connection.appPassword}`, "utf8").toString("base64")}`,
        Depth: depth,
        "Content-Type": "application/xml; charset=utf-8",
      },
      body,
    });
  } catch {
    return { error: `Network error during CardDAV discovery while trying to ${action}.` };
  }

  if (response.status === 401 || response.status === 403) {
    return { error: "CardDAV authentication failed. Check the Nextcloud username and app password." };
  }

  if (response.status !== 207) {
    return { error: `CardDAV discovery failed while trying to ${action}: expected 207 Multi-Status, got HTTP ${response.status}.` };
  }

  return { body: await response.text() };
}

function selectAddressBook(addressBooks: AddressBook[], configuredAddressBook: string): AddressBook | string {
  const normalizedConfiguredValue = normalizeAddressBookSelector(configuredAddressBook);
  const matches = addressBooks.filter(
    (addressBook) =>
      addressBook.displayName === configuredAddressBook ||
      normalizeAddressBookSelector(addressBook.url) === normalizedConfiguredValue ||
      normalizeAddressBookSelector(new URL(addressBook.url).pathname) === normalizedConfiguredValue,
  );

  if (matches.length === 0) {
    return `Configured address book was not found after discovery: ${configuredAddressBook}`;
  }

  if (matches.length > 1) {
    return `Configured address book is ambiguous after discovery: ${configuredAddressBook}`;
  }

  return matches[0] ?? "Configured address book was not found after discovery.";
}

function normalizedServerUrl(serverUrl: string): URL {
  const url = new URL(serverUrl);
  url.pathname = url.pathname.replace(/\/$/u, "");
  return url;
}

function resolveDavHref(href: string, baseUrl: URL): URL {
  return new URL(href, baseUrl.origin);
}

function responseBlocks(xml: string): string[] {
  return Array.from(xml.matchAll(/<[^>]*:?response\b[\s\S]*?<\/[^>]*:?response>/giu), (match) => match[0]);
}

function firstHref(xml: string): string | undefined {
  return propertyText(xml, "href");
}

function propertyValue(xml: string, propertyName: string): string | undefined {
  const propertyXml = propertyXmlBlock(xml, propertyName);
  return propertyXml === undefined ? undefined : firstHref(propertyXml);
}

function propertyText(xml: string, propertyName: string): string | undefined {
  const match = new RegExp(`<[^>]*:?${propertyName}\\b[^>]*>([\\s\\S]*?)<\\/[^>]*:?${propertyName}>`, "iu").exec(xml);
  const value = match?.[1]?.replace(/<[^>]+>/gu, "").trim();
  return value === undefined || value === "" ? undefined : decodeXmlEntities(value);
}

function propertyXmlBlock(xml: string, propertyName: string): string | undefined {
  return new RegExp(`<[^>]*:?${propertyName}\\b[^>]*>[\\s\\S]*?<\\/[^>]*:?${propertyName}>`, "iu").exec(xml)?.[0];
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function lastUrlSegment(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/\/$/u, "").split("/").at(-1) ?? url);
}

function normalizeAddressBookSelector(value: string): string {
  return value.trim().replace(/\/$/u, "");
}

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: CliConnectionOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === undefined) {
      continue;
    }

    if (!arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }

    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);
    const inlineValue = equalsIndex === -1 ? undefined : arg.slice(equalsIndex + 1);

    if (flag === "--dry-run" || flag === "--yes") {
      continue;
    }

    if (flag === "--json-report") {
      const optionValue = inlineValue ?? args[index + 1];

      if (optionValue === undefined || isKnownFlag(optionValue)) {
        return { positionals, options, error: `Missing value for ${flag}` };
      }

      if (inlineValue === undefined) {
        index += 1;
      }

      continue;
    }

    const optionName = optionNameForFlag(flag);

    if (optionName === undefined) {
      return { positionals, options, error: `Unknown option: ${flag}` };
    }

    const optionValue = inlineValue ?? args[index + 1];

    if (optionValue === undefined || isKnownFlag(optionValue)) {
      return { positionals, options, error: `Missing value for ${flag}` };
    }

    options[optionName] = optionValue;

    if (inlineValue === undefined) {
      index += 1;
    }
  }

  return { positionals, options };
}

function isKnownFlag(arg: string): boolean {
  const equalsIndex = arg.indexOf("=");
  const flag = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);
  return flag === "--dry-run" || flag === "--yes" || flag === "--json-report" || optionNameForFlag(flag) !== undefined;
}

function optionNameForFlag(flag: string): keyof CliConnectionOptions | undefined {
  switch (flag) {
    case "--config":
      return "config";
    case "--server-url":
      return "serverUrl";
    case "--username":
      return "username";
    case "--app-password":
      return "appPassword";
    case "--address-book":
      return "addressBook";
    default:
      return undefined;
  }
}

async function resolveConnectionConfig(
  cliOptions: CliConnectionOptions,
  runtime: CliRuntime,
): Promise<CliResult> {
  const env = runtime.env ?? process.env;
  const configPath = cliOptions.config ?? `${runtime.homeDir ?? homedir()}/${defaultConfigRelativePath}`;
  const configFileResult = await readConfigFile(configPath, cliOptions.config !== undefined, runtime);

  if (configFileResult.error !== undefined) {
    return fail(configFileResult.error);
  }

  const config = configFileResult.config;
  const serverUrl = firstValue(
    cliOptions.serverUrl,
    env.NEXTCLOUD_ADDRESS_IMPORTER_SERVER_URL,
    config.server_url,
  );
  const username = firstValue(cliOptions.username, env.NEXTCLOUD_ADDRESS_IMPORTER_USERNAME, config.username);
  let appPassword = firstValue(
    cliOptions.appPassword,
    env.NEXTCLOUD_ADDRESS_IMPORTER_APP_PASSWORD,
    config.app_password,
  );
  const addressBook = firstValue(
    cliOptions.addressBook,
    env.NEXTCLOUD_ADDRESS_IMPORTER_ADDRESS_BOOK,
    config.address_book,
  );

  if (serverUrl === undefined) {
    return fail(
      "Missing Nextcloud server URL. Set --server-url, NEXTCLOUD_ADDRESS_IMPORTER_SERVER_URL, or server_url in config.",
    );
  }

  if (username === undefined) {
    return fail(
      "Missing Nextcloud username. Set --username, NEXTCLOUD_ADDRESS_IMPORTER_USERNAME, or username in config.",
    );
  }

  if (appPassword === undefined) {
    if (runtime.isInteractive ?? (process.stdin.isTTY === true && process.stdout.isTTY === true)) {
      const promptHidden = runtime.promptHidden ?? defaultPromptHidden;
      try {
        appPassword = trimToValue(await promptHidden("Nextcloud app password: "));
      } catch {
        return fail("Could not securely read Nextcloud app password. Set NEXTCLOUD_ADDRESS_IMPORTER_APP_PASSWORD or --app-password instead.");
      }
    }

    if (appPassword === undefined) {
      return fail(
        "Missing Nextcloud app password. Set --app-password, NEXTCLOUD_ADDRESS_IMPORTER_APP_PASSWORD, app_password in config, or run interactively to enter it securely. Use a Nextcloud app password, not your normal web password.",
      );
    }
  }

  return {
    exitCode: 0,
    stdout: [],
    stderr: [],
    connection: {
      serverUrl,
      username,
      appPassword,
      ...(addressBook === undefined ? {} : { addressBook }),
    },
  };
}

async function readConfigFile(
  path: string,
  explicitPath: boolean,
  runtime: CliRuntime,
): Promise<{ config: ConfigFileValues; error?: string }> {
  const readFile = runtime.readFile ?? ((filePath: string) => fs.readFile(filePath, "utf8"));

  try {
    const contents = await readFile(path);
    return { config: parseTomlConfig(Buffer.isBuffer(contents) ? contents.toString("utf8") : contents) };
  } catch (error) {
    if (isMissingFileError(error) && !explicitPath) {
      return { config: {} };
    }

    if (error instanceof ConfigParseError) {
      return { config: {}, error: `Invalid config file: ${path}` };
    }

    return { config: {}, error: `Could not read config file: ${path}` };
  }
}

class ConfigParseError extends Error {}

function parseTomlConfig(contents: string): ConfigFileValues {
  let parsedConfig: Record<string, unknown>;

  try {
    parsedConfig = parseToml(contents, { unsafeKeyBehaviour: "throw" });
  } catch {
    throw new ConfigParseError("Invalid TOML config");
  }

  const config: ConfigFileValues = {};

  for (const [key, value] of Object.entries(parsedConfig)) {
    if (!isConfigKey(key)) {
      continue;
    }

    if (typeof value !== "string") {
      throw new ConfigParseError("Connection config values must be strings");
    }

    config[key] = trimToValue(value);
  }

  return config;
}

function isConfigKey(key: string): key is keyof ConfigFileValues {
  return key === "server_url" || key === "username" || key === "app_password" || key === "address_book";
}

function firstValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmedValue = trimToValue(value);

    if (trimmedValue !== undefined) {
      return trimmedValue;
    }
  }

  return undefined;
}

function trimToValue(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue === undefined || trimmedValue === "" ? undefined : trimmedValue;
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function defaultPromptHidden(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const disableEchoResult = spawnSync("stty", ["-echo"], { stdio: ["inherit", "ignore", "ignore"] });

  if (disableEchoResult.status !== 0) {
    throw new Error("Could not disable terminal echo");
  }

  const readline = createInterface({ input: process.stdin, output: process.stdout });

  try {
    return await readline.question("");
  } finally {
    readline.close();
    spawnSync("stty", ["echo"], { stdio: ["inherit", "ignore", "ignore"] });
    process.stdout.write("\n");
  }
}

function ok(message: string, connection?: ConnectionConfig): CliResult {
  return { exitCode: 0, stdout: [message], stderr: [], ...(connection === undefined ? {} : { connection }) };
}

function fail(message: string): CliResult {
  return { exitCode: 1, stdout: [], stderr: [message] };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const result = await runCli(argv);

  for (const line of result.stdout) {
    console.log(line);
  }

  for (const line of result.stderr) {
    console.error(line);
  }

  process.exitCode = result.exitCode;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
