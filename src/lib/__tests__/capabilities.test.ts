import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));

// A window missing from the default capability gets no core permissions, so
// calls like event listen fail at runtime (the HUD's theme listener did).
describe("capabilities", () => {
  it("grants the default capability to every window declared in tauri.conf.json", () => {
    const config = read("src-tauri/tauri.conf.json") as { app: { windows: { label: string }[] } };
    const capability = read("src-tauri/capabilities/default.json") as { windows: string[] };
    for (const { label } of config.app.windows) {
      expect(capability.windows, label).toContain(label);
    }
  });
});
