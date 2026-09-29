#!/usr/bin/env node

import { spawnSync } from "node:child_process";
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

export type CliRuntime = {
  env?: Record<string, string | undefined>;
  readFile?: (path: string) => Promise<string>;
  homeDir?: string;
  isInteractive?: boolean;
  promptHidden?: (prompt: string) => Promise<string>;
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

const defaultConfigRelativePath = ".config/nextcloud-address-importer/config.toml";

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

  return ok(`Import command is available. CSV path: ${csvPath}`, connectionResult.connection);
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

  return ok("Address book discovery command is available.", connectionResult.connection);
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

      if (optionValue === undefined || optionValue.startsWith("-")) {
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

    if (optionValue === undefined || optionValue.startsWith("-")) {
      return { positionals, options, error: `Missing value for ${flag}` };
    }

    options[optionName] = optionValue;

    if (inlineValue === undefined) {
      index += 1;
    }
  }

  return { positionals, options };
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
      appPassword = trimToValue(await promptHidden("Nextcloud app password: "));
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
    return { config: parseTomlConfig(await readFile(path)) };
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
  spawnSync("stty", ["-echo"], { stdio: ["inherit", "ignore", "ignore"] });
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
