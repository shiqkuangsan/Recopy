# Recopy brand assets

The approved identity is the blue/cyan ribbon R with a pale offset copy behind it.

- `app-icon.png`: high-resolution raster artwork with the presentation background removed.
- `tray-template.png`: monochrome silhouette for the macOS menu bar.
- `../icon.svg`: generated SVG container with embedded raster artwork and a clean rounded tile clip. It is not a traced vector drawing of the R.
- `../icon-1024.png`: normalized transparent 1024px application icon.

Regenerate native and web sizes after installing the project dependencies:

```sh
node scripts/generate-icons.mjs
```

The script updates the existing Tauri icon set (including the checked-in mobile variants), macOS template tray, Windows color tray, website favicon and touch icon, website logo PNGs, and the frontend logo. `website/images/icon-32.png` contains 64px artwork for legacy 32px display; new website references use `recopy-logo.png`.

Keep the white app tile opaque and its exterior transparent. macOS uses the black 44px template at menu-bar scale; Windows uses the color icon. Functional action icons and historical screenshots are not brand assets and are left intact.

The current promotional film and offline HTML use the same normalized icon. Their editable sources remain in the intentionally Git-ignored `outputs/source/` directory; the website's updated video and poster are tracked in `website/media/`.
