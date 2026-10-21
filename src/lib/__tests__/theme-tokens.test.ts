import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

function block(selector: string) {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("\n}", start));
}

function tokens(source: string) {
  return new Map(
    [...source.matchAll(/--(color-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
}

const SEMANTIC = [
  "color-surface",
  "color-surface-hover",
  "color-surface-border",
  "color-surface-border-hover",
  "color-selected",
  "color-inset",
  "color-preview-surface",
  "color-chrome",
  "color-chrome-strong",
  "color-chrome-muted",
];

describe("theme tokens", () => {
  const themes = {
    default: tokens(block("@theme")),
    light: tokens(block('html[data-theme="light"]')),
    dark: tokens(block('html[data-theme="dark"]')),
  };

  it("defines every semantic surface token for each theme", () => {
    for (const [name, map] of Object.entries(themes)) {
      for (const token of SEMANTIC) expect(map.has(token), `${name} ${token}`).toBe(true);
    }
  });

  it("keeps the explicit dark theme identical to the default", () => {
    for (const token of SEMANTIC) expect(themes.dark.get(token)).toBe(themes.default.get(token));
  });

  it("keeps chrome text opaque (translucent text washes out over vibrancy)", () => {
    for (const map of Object.values(themes)) {
      for (const token of ["color-chrome", "color-chrome-strong", "color-chrome-muted"]) {
        expect(map.get(token)).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });

  it("gives macOS a solid surface only when vibrancy is off, leaving Windows untouched", () => {
    const rule = css.match(
      /html\[data-platform="macos"\]\[data-vibrancy="off"\] \.window-surface \{([^}]*)\}/,
    );
    expect(rule?.[1]).toContain("background-color: var(--color-background)");
  });

  it("gives the preview a solid surface off macOS, where nothing sits behind it", () => {
    const rule = css.match(/html\[data-platform="other"\] \.preview-content \{([^}]*)\}/);
    expect(rule?.[1]).toContain("background-color: var(--color-background)");
  });

  it("keeps the light selection near-opaque so the wallpaper tint cannot bleed through", () => {
    const alpha = Number(themes.light.get("color-selected")?.match(/\/\s*([\d.]+)\)/)?.[1]);
    expect(alpha).toBeGreaterThanOrEqual(0.9);
  });
});
