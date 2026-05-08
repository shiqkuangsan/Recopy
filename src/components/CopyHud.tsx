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

  return (
    <div className="h-screen w-screen flex items-center justify-center overflow-hidden">
      <div
        data-testid="copy-hud-surface"
        className={`flex flex-col items-center justify-center ${
          isMac
            ? ""
            : "h-full w-full rounded-[28px] bg-zinc-950/90 text-white ring-1 ring-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_18px_44px_rgba(0,0,0,0.38)] backdrop-blur-xl"
        }`}
      >
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
