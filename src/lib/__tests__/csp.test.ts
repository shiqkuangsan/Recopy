import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Without these connect-src origins the release WebView silently falls back to
// postMessage IPC (the cause of the 1.11.0 thumbnail regression). The dev server
// does not apply this CSP, so only this test guards it.
describe("production CSP", () => {
  const config = JSON.parse(
    readFileSync(resolve(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"),
  ) as { app: { security: { csp: string } } };
  const directives = new Map(
    config.app.security.csp
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .filter((tokens) => tokens[0])
      .map(([name, ...sources]) => [name, sources] as const),
  );

  it("allows the Tauri IPC protocol on macOS and Windows", () => {
    const connect = directives.get("connect-src") ?? [];
    expect(connect).toEqual(expect.arrayContaining(["ipc:", "http://ipc.localhost"]));
  });

  it("keeps same-origin and asset requests allowed once connect-src overrides default-src", () => {
    const connect = directives.get("connect-src") ?? [];
    expect(connect).toEqual(expect.arrayContaining(["'self'", "asset:", "http://asset.localhost"]));
  });
});
