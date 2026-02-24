import { describe, it, expect, vi } from "vitest";
import type { KeyboardEvent, PointerEvent } from "react";
import { createPressActionHandlers } from "../press-action";

describe("createPressActionHandlers", () => {
  it("triggers action on primary mouse pointer down", () => {
    const action = vi.fn();
    const preventDefault = vi.fn();
    const handlers = createPressActionHandlers<HTMLButtonElement>(action);

    handlers.onPointerDown({
      isPrimary: true,
      pointerType: "mouse",
      button: 0,
      preventDefault,
    } as unknown as PointerEvent<HTMLButtonElement>);

    expect(action).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("ignores non-primary mouse pointer down", () => {
    const action = vi.fn();
    const handlers = createPressActionHandlers<HTMLButtonElement>(action);

    handlers.onPointerDown({
      isPrimary: true,
      pointerType: "mouse",
      button: 2,
      preventDefault: vi.fn(),
    } as unknown as PointerEvent<HTMLButtonElement>);

    expect(action).not.toHaveBeenCalled();
  });

  it("supports keyboard handler when enabled", () => {
    const action = vi.fn();
    const preventDefault = vi.fn();
    const handlers = createPressActionHandlers<HTMLDivElement>(action, {
      enableKeyboardHandler: true,
    });

    handlers.onKeyDown?.({
      key: "Enter",
      preventDefault,
    } as unknown as KeyboardEvent<HTMLDivElement>);

    expect(action).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});
