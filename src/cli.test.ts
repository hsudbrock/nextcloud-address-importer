import { describe, expect, it, vi } from "vitest";

import { runCli } from "./cli.js";

describe("runCli", () => {
  it("shows top-level help", async () => {
    const result = await runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("nextcloud-address-importer import <contacts.csv>");
  });

  it("exposes the import command shell", async () => {
    const result = await runCli(["import", "contacts.csv"], {
      env: {
        NEXTCLOUD_ADDRESS_IMPORTER_SERVER_URL: "https://nextcloud.example.com",
        NEXTCLOUD_ADDRESS_IMPORTER_USERNAME: "ada",
        NEXTCLOUD_ADDRESS_IMPORTER_APP_PASSWORD: "env-secret",
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Import command is available. CSV path: contacts.csv");
  });

  it("exposes the address-books command shell", async () => {
    const result = await runCli(["address-books"], {
      env: {
        NEXTCLOUD_ADDRESS_IMPORTER_SERVER_URL: "https://nextcloud.example.com",
        NEXTCLOUD_ADDRESS_IMPORTER_USERNAME: "ada",
        NEXTCLOUD_ADDRESS_IMPORTER_APP_PASSWORD: "env-secret",
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Address book discovery command is available.");
  });

  it("fails when import is missing a CSV path", async () => {
    const result = await runCli(["import"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("Missing CSV file path");
  });

  it("resolves connection configuration with CLI flags taking precedence over environment and config", async () => {
    const result = await runCli(
      [
        "address-books",
        "--config",
        "/tmp/config.toml",
        "--server-url",
        "https://cli.example.com",
        "--username",
        "cli-user",
        "--app-password",
        "cli-secret",
        "--address-book",
        "CLI Contacts",
      ],
      {
        env: {
          NEXTCLOUD_ADDRESS_IMPORTER_SERVER_URL: "https://env.example.com",
          NEXTCLOUD_ADDRESS_IMPORTER_USERNAME: "env-user",
          NEXTCLOUD_ADDRESS_IMPORTER_APP_PASSWORD: "env-secret",
          NEXTCLOUD_ADDRESS_IMPORTER_ADDRESS_BOOK: "Env Contacts",
        },
        readFile: async () => `
server_url = "https://config.example.com"
username = "config-user"
app_password = "config-secret"
address_book = "Config Contacts"
`,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.connection).toEqual({
      serverUrl: "https://cli.example.com",
      username: "cli-user",
      appPassword: "cli-secret",
      addressBook: "CLI Contacts",
    });
    expect([...result.stdout, ...result.stderr].join("\n")).not.toContain("cli-secret");
  });

  it("keeps equals signs in inline CLI flag values", async () => {
    const result = await runCli(
      [
        "address-books",
        "--server-url=https://nextcloud.example.com",
        "--username=ada",
        "--app-password=secret=with=equals",
      ],
      { env: {} },
    );

    expect(result.exitCode).toBe(0);
    expect(result.connection?.appPassword).toBe("secret=with=equals");
  });

  it("accepts separated CLI flag values that start with a hyphen", async () => {
    const result = await runCli(
      [
        "address-books",
        "--server-url",
        "https://nextcloud.example.com",
        "--username",
        "ada",
        "--app-password",
        "-secret",
      ],
      { env: {} },
    );

    expect(result.exitCode).toBe(0);
    expect(result.connection?.appPassword).toBe("-secret");
  });

  it("still fails when a value-taking flag is followed by another flag", async () => {
    const result = await runCli(["address-books", "--server-url", "--username", "ada"], { env: {} });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("Missing value for --server-url");
  });

  it("uses environment variables before config values", async () => {
    const result = await runCli(["address-books", "--config", "/tmp/config.toml"], {
      env: {
        NEXTCLOUD_ADDRESS_IMPORTER_SERVER_URL: "https://env.example.com",
        NEXTCLOUD_ADDRESS_IMPORTER_USERNAME: "env-user",
        NEXTCLOUD_ADDRESS_IMPORTER_APP_PASSWORD: "env-secret",
        NEXTCLOUD_ADDRESS_IMPORTER_ADDRESS_BOOK: "Env Contacts",
      },
      readFile: async () => `
server_url = "https://config.example.com"
username = "config-user"
app_password = "config-secret"
address_book = "Config Contacts"
`,
    });

    expect(result.exitCode).toBe(0);
    expect(result.connection).toEqual({
      serverUrl: "https://env.example.com",
      username: "env-user",
      appPassword: "env-secret",
      addressBook: "Env Contacts",
    });
    expect([...result.stdout, ...result.stderr].join("\n")).not.toContain("env-secret");
  });

  it("reads the default config path when no --config override is provided", async () => {
    const readFile = vi.fn(async () => `
server_url = "https://config.example.com"
username = "config-user"
app_password = "config-secret"
`);

    const result = await runCli(["address-books"], {
      env: {},
      homeDir: "/home/example",
      readFile,
    });

    expect(result.exitCode).toBe(0);
    expect(readFile).toHaveBeenCalledWith("/home/example/.config/nextcloud-address-importer/config.toml");
    expect(result.connection?.serverUrl).toBe("https://config.example.com");
  });

  it("reads valid TOML string forms from config", async () => {
    const result = await runCli(["address-books", "--config", "/tmp/config.toml"], {
      env: {},
      readFile: async () => `
server_url = 'https://config.example.com'
username = 'config-user'
app_password = 'config-secret'
`,
    });

    expect(result.exitCode).toBe(0);
    expect(result.connection).toEqual({
      serverUrl: "https://config.example.com",
      username: "config-user",
      appPassword: "config-secret",
    });
  });

  it("fails when an explicit config path cannot be read", async () => {
    const result = await runCli(["address-books", "--config", "/missing/config.toml"], {
      env: {},
      readFile: async () => {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("Could not read config file: /missing/config.toml");
  });

  it("prompts for a missing app password in interactive mode without printing it", async () => {
    const promptHidden = vi.fn(async () => "prompt-secret");

    const result = await runCli(["address-books"], {
      env: {
        NEXTCLOUD_ADDRESS_IMPORTER_SERVER_URL: "https://env.example.com",
        NEXTCLOUD_ADDRESS_IMPORTER_USERNAME: "env-user",
      },
      isInteractive: true,
      promptHidden,
    });

    expect(result.exitCode).toBe(0);
    expect(promptHidden).toHaveBeenCalledWith("Nextcloud app password: ");
    expect(result.connection?.appPassword).toBe("prompt-secret");
    expect([...result.stdout, ...result.stderr].join("\n")).not.toContain("prompt-secret");
  });

  it("fails safely when a hidden app password prompt cannot be secured", async () => {
    const result = await runCli(["address-books"], {
      env: {
        NEXTCLOUD_ADDRESS_IMPORTER_SERVER_URL: "https://env.example.com",
        NEXTCLOUD_ADDRESS_IMPORTER_USERNAME: "env-user",
      },
      isInteractive: true,
      promptHidden: async () => {
        throw new Error("echo could not be disabled");
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("Could not securely read Nextcloud app password");
  });

  it("fails with setup guidance when the app password is missing in non-interactive mode", async () => {
    const result = await runCli(["address-books"], {
      env: {
        NEXTCLOUD_ADDRESS_IMPORTER_SERVER_URL: "https://env.example.com",
        NEXTCLOUD_ADDRESS_IMPORTER_USERNAME: "env-user",
      },
      isInteractive: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("Missing Nextcloud app password");
    expect(result.stderr.join("\n")).toContain("NEXTCLOUD_ADDRESS_IMPORTER_APP_PASSWORD");
  });

  it("does not print secrets from config parse errors", async () => {
    const result = await runCli(["address-books", "--config", "/tmp/config.toml"], {
      env: {},
      readFile: async () => 'app_password = "config-secret"\nnot valid toml',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("Invalid config file: /tmp/config.toml");
    expect(result.stderr.join("\n")).not.toContain("config-secret");
  });
});
