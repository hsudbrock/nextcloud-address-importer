#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export type CliResult = {
  exitCode: number;
  stdout: string[];
  stderr: string[];
};

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

export function runCli(argv: string[]): CliResult {
  const [command, ...args] = argv;

  if (command === undefined || command === "--help" || command === "-h") {
    return ok(usage.trimEnd());
  }

  if (command === "--version" || command === "-v") {
    return ok("nextcloud-address-importer 0.1.0");
  }

  if (command === "import") {
    return runImportShell(args);
  }

  if (command === "address-books") {
    return runAddressBooksShell(args);
  }

  return fail(`Unknown command: ${command}\n\n${usage.trimEnd()}`);
}

function runImportShell(args: string[]): CliResult {
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

  const csvPath = args.find((arg) => !arg.startsWith("-"));

  if (csvPath === undefined) {
    return fail("Missing CSV file path. Usage: nextcloud-address-importer import <contacts.csv>");
  }

  return ok(`Import command is available. CSV path: ${csvPath}`);
}

function runAddressBooksShell(args: string[]): CliResult {
  if (args.includes("--help") || args.includes("-h")) {
    return ok(`Usage: nextcloud-address-importer address-books [options]

Options:
  --config <path>
  --server-url <url>
  --username <name>
  --app-password <password>
`);
  }

  return ok("Address book discovery command is available.");
}

function ok(message: string): CliResult {
  return { exitCode: 0, stdout: [message], stderr: [] };
}

function fail(message: string): CliResult {
  return { exitCode: 1, stdout: [], stderr: [message] };
}

export function main(argv = process.argv.slice(2)): void {
  const result = runCli(argv);

  for (const line of result.stdout) {
    console.log(line);
  }

  for (const line of result.stderr) {
    console.error(line);
  }

  process.exitCode = result.exitCode;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
