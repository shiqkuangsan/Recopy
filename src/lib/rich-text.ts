import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p",
  "br",
  "b",
  "i",
  "u",
  "strong",
  "em",
  "span",
  "div",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "code",
  "pre",
  "blockquote",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "img",
  "sub",
  "sup",
];

/** Approximate preview surfaces (preview-surface over the native material). */
const SURFACE_RGB = { light: [247, 247, 248], dark: [43, 43, 46] } as const;
/** Below this the copied colour is unreadable on our surface (WCAG large-text AA). */
const MIN_CONTRAST = 3;

const NAMED_COLORS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  lightgray: [211, 211, 211],
  lightgrey: [211, 211, 211],
  darkgray: [169, 169, 169],
  darkgrey: [169, 169, 169],
  dimgray: [105, 105, 105],
  dimgrey: [105, 105, 105],
  gainsboro: [220, 220, 220],
  whitesmoke: [245, 245, 245],
};

/** Parse hex, rgb()/rgba() and common neutral names; null when unknown. */
export function parseCssColor(
  value: string,
): { rgb: [number, number, number]; alpha: number } | null {
  const v = value.trim().toLowerCase();
  const hex = v.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
    return { rgb: n, alpha: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  const fn = v.match(/^rgba?\(([^)]+)\)$/);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const channel = (p: string) => (p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p));
    const rgb = parts.slice(0, 3).map(channel) as [number, number, number];
    if (rgb.some((c) => Number.isNaN(c))) return null;
    const a = parts[3];
    const alpha = a === undefined ? 1 : a.endsWith("%") ? parseFloat(a) / 100 : parseFloat(a);
    return { rgb, alpha: Number.isNaN(alpha) ? 1 : alpha };
  }
  return NAMED_COLORS[v] ? { rgb: NAMED_COLORS[v], alpha: 1 } : null;
}

function luminance([r, g, b]: readonly number[]) {
  const [R, G, B] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function contrastRatio(a: readonly number[], b: readonly number[]) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Keep a copied text colour only when it stays readable on the current surface. */
function keepsReadableColor(value: string, theme: "light" | "dark") {
  const color = parseCssColor(value);
  // Unknown syntax (var(), hsl(), keywords) is left to the browser untouched.
  if (!color) return true;
  if (color.alpha < 0.5) return false;
  return contrastRatio(color.rgb, SURFACE_RGB[theme]) >= MIN_CONTRAST;
}

/**
 * Sanitize copied HTML for the preview and adapt it to our theme:
 * - background styles are dropped (partial highlight blocks, e.g. VS Code);
 * - text colours that would be unreadable on the current surface are dropped
 *   (light gray copied from a dark app on a light theme, and vice versa),
 *   while readable ones such as syntax highlighting are kept.
 */
export function sanitizeRichTextHtml(html: string, theme: "light" | "dark") {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "src", "alt", "class", "style"],
  });

  return sanitized.replace(/style="([^"]*)"/g, (_, styles: string) => {
    const filtered = styles
      .split(";")
      .filter((declaration) => {
        const separator = declaration.indexOf(":");
        if (separator < 0) return false;
        const name = declaration.slice(0, separator).trim().toLowerCase();
        const value = declaration.slice(separator + 1);
        if (name.startsWith("background")) return false;
        if (name === "color" || name === "-webkit-text-fill-color") {
          return keepsReadableColor(value.replace(/!important/i, ""), theme);
        }
        return true;
      })
      .join(";")
      .trim();
    return filtered ? `style="${filtered}"` : "";
  });
}
