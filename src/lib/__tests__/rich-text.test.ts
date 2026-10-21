import { describe, expect, it } from "vitest";
import { contrastRatio, parseCssColor, sanitizeRichTextHtml } from "../rich-text";

describe("parseCssColor", () => {
  it("parses hex, rgb()/rgba() in both syntaxes and neutral names", () => {
    expect(parseCssColor("#fff")).toEqual({ rgb: [255, 255, 255], alpha: 1 });
    expect(parseCssColor("#1e1e1e80")?.alpha).toBeCloseTo(0.5, 1);
    expect(parseCssColor("rgb(212, 212, 212)")).toEqual({ rgb: [212, 212, 212], alpha: 1 });
    expect(parseCssColor("rgb(0 0 0 / 40%)")).toEqual({ rgb: [0, 0, 0], alpha: 0.4 });
    expect(parseCssColor("LightGray")).toEqual({ rgb: [211, 211, 211], alpha: 1 });
    expect(parseCssColor("var(--x)")).toBeNull();
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
    expect(contrastRatio([128, 128, 128], [128, 128, 128])).toBeCloseTo(1, 5);
  });
});

describe("sanitizeRichTextHtml", () => {
  const darkAppText = '<p style="color: rgb(212, 212, 212); font-weight: 600">Root cause</p>';

  it("drops light text copied from a dark app on the light theme, keeping other styles", () => {
    const html = sanitizeRichTextHtml(darkAppText, "light");
    expect(html).toContain("Root cause");
    expect(html).not.toContain("color");
    expect(html).toContain("font-weight: 600");
  });

  it("keeps the same text colour where it is readable (dark theme)", () => {
    expect(sanitizeRichTextHtml(darkAppText, "dark")).toContain("color: rgb(212, 212, 212)");
  });

  it("drops dark text copied from a light app on the dark theme", () => {
    const html = sanitizeRichTextHtml('<span style="color:#1f1f1f">x</span>', "dark");
    expect(html).not.toContain("color");
  });

  it("keeps readable syntax colours and unknown values, drops faint ones", () => {
    expect(sanitizeRichTextHtml('<span style="color:#a31515">s</span>', "light")).toContain(
      "color:#a31515",
    );
    expect(sanitizeRichTextHtml('<span style="color: var(--fg)">v</span>', "light")).toContain(
      "var(--fg)",
    );
    expect(
      sanitizeRichTextHtml('<span style="color: rgba(0,0,0,0.3)">f</span>', "light"),
    ).not.toContain("color");
  });

  it("still strips backgrounds and unsafe markup", () => {
    const html = sanitizeRichTextHtml(
      '<div style="background-color:#1e1e1e;color:#000">a</div><script>alert(1)</script>',
      "light",
    );
    expect(html).not.toContain("background");
    expect(html).not.toContain("script");
    expect(html).toContain("color:#000");
  });
});
