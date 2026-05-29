import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

interface CopyHudState {
  show: () => void;
}

export const useCopyHud = create<CopyHudState>(() => ({
  show: () => {
    invoke("show_copy_hud");
  },
}));
