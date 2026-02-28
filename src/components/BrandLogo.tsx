import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const RESET_DELAY = 3000;
const FORTUNE_DURATION = 2500;
const NEKO_DURATION = 8000;
const ULTIMATE_DURATION = 10000;
const ASCENSION_DURATION = 13500;
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

// Celestial runes orbiting during ascension — each has angle, radius, and stagger delay
const ASCENSION_RUNES = [
  { char: "✶", angle: "-165deg", radius: "34px", delay: "0ms" },
  { char: "◌", angle: "-120deg", radius: "30px", delay: "120ms" },
  { char: "✦", angle: "-72deg", radius: "36px", delay: "220ms" },
  { char: "☽", angle: "-24deg", radius: "32px", delay: "80ms" },
  { char: "✶", angle: "18deg", radius: "37px", delay: "300ms" },
  { char: "◍", angle: "64deg", radius: "31px", delay: "180ms" },
  { char: "✧", angle: "112deg", radius: "35px", delay: "260ms" },
  { char: "☾", angle: "158deg", radius: "33px", delay: "140ms" },
];

export function BrandLogo() {
  const { t } = useTranslation();
  const [clickCount, setClickCount] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [fortune, setFortune] = useState<string | null>(null);
  const [nekoMode, setNekoMode] = useState(false);
  const [ultimateMode, setUltimateMode] = useState(false);
  const [ascensionMode, setAscensionMode] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const fortuneTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const nekoTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const ultimateTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const ascensionTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const resetAll = useCallback(() => {
    setClickCount(0);
    setNekoMode(false);
    setUltimateMode(false);
    setAscensionMode(false);
    setFortune(null);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    if (nekoTimer.current) clearTimeout(nekoTimer.current);
    if (ultimateTimer.current) clearTimeout(ultimateTimer.current);
    if (fortuneTimer.current) clearTimeout(fortuneTimer.current);
    if (ascensionTimer.current) clearTimeout(ascensionTimer.current);
  }, []);

  const handleClick = useCallback(() => {
    // Block clicks during ascension
    if (ascensionMode) return;

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

      // Layer 6: ascension at 20 clicks
      if (next === 20) {
        if (nekoTimer.current) clearTimeout(nekoTimer.current);
        if (ultimateTimer.current) clearTimeout(ultimateTimer.current);
        if (resetTimer.current) clearTimeout(resetTimer.current);
        if (fortuneTimer.current) clearTimeout(fortuneTimer.current);
        setFortune(null);
        setNekoMode(false);
        setUltimateMode(false);
        setAscensionMode(true);
        if (ascensionTimer.current) clearTimeout(ascensionTimer.current);
        ascensionTimer.current = setTimeout(resetAll, ASCENSION_DURATION);
      }

      return next;
    });
  }, [t, resetAll, ascensionMode]);

  // Layer 2: pink purr at 3+ clicks (but not during neko/ultimate/ascension)
  const isPurr = clickCount >= 3 && !nekoMode && !ultimateMode && !ascensionMode;

  // Determine text content
  let displayText = "Recopy";
  if (ascensionMode || ultimateMode) {
    displayText = "ฅ(=^·ω·^=)ฅ";
  } else if (nekoMode) {
    displayText = "ฅ^•ﻌ•^ฅ";
  }

  // Text animation style
  let textStyle: React.CSSProperties | undefined;
  if (ascensionMode) {
    textStyle = {
      animation: `neko-ascension-core ${ASCENSION_DURATION}ms cubic-bezier(0.22,1,0.36,1) forwards`,
      textShadow: "0 0 14px rgba(255,245,234,0.55), 0 0 28px rgba(167,139,250,0.35)",
    };
  } else if (ultimateMode) {
    textStyle = { animation: "neko-float 2s ease-in-out infinite" };
  } else if (isPurr) {
    textStyle = { animation: "wiggle 0.3s ease-in-out infinite" };
  }

  // Color per layer: pink → purple → violet → ivory
  let textColorClass = "text-foreground/80";
  if (ascensionMode) {
    textColorClass = "text-zinc-100";
  } else if (ultimateMode) {
    textColorClass = "text-violet-400";
  } else if (nekoMode) {
    textColorClass = "text-purple-400";
  } else if (isPurr) {
    textColorClass = "text-pink-400";
  }

  // Container aura style per layer
  let containerStyle: React.CSSProperties | undefined;
  if (ascensionMode) {
    containerStyle = {
      animation: `neko-ascension-shell ${ASCENSION_DURATION}ms cubic-bezier(0.22,1,0.36,1) forwards`,
      borderRadius: "10px",
    };
  } else if (ultimateMode) {
    containerStyle = { animation: "neko-aura 3s ease-in-out infinite", borderRadius: "8px" };
  } else if (nekoMode) {
    containerStyle = { animation: "purple-glow 2.5s ease-in-out infinite", borderRadius: "8px" };
  }

  return (
    <span
      className="relative select-none cursor-pointer rounded-md px-1 -mx-1 overflow-visible"
      style={containerStyle}
      onClick={handleClick}
    >
      {/* Cat ears — ultimate mode only (not during ascension) */}
      {ultimateMode && !ascensionMode && (
        <span
          className="absolute -top-2.5 left-1/2 -translate-x-1/2 pointer-events-none text-violet-400 text-[10px] font-bold"
          style={{ animation: "neko-ear-pop 0.5s ease-out forwards" }}
        >
          ∧ ∧
        </span>
      )}

      {/* Ascension: twin rotating rings */}
      {ascensionMode && (
        <>
          <span
            className="absolute left-1/2 top-1/2 rounded-full pointer-events-none"
            style={{
              width: "112px",
              height: "58px",
              border: "1px solid rgba(244,244,245,0.42)",
              boxShadow: "0 0 18px rgba(167,139,250,0.22)",
              zIndex: 2,
              animation: `neko-ascension-ring ${ASCENSION_DURATION}ms cubic-bezier(0.22,1,0.36,1) forwards`,
            }}
          />
          <span
            className="absolute left-1/2 top-1/2 rounded-full pointer-events-none"
            style={{
              width: "138px",
              height: "74px",
              border: "1px dashed rgba(196,181,253,0.35)",
              zIndex: 1,
              animation: `neko-ascension-ring-reverse ${ASCENSION_DURATION}ms linear forwards`,
            }}
          />
          {/* Shockwave flash */}
          <span
            className="absolute left-1/2 top-1/2 rounded-full pointer-events-none"
            style={{
              width: "132px",
              height: "64px",
              background: "radial-gradient(circle, rgba(255,244,214,0.65) 0%, rgba(255,244,214,0.08) 38%, rgba(255,244,214,0) 72%)",
              zIndex: 0,
              animation: `neko-ascension-shockwave ${ASCENSION_DURATION}ms ease-out forwards`,
            }}
          />
        </>
      )}

      <span
        className={[
          "relative z-10 inline-block text-base font-bold tracking-tight transition-transform duration-200",
          pulse && !ascensionMode ? "scale-105" : "scale-100",
          textColorClass,
        ]
          .filter(Boolean)
          .join(" ")}
        style={textStyle}
      >
        {displayText}
      </span>

      {/* Ascension: echo ghosts splitting left/right */}
      {ascensionMode && (
        <>
          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-bold text-zinc-100/55 pointer-events-none"
            style={{
              zIndex: 8,
              filter: "blur(0.4px)",
              animation: `neko-ascension-echo-left ${ASCENSION_DURATION}ms ease-in-out forwards`,
            }}
          >
            ฅ(=^·ω·^=)ฅ
          </span>
          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-bold text-zinc-100/50 pointer-events-none"
            style={{
              zIndex: 8,
              filter: "blur(0.4px)",
              animation: `neko-ascension-echo-right ${ASCENSION_DURATION}ms ease-in-out forwards`,
            }}
          >
            ฅ(=^·ω·^=)ฅ
          </span>
        </>
      )}

      {/* Ascension: orbiting celestial runes */}
      {ascensionMode &&
        ASCENSION_RUNES.map((r, i) => (
          <span
            key={`rune-${i}`}
            className="absolute left-1/2 top-1/2 pointer-events-none text-[9px] text-zinc-100/85"
            style={{
              "--r-angle": r.angle,
              "--r-radius": r.radius,
              zIndex: 18,
              animation: `neko-ascension-rune ${ASCENSION_DURATION}ms linear ${r.delay} forwards`,
            } as React.CSSProperties}
          >
            {r.char}
          </span>
        ))}

      {/* Mixed particles — ultimate mode (not during ascension) */}
      {ultimateMode &&
        !ascensionMode &&
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
      {fortune && !ascensionMode && (
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
