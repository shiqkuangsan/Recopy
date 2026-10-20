import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

declare global {
  interface Window {
    /** Called by the backend (`webview.eval`) on every HUD show. */
    __recopyHudShow?: () => void;
    /** Called by the backend before hiding the HUD (non-macOS). */
    __recopyHudHide?: () => void;
  }
}

interface CopyHudViewProps {
  isMac: boolean;
  /** Bumped on every show so the entrance animation replays. */
  playKey?: number;
  /** Fade the content out before the window hides (non-macOS; macOS fades natively). */
  leaving?: boolean;
}

export function CopyHudView({ isMac, playKey = 0, leaving = false }: CopyHudViewProps) {
  const { t } = useTranslation();
  const rootClassName = `h-screen w-screen flex items-center justify-center overflow-hidden ${
    isMac ? "" : "bg-zinc-900 text-white"
  }`;
  // Animate content only: the Windows surface stays solid (see 7005023).
  const surfaceClassName = `flex flex-col items-center justify-center ${
    isMac ? "" : "h-full w-full"
  } ${leaving ? "hud-leave" : "hud-enter"}`;

  return (
    <div data-testid="copy-hud-root" className={rootClassName}>
      <div key={playKey} data-testid="copy-hud-surface" className={surfaceClassName}>
        <Check
          className={`${isMac ? "text-foreground/70" : "text-white/90"} drop-shadow-lg`}
          size={52}
          strokeWidth={2.5}
        />
        <span
          className={`${isMac ? "text-foreground/70" : "text-white/90"} text-xl font-semibold mt-2 drop-shadow-lg`}
        >
          {t("context.copied")}
        </span>
      </div>
    </div>
  );
}
