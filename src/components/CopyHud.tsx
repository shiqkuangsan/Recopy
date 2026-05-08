import { invoke } from "@tauri-apps/api/core";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { create } from "zustand";

interface CopyHudState {
  show: () => void;
}

export const useCopyHud = create<CopyHudState>(() => ({
  show: () => {
    invoke("show_copy_hud");
  },
}));

interface CopyHudViewProps {
  isMac: boolean;
}

export function CopyHudView({ isMac }: CopyHudViewProps) {
  const { t } = useTranslation();
  const rootClassName = `h-screen w-screen flex items-center justify-center overflow-hidden ${
    isMac ? "" : "bg-zinc-900 text-white"
  }`;
  const surfaceClassName = `flex flex-col items-center justify-center ${
    isMac ? "" : "h-full w-full"
  }`;

  return (
    <div data-testid="copy-hud-root" className={rootClassName}>
      <div data-testid="copy-hud-surface" className={surfaceClassName}>
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
