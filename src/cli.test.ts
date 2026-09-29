import { describe, expect, it, vi } from "vitest";

import { mapCsvRowsToContactPlans, runCli } from "./cli.js";
import type { CliRuntime } from "./cli.js";

const validConnectionEnv = {
  NEXTCLOUD_ADDRESS_IMPORTER_SERVER_URL: "https://nextcloud.example.com",
  NEXTCLOUD_ADDRESS_IMPORTER_USERNAME: "ada",
  NEXTCLOUD_ADDRESS_IMPORTER_APP_PASSWORD: "env-secret",
};

const validCsv = `first_name,last_name,telephone,group
Ada,Lovelace,+44 20 0000 0000,Friends
Grace,Hopper,+1 555 0100,Work
`;

function importRuntime(csv: string): CliRuntime {
  return {
    env: validConnectionEnv,
    readFile: async (path) => {
      if (path === "contacts.csv") {
        return csv;
      }

      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
  };
}

describe("runCli", () => {
  it("shows top-level help", async () => {
    const result = await runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("nextcloud-address-importer import <contacts.csv>");
  });

  it("exposes the import command shell", async () => {
    const result = await runCli(["import", "contacts.csv"], importRuntime(validCsv));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("CSV validation passed: 2 contact rows ready from contacts.csv");
  });

  it("accepts semicolon-separated CSV and quoted delimiters", async () => {
    const result = await runCli(
      ["import", "contacts.csv"],
      importRuntime(`telephone;group;last_name;first_name
"+44;20";Friends;Lovelace;Ada
"+1,555";Work;Hopper;Grace
`),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("CSV validation passed: 2 contact rows ready from contacts.csv");
  });

  it("accepts a UTF-8 BOM and reports ignored blank lines", async () => {
    const result = await runCli(
      ["import", "contacts.csv"],
      importRuntime(`\ufefffirst_name,last_name,telephone,group

Ada,Lovelace,+44 20 0000 0000,Friends
`),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("CSV validation passed: 1 contact row ready from contacts.csv");
    expect(result.stdout).toContain("Warning: ignored 1 blank line");
  });

  it("warns about extra CSV columns without failing", async () => {
    const result = await runCli(
      ["import", "contacts.csv"],
      importRuntime(`first_name,last_name,telephone,group,"notes;private"
Ada,Lovelace,+44 20 0000 0000,Friends,ignored
`),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Warning: ignored extra CSV columns: notes;private");
  });

  it("fails on mixed delimiter usage in the header", async () => {
    const result = await runCli(
      ["import", "contacts.csv"],
      importRuntime("first_name,last_name;telephone,group\nAda,Lovelace,+44 20 0000 0000,Friends\n"),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("CSV header mixes comma and semicolon delimiters");
  });

  it("fails on missing and duplicated required headers", async () => {
    const result = await runCli(
      ["import", "contacts.csv"],
      importRuntime("first_name,last_name,telephone,telephone\nAda,Lovelace,+44 20 0000 0000,+44 20 0000 0000\n"),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("Missing required CSV headers: group");
    expect(result.stderr.join("\n")).toContain("Duplicated required CSV headers: telephone");
  });

  it("fails on empty required values after trimming", async () => {
    const result = await runCli(
      ["import", "contacts.csv"],
      importRuntime("first_name,last_name,telephone,group\nAda,  ,+44 20 0000 0000,Friends\n"),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("CSV row 2 has empty required values: last_name");
  });

  it("fails on duplicate CSV import identities", async () => {
    const result = await runCli(
      ["import", "contacts.csv"],
      importRuntime(`first_name,last_name,telephone,group
Ada,Lovelace,+44 20 0000 0000,Friends
Ada,Lovelace,+44 20 0000 0000,Work
`),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("Duplicate CSV import identity on rows 2 and 3");
  });

  it("accepts a valid literal replacement character in CSV text", async () => {
    const result = await runCli(
      ["import", "contacts.csv"],
      importRuntime("first_name,last_name,telephone,group\nAda,Lovelace,�,Friends\n"),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("CSV validation passed: 1 contact row ready from contacts.csv");
  });

  it("fails when CSV bytes are invalid UTF-8", async () => {
    const result = await runCli(["import", "contacts.csv"], {
      env: validConnectionEnv,
      readFile: async (path) => {
        if (path === "contacts.csv") {
          return Buffer.from([0xff]);
        }

        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("CSV file is not valid UTF-8");
  });

  it("does not report quoted blank physical lines as ignored CSV rows", async () => {
    const result = await runCli(
      ["import", "contacts.csv"],
      importRuntime(`first_name,last_name,telephone,group
Ada,"Love

lace",+44 20 0000 0000,Friends
Grace,  ,+1 555 0100,Work
`),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("CSV row 5 has empty required values: last_name");
    expect(result.stdout.join("\n")).not.toContain("ignored");
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

describe("mapCsvRowsToContactPlans", () => {
  it("maps CSV rows to create-only contact plans with vCard output", () => {
    const plans = mapCsvRowsToContactPlans(
      [
        {
          first_name: "Ada",
          last_name: "Lovelace",
          telephone: "+44 20 0000 0000",
          group: "Friends",
        },
        {
          first_name: "Grace",
          last_name: "Hopper",
          telephone: "+1 555 0100",
          group: "Work",
        },
      ],
      vi.fn().mockReturnValueOnce("uid-ada").mockReturnValueOnce("uid-grace"),
    );

    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({
      operation: "create",
      uid: "uid-ada",
      name: {
        givenName: "Ada",
        familyName: "Lovelace",
      },
      displayName: "Ada Lovelace",
      telephone: "+44 20 0000 0000",
      categories: ["Friends"],
    });
    expect(plans[0]?.vcard).toBe(
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        "UID:uid-ada",
        "N:Lovelace;Ada;;;",
        "FN:Ada Lovelace",
        "TEL:+44 20 0000 0000",
        "CATEGORIES:Friends",
        "END:VCARD",
        "",
      ].join("\r\n"),
    );
    expect(plans.map((plan) => plan.uid)).toEqual(["uid-ada", "uid-grace"]);
  });

  it("escapes vCard text while preserving telephone text", () => {
    const [plan] = mapCsvRowsToContactPlans(
      [
        {
          first_name: "A,da",
          last_name: "Love;lace",
          telephone: "+44;20,0000\\main",
          group: "Friends, Family",
        },
      ],
      () => "uid-escaped",
    );

    expect(plan?.telephone).toBe("+44;20,0000\\main");
    expect(plan?.categories).toEqual(["Friends, Family"]);
    expect(plan?.vcard).toContain("N:Love\\;lace;A\\,da;;;");
    expect(plan?.vcard).toContain("FN:A\\,da Love\\;lace");
    expect(plan?.vcard).toContain("TEL:+44;20,0000\\main");
    expect(plan?.vcard).toContain("CATEGORIES:Friends\\, Family");
  });

  it("fails if generated vCard UIDs are not unique", () => {
    expect(() =>
      mapCsvRowsToContactPlans(
        [
          {
            first_name: "Ada",
            last_name: "Lovelace",
            telephone: "+44 20 0000 0000",
            group: "Friends",
          },
          {
            first_name: "Grace",
            last_name: "Hopper",
            telephone: "+1 555 0100",
            group: "Work",
          },
        ],
        () => "duplicate-uid",
      ),
    ).toThrow("Generated duplicate vCard UID: duplicate-uid");
  });
});
