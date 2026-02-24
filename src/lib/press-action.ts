import type {
  KeyboardEventHandler,
  MouseEventHandler,
  PointerEventHandler,
} from "react";

interface PressActionOptions {
  preventDefaultOnPointerDown?: boolean;
  enableKeyboardHandler?: boolean;
}

interface PressActionHandlers<T extends HTMLElement> {
  onPointerDown: PointerEventHandler<T>;
  onClick: MouseEventHandler<T>;
  onKeyDown?: KeyboardEventHandler<T>;
}

interface PointerPressEventLike {
  isPrimary: boolean;
  pointerType: string;
  button: number;
}

function isPrimaryPointerPress(event: PointerPressEventLike): boolean {
  if (!event.isPrimary) return false;
  if (event.pointerType === "mouse") {
    return event.button === 0;
  }
  return true;
}

export function createPressActionHandlers<T extends HTMLElement>(
  action: () => void,
  options: PressActionOptions = {},
): PressActionHandlers<T> {
  const {
    preventDefaultOnPointerDown = true,
    enableKeyboardHandler = false,
  } = options;

  const handlers: PressActionHandlers<T> = {
    onPointerDown: (event) => {
      if (!isPrimaryPointerPress(event)) return;
      if (preventDefaultOnPointerDown) {
        event.preventDefault();
      }
      action();
    },
    onClick: (event) => {
      // Keyboard and assistive technology activation.
      if (event.detail === 0) {
        action();
      }
    },
  };

  if (enableKeyboardHandler) {
    handlers.onKeyDown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        action();
      }
    };
  }

  return handlers;
}
