import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

interface CopyHudState {
  visible: boolean;
  show: () => void;
}

export const useCopyHud = create<CopyHudState>((set) => ({
  visible: false,
  show: () => {
    set({ visible: true });
    setTimeout(() => {
      invoke("hide_window");
      set({ visible: false });
    }, 600);
  },
}));

export function CopyHud() {
  const { t } = useTranslation();
  const visible = useCopyHud((s) => s.visible);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="flex flex-col items-center justify-center w-28 h-28 rounded-2xl backdrop-blur-2xl bg-white/20 dark:bg-white/10 shadow-2xl border border-white/20 animate-in fade-in zoom-in-90 duration-150">
        <Check className="text-green-400" size={40} strokeWidth={2.5} />
        <span className="text-foreground text-sm font-medium mt-2">{t("context.copied")}</span>
      </div>
    </div>
  );
}
