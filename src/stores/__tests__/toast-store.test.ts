import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useToastStore } from "../toast-store";

describe("useToastStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useToastStore.setState({
      message: "",
      visible: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should have correct initial state", () => {
    const state = useToastStore.getState();
    expect(state.message).toBe("");
    expect(state.visible).toBe(false);
  });

  describe("show", () => {
    it("should set message and visible to true", () => {
      useToastStore.getState().show("Item copied!");

      const state = useToastStore.getState();
      expect(state.message).toBe("Item copied!");
      expect(state.visible).toBe(true);
    });

    it("should auto-hide after 1500ms", () => {
      useToastStore.getState().show("Temporary message");

      expect(useToastStore.getState().visible).toBe(true);

      vi.advanceTimersByTime(1499);
      expect(useToastStore.getState().visible).toBe(true);

      vi.advanceTimersByTime(1);
      expect(useToastStore.getState().visible).toBe(false);
    });

    it("should allow second call to update message while first timer is pending", () => {
      useToastStore.getState().show("First");
      vi.advanceTimersByTime(1000);

      useToastStore.getState().show("Second");
      expect(useToastStore.getState().message).toBe("Second");
      expect(useToastStore.getState().visible).toBe(true);

      vi.advanceTimersByTime(500);
      expect(useToastStore.getState().visible).toBe(false);
    });

    it("should re-show after first timer hides", () => {
      useToastStore.getState().show("First");
      vi.advanceTimersByTime(1500);
      expect(useToastStore.getState().visible).toBe(false);

      useToastStore.getState().show("Second");
      expect(useToastStore.getState().visible).toBe(true);
      expect(useToastStore.getState().message).toBe("Second");

      vi.advanceTimersByTime(1500);
      expect(useToastStore.getState().visible).toBe(false);
    });

    it("should update message when called while already visible", () => {
      useToastStore.getState().show("First message");
      useToastStore.getState().show("Updated message");

      expect(useToastStore.getState().message).toBe("Updated message");
      expect(useToastStore.getState().visible).toBe(true);
    });

    it("should handle empty string message", () => {
      useToastStore.getState().show("");

      expect(useToastStore.getState().message).toBe("");
      expect(useToastStore.getState().visible).toBe(true);
    });
  });
});
