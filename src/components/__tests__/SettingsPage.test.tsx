import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { SettingsPage } from "../SettingsPage";
import { useSettingsStore } from "../../stores/settings-store";

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: vi.fn(() => "macos"),
}));

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

const mockedInvoke = vi.mocked(invoke);

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      settings: {
        shortcut: "CommandOrControl+Shift+V",
        auto_start: "false",
        theme: "system",
        language: "system",
        retention_policy: "unlimited",
        retention_days: "0",
        retention_count: "0",
        max_item_size_mb: "10",
        close_on_blur: "true",
        update_check_interval: "weekly",
        panel_position: "bottom",
        flat_mode_tb: "false",
        panel_open_selection: "preserve",
        show_tray_icon: "true",
      },
      loaded: true,
    });
  });

  it("invokes quit_app from the About exit button", () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "About" }));
    fireEvent.click(screen.getByRole("button", { name: "Quit Recopy" }));

    expect(mockedInvoke).toHaveBeenCalledWith("quit_app");
  });
});
