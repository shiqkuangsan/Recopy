# Landing-page media

- `recopy-film.mp4`: the approved original 60-second, 1920×1080 Recopy film from `outputs/recopy-handdrawn-1080p.mp4`. Chinese and English captions are embedded in the picture; the instrumental soundtrack is original. The website loads the file only when a visitor presses Play.
- `recopy-film-poster.png`: the approved film's scene-02 still, also used as synthetic image content in the interactive sample.
- `sketch.woff2`: the film's subset of LXGW WenKai Lite; retained OFL notice in `FONT-LICENSE.txt`. Used for short handwritten accents with system-font fallback.
- The landing-page SVG icons are from the project's `lucide-react` dependency. Its license is retained in `LUCIDE-LICENSE.txt`.

The interactive clipboard contains synthetic examples. Its Paste action writes only to the on-page note; image and file pastes are textual representations. It does not read the system clipboard. Only the explicit Homebrew copy button writes to the system clipboard.
