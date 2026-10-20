import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrandLogo } from "../BrandLogo";

function clickTimes(target: HTMLElement, times: number) {
  for (let i = 0; i < times; i++) fireEvent.click(target);
}

function visibleStack(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(".echo-stack")].filter(
    (layer) => layer.style.opacity !== "0",
  ).length;
}

describe("BrandLogo Copy Echo easter egg", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("peels an echo per click and clears it after the animation", () => {
    const { container } = render(<BrandLogo />);
    const title = container.firstElementChild as HTMLElement;
    clickTimes(title, 2);
    expect(container.querySelectorAll(".echo-peel")).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(container.querySelectorAll(".echo-peel")).toHaveLength(0);
  });

  it("piles echoes on a streak, pastes them back at 5 and resets when idle", () => {
    const { container } = render(<BrandLogo />);
    const title = container.firstElementChild as HTMLElement;
    clickTimes(title, 4);
    expect(visibleStack(container)).toBe(2);

    fireEvent.click(title);
    expect(visibleStack(container)).toBe(0);
    expect(container.querySelector(".echo-ring")).not.toBeNull();
    expect(container.querySelector('[style*="fortune-pop"]')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(3100);
    });
    clickTimes(container.firstElementChild as HTMLElement, 3);
    expect(visibleStack(container)).toBe(1); // streak restarted from 1
  });

  it("flips the title reel at 7 without leaving extra words behind", () => {
    const { container } = render(<BrandLogo />);
    clickTimes(container.firstElementChild as HTMLElement, 7);
    expect(container.querySelector(".echo-reel")).not.toBeNull();
    expect(screen.getByText("Paste")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1900);
    });
    expect(screen.queryByText("Paste")).toBeNull();
    expect(screen.getAllByText("Recopy")).toHaveLength(1);
  });

  it("lets the finale take over the title even when the flip is still running", () => {
    const { container } = render(<BrandLogo />);
    clickTimes(container.firstElementChild as HTMLElement, 10); // all within the 1.8s flip
    expect(container.querySelector(".echo-reel")).toBeNull();
    expect(container.querySelector(".echo-title-glow")).not.toBeNull();
  });

  it("plays the finale at 10, ignores clicks meanwhile, then resets", () => {
    const { container } = render(<BrandLogo />);
    const title = container.firstElementChild as HTMLElement;
    clickTimes(title, 10);
    expect(container.querySelectorAll(".echo-fan")).toHaveLength(8);
    expect(container.querySelector(".echo-finale-core")).not.toBeNull();
    expect(container.querySelector(".echo-shine")).not.toBeNull();

    fireEvent.click(title);
    expect(container.querySelectorAll(".echo-peel")).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(container.querySelector(".echo-fan")).toBeNull();
    clickTimes(container.firstElementChild as HTMLElement, 3);
    expect(visibleStack(container)).toBe(1);
  });
});
