import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import recopyLogo from "../assets/recopy-logo.png";

// "Copy Echo" easter egg, built on the brand mark's offset copy.
// A click streak resets after RESET_DELAY of inactivity:
//   every click → the tile presses in and an echo peels off behind it
//   3–4         → echoes pile up behind the tile like clipboard history
//   5           → the pile snaps back in ("paste") with a ring and a pun
//   7           → the title flips Recopy → Copy → Paste → Recopy
//   10          → finale: echoes fan out like a hand of cards, square back up,
//                 and a light sweeps across the tile
// Everything animates transform/opacity only; reduced motion collapses it.
const RESET_DELAY = 3000;
const PEEL_LIFETIME = 650;
const MAX_PEELS = 6;
const MAX_STACK = 3;
const PASTE_AT = 5;
const FLIP_AT = 7;
const FINALE_AT = 10;
const FORTUNE_DURATION = 2500;
const FLIP_DURATION = 1800;
const FINALE_DURATION = 2400;
const FINALE_ECHOES = 8;
const FORTUNE_COUNT = 6;

const PRESS_KEYFRAMES: Keyframe[] = [
  { transform: "scale(1)" },
  { transform: "scale(0.86)", offset: 0.35 },
  { transform: "scale(1)" },
];

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function BrandLogo() {
  const { t } = useTranslation();
  const [peels, setPeels] = useState<number[]>([]);
  const [stack, setStack] = useState(0);
  const [pasteKey, setPasteKey] = useState(0);
  const [fortune, setFortune] = useState<string | null>(null);
  const [flipKey, setFlipKey] = useState(0);
  const [finale, setFinale] = useState(false);
  const clicks = useRef(0);
  const nextPeelId = useRef(0);
  const tileRef = useRef<HTMLImageElement>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const schedule = useCallback((name: string, delay: number, run: () => void) => {
    clearTimeout(timers.current.get(name));
    timers.current.set(
      name,
      setTimeout(() => {
        timers.current.delete(name);
        run();
      }, delay),
    );
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const endStreak = useCallback(() => {
    clicks.current = 0;
    setStack(0);
  }, []);

  const handleClick = useCallback(() => {
    if (finale) return;
    const count = ++clicks.current;
    schedule("streak", RESET_DELAY, endStreak);

    // Press the tile (WAAPI, so it restarts cleanly mid-animation). The finale
    // drives the tile with its own CSS animation instead.
    if (count !== FINALE_AT && !prefersReducedMotion()) {
      tileRef.current?.animate?.(PRESS_KEYFRAMES, {
        duration: count === PASTE_AT ? 360 : 260,
        easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      });
    }

    if (count === FINALE_AT) {
      setStack(0);
      setPeels([]);
      setFortune(null);
      setFlipKey(0); // a fast streak can still be mid-flip; the finale owns the title
      setFinale(true);
      schedule("finale", FINALE_DURATION, () => {
        setFinale(false);
        endStreak();
      });
      return;
    }

    if (count === PASTE_AT) {
      setStack(0);
      setPasteKey((key) => key + 1);
      const idx = Math.floor(Math.random() * FORTUNE_COUNT) + 1;
      setFortune(t(`easter.fortune${idx}`));
      schedule("fortune", FORTUNE_DURATION, () => setFortune(null));
    } else if (count >= 3 && count < PASTE_AT) {
      setStack(Math.min(count - 2, MAX_STACK));
    }

    if (count === FLIP_AT) {
      setFlipKey((key) => key + 1);
      schedule("flip", FLIP_DURATION, () => setFlipKey(0));
    }

    const id = nextPeelId.current++;
    setPeels((current) => [...current.slice(-(MAX_PEELS - 1)), id]);
    schedule(`peel-${id}`, PEEL_LIFETIME, () =>
      setPeels((current) => current.filter((peel) => peel !== id)),
    );
  }, [finale, schedule, endStreak, t]);

  return (
    <span
      className="relative inline-flex items-center select-none cursor-pointer rounded-md px-1 -mx-1 overflow-visible"
      onClick={handleClick}
    >
      <span className="relative z-10 inline-flex items-center gap-1.5 text-base font-bold tracking-tight text-chrome-strong">
        <span className="relative block size-6 shrink-0">
          {/* History pile: offset copies, like the mark's own back copy */}
          {Array.from({ length: MAX_STACK }, (_, i) => (
            <img
              key={`stack-${i}`}
              src={recopyLogo}
              alt=""
              draggable={false}
              className="echo-stack absolute inset-0 size-6"
              style={{
                opacity: i < stack ? 0.42 - i * 0.12 : 0,
                transform: i < stack ? `translate(${-(i + 1) * 3}px, ${-(i + 1) * 3}px)` : "none",
              }}
            />
          ))}

          {peels.map((id) => (
            <img
              key={id}
              src={recopyLogo}
              alt=""
              draggable={false}
              className="echo-peel absolute inset-0 size-6 pointer-events-none"
            />
          ))}

          {finale &&
            Array.from({ length: FINALE_ECHOES }, (_, i) => (
              <img
                key={`fan-${i}`}
                src={recopyLogo}
                alt=""
                draggable={false}
                className="echo-fan absolute inset-0 size-6 pointer-events-none"
                style={
                  {
                    "--fan-angle": `${(i - (FINALE_ECHOES - 1) / 2) * 13}deg`,
                    "--fan-opacity": 0.25 + (i % 4) * 0.12,
                    animationDelay: `${i * 22}ms`,
                  } as React.CSSProperties
                }
              />
            ))}

          <img
            ref={tileRef}
            src={recopyLogo}
            alt=""
            width={24}
            height={24}
            draggable={false}
            className={`relative z-10 block size-6 ${finale ? "echo-finale-core" : ""}`}
          />

          {pasteKey > 0 && (
            <span
              key={pasteKey}
              className="echo-ring absolute inset-0 z-0 rounded-[7px] border-2 border-sky-400/70 pointer-events-none"
            />
          )}

          {finale && (
            <span
              className="echo-shine-mask absolute inset-0 z-20 overflow-hidden pointer-events-none"
              style={{
                WebkitMaskImage: `url(${recopyLogo})`,
                maskImage: `url(${recopyLogo})`,
                WebkitMaskSize: "100% 100%",
                maskSize: "100% 100%",
              }}
            >
              <span className="echo-shine absolute inset-y-0 -left-full w-full" />
            </span>
          )}
        </span>

        {/* Title: a one-word reel so the flip never changes the layout width */}
        <span className="relative z-10 inline-grid h-6 overflow-hidden leading-6">
          <span key={flipKey} className={flipKey ? "echo-reel" : undefined}>
            <span className={`block ${finale ? "echo-title-glow" : ""}`}>Recopy</span>
            {flipKey > 0 && (
              <>
                <span className="block">Copy</span>
                <span className="block">Paste</span>
                <span className="block">Recopy</span>
              </>
            )}
          </span>
        </span>
      </span>

      {fortune && (
        <span
          className="absolute left-0 top-full mt-1 whitespace-nowrap
            rounded-lg bg-card/80 backdrop-blur-sm border border-border/50
            px-2.5 py-1 text-xs text-foreground/90 pointer-events-none z-50"
          style={{ animation: `fortune-pop ${FORTUNE_DURATION}ms ease forwards` }}
        >
          {fortune}
        </span>
      )}
    </span>
  );
}
