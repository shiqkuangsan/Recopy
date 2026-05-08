import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface TauriWindowConfig {
  label: string;
  windowEffects?: unknown;
}

function readWindow(label: string) {
  const configPath = path.resolve(process.cwd(), "src-tauri/tauri.conf.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as {
    app: { windows: TauriWindowConfig[] };
  };
  return config.app.windows.find((window) => window.label === label);
}

describe("tauri window config", () => {
  it("does not apply native window effects to the Windows HUD window", () => {
    expect(readWindow("hud")).not.toHaveProperty("windowEffects");
  });
});
