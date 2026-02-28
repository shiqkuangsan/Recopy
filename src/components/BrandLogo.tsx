import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const RESET_DELAY = 3000;
const FORTUNE_DURATION = 2500;
const NEKO_DURATION = 8000;
const ULTIMATE_DURATION = 10000;
const FORTUNE_COUNT = 6;

// Mixed particles for ultimate mode — each has character, position, delay, and sway direction
const NEKO_PARTICLES = [
  { char: "♥", left: "0%", delay: "0s", sway: "3px" },
  { char: "✦", left: "20%", delay: "0.4s", sway: "-4px" },
  { char: "⋆", left: "40%", delay: "0.15s", sway: "5px" },
  { char: "🐾", left: "60%", delay: "0.7s", sway: "-3px" },
  { char: "♥", left: "80%", delay: "0.3s", sway: "4px" },
  { char: "✦", left: "95%", delay: "0.55s", sway: "-5px" },
];

export function BrandLogo() {
  const { t } = useTranslation();
  const [clickCount, setClickCount] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [fortune, setFortune] = useState<string | null>(null);
  const [nekoMode, setNekoMode] = useState(false);
  const [ultimateMode, setUltimateMode] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const fortuneTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const nekoTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const ultimateTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const resetAll = useCallback(() => {
    setClickCount(0);
    setNekoMode(false);
    setUltimateMode(false);
    setFortune(null);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    if (nekoTimer.current) clearTimeout(nekoTimer.current);
    if (ultimateTimer.current) clearTimeout(ultimateTimer.current);
    if (fortuneTimer.current) clearTimeout(fortuneTimer.current);
  }, []);

  const handleClick = useCallback(() => {
    // Layer 1: pulse on every click
    setPulse(true);
    requestAnimationFrame(() => {
      setTimeout(() => setPulse(false), 200);
    });

    // Reset idle timer
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setClickCount(0), RESET_DELAY);

    setClickCount((prev) => {
      const next = prev + 1;

      // Layer 3: random cat fortune at 5 clicks
      if (next === 5) {
        const idx = Math.floor(Math.random() * FORTUNE_COUNT) + 1;
        setFortune(t(`easter.fortune${idx}`));
        if (fortuneTimer.current) clearTimeout(fortuneTimer.current);
        fortuneTimer.current = setTimeout(() => setFortune(null), FORTUNE_DURATION);
      }

      // Layer 4: neko mode at 7 clicks
      if (next === 7) {
        setNekoMode(true);
        if (nekoTimer.current) clearTimeout(nekoTimer.current);
        nekoTimer.current = setTimeout(() => {
          setNekoMode(false);
          setClickCount(0);
          if (resetTimer.current) clearTimeout(resetTimer.current);
        }, NEKO_DURATION);
      }

      // Layer 5: ultimate mode at 10 clicks
      if (next === 10) {
        if (nekoTimer.current) clearTimeout(nekoTimer.current);
        if (resetTimer.current) clearTimeout(resetTimer.current);
        setUltimateMode(true);
        if (ultimateTimer.current) clearTimeout(ultimateTimer.current);
        ultimateTimer.current = setTimeout(resetAll, ULTIMATE_DURATION);
      }

      return next;
    });
  }, [t, resetAll]);

  // Layer 2: pink purr at 3+ clicks (but not during neko/ultimate)
  const isPurr = clickCount >= 3 && !nekoMode && !ultimateMode;

  // Determine text content
  let displayText = "Recopy";
  if (ultimateMode) {
    displayText = "ฅ(=^·ω·^=)ฅ";
  } else if (nekoMode) {
    displayText = "ฅ^•ﻌ•^ฅ";
  }

  // Text animation style
  let textStyle: React.CSSProperties | undefined;
  if (ultimateMode) {
    textStyle = { animation: "neko-float 2s ease-in-out infinite" };
  } else if (isPurr) {
    textStyle = { animation: "wiggle 0.3s ease-in-out infinite" };
  }

  // Color per layer: pink → purple → blue-purple gradient feel
  let textColorClass = "text-foreground/80";
  if (ultimateMode) {
    textColorClass = "text-violet-400";
  } else if (nekoMode) {
    textColorClass = "text-purple-400";
  } else if (isPurr) {
    textColorClass = "text-pink-400";
  }

  // Container aura style per layer
  let containerStyle: React.CSSProperties | undefined;
  if (ultimateMode) {
    containerStyle = { animation: "neko-aura 3s ease-in-out infinite", borderRadius: "8px" };
  } else if (nekoMode) {
    containerStyle = { animation: "purple-glow 2.5s ease-in-out infinite", borderRadius: "8px" };
  }

  return (
    <span
      className="relative select-none cursor-pointer rounded-md px-1 -mx-1"
      style={containerStyle}
      onClick={handleClick}
    >
      {/* Cat ears — ultimate mode only */}
      {ultimateMode && (
        <span
          className="absolute -top-2.5 left-1/2 -translate-x-1/2 pointer-events-none text-violet-400 text-[10px] font-bold"
          style={{ animation: "neko-ear-pop 0.5s ease-out forwards" }}
        >
          ∧ ∧
        </span>
      )}

      <span
        className={[
          "inline-block text-base font-bold tracking-tight transition-transform duration-200",
          pulse ? "scale-105" : "scale-100",
          textColorClass,
        ]
          .filter(Boolean)
          .join(" ")}
        style={textStyle}
      >
        {displayText}
      </span>

      {/* Mixed particles — ultimate mode */}
      {ultimateMode &&
        NEKO_PARTICLES.map((p, i) => (
          <span
            key={i}
            className="absolute top-0 pointer-events-none text-[10px]"
            style={{
              left: p.left,
              "--sway": p.sway,
              animation: `neko-particle-rise 1.6s ease-out ${p.delay} infinite`,
            } as React.CSSProperties}
          >
            {p.char}
          </span>
        ))}

      {/* Cat fortune bubble */}
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
