import { describe, expect, it } from "vitest";

import { runCli } from "./cli.js";

describe("runCli", () => {
  it("shows top-level help", () => {
    const result = runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("nextcloud-address-importer import <contacts.csv>");
  });

  it("exposes the import command shell", () => {
    const result = runCli(["import", "contacts.csv"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Import command is available. CSV path: contacts.csv");
  });

  it("exposes the address-books command shell", () => {
    const result = runCli(["address-books"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Address book discovery command is available.");
  });

  it("fails when import is missing a CSV path", () => {
    const result = runCli(["import"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("Missing CSV file path");
  });
});
