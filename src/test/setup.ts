import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Initialize i18n for tests
import "../i18n";

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve(null)),
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${path}`),
}));

// Mock @tauri-apps/api/event
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}));
