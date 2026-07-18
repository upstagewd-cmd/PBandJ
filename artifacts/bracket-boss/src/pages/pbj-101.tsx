import { useCallback, useEffect, useState, type ReactNode, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";

const FONTS_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap');`;

const T = {
  black: "#111111",
  white: "#FFFFFF",
  lime: "#B7E334",
  charcoal: "#2A2A2A",
  stone: "#E9E7E1",
};

const bodyColor = "rgba(233,231,225,0.72)";

function CourtShell({ children, viewBox = "0 0 200 300", maxHeight = 250 }: { children: ReactNode; viewBox?: string; maxHeight?: number }) {
  return (
    <svg viewBox={viewBox} style={{ width: "100%", height: "auto", maxHeight }}>
      <defs>
        <marker id="pbArrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={T.lime} />
        </marker>
      </defs>
      <rect x="14" y="12" width="172" height="276" rx="6" fill={T.charcoal} stroke={T.stone} strokeOpacity="0.35" strokeWidth="2" />
      <rect x="14" y="103" width="172" height="47" fill={T.lime} opacity="0.09" />
      <rect x="14" y="150" width="172" height="47" fill={T.lime} opacity="0.09" />
      <line x1="14" y1="103" x2="186" y2="103" stroke={T.lime} strokeWidth="1.2" strokeDasharray="4 3" opacity="0.55" />
      <line x1="14" y1="197" x2="186" y2="197" stroke={T.lime} strokeWidth="1.2" strokeDasharray="4 3" opacity="0.55" />
      <line x1="14" y1="150" x2="186" y2="150" stroke={T.white} strokeWidth="2.5" />
      <line x1="100" y1="12" x2="100" y2="103" stroke={T.stone} strokeWidth="1" opacity="0.4" />
      <line x1="100" y1="197" x2="100" y2="288" stroke={T.stone} strokeWidth="1" opacity="0.4" />
      {children}
    </svg>
  );
}

function Dot({
  x,
  y,
  r = 6,
  fill = T.white,
  label,
  labelColor = T.black,
}: {
  x: number;
  y: number;
  r?: number;
  fill?: string;
  label?: string;
  labelColor?: string;
}) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={fill} />
      {label && (
        <text x={x} y={y + 3} textAnchor="middle" fontSize="8" fontWeight="700" fill={labelColor} fontFamily="'JetBrains Mono', monospace">
          {label}
        </text>
      )}
    </g>
  );
}

function Legend({ items }: { items: Array<{ mark: string; text: string }> }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <div key={`${item.mark}-${item.text}`} className="flex items-center gap-1.5">
          <span
            className="flex shrink-0 items-center justify-center rounded-full"
            style={{ width: 14, height: 14, background: T.lime, color: T.black, fontSize: 8, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}
          >
            {item.mark}
          </span>
          <span className="text-[11px]" style={{ color: bodyColor }}>{item.text}</span>
        </div>
      ))}
    </div>
  );
}

function IntroVisual() {
  return (
    <CourtShell>
      <Dot x={143} y={265} r={7} fill={T.white} />
      <Dot x={57} y={35} r={7} fill={T.white} />
      <Dot x={57} y={265} r={7} fill={T.white} />
      <Dot x={143} y={35} r={7} fill={T.white} />
      <circle cx={100} cy={150} r={4} fill={T.lime} />
    </CourtShell>
  );
}

function ServeVisual() {
  return (
    <>
      <CourtShell>
        <Dot x={143} y={265} r={7} fill={T.lime} label="S" labelColor={T.black} />
        <path d="M143,262 Q95,150 57,42" fill="none" stroke={T.lime} strokeWidth="2" strokeDasharray="5 4" markerEnd="url(#pbArrow)" />
        <Dot x={57} y={35} r={6} fill={T.white} />
      </CourtShell>
      <Legend items={[{ mark: "S", text: "server, right side" }, { mark: "→", text: "serve travels diagonally, cross-court" }]} />
    </>
  );
}

function TwoBounceVisual() {
  return (
    <>
      <CourtShell>
        <Dot x={143} y={265} r={6} fill={T.white} />
        <path d="M143,260 Q95,150 60,45" fill="none" stroke={T.lime} strokeWidth="1.6" strokeDasharray="4 3" markerEnd="url(#pbArrow)" opacity="0.85" />
        <Dot x={60} y={40} r={9} fill={T.lime} label="1" />
        <path d="M62,45 Q95,150 140,258" fill="none" stroke={T.white} strokeWidth="1.6" strokeDasharray="4 3" markerEnd="url(#pbArrow)" opacity="0.65" />
        <Dot x={140} y={262} r={9} fill={T.white} label="2" labelColor={T.black} />
      </CourtShell>
      <Legend items={[{ mark: "1", text: "serve's bounce, receiver's side" }, { mark: "2", text: "return's bounce, server's side — then anyone can volley" }]} />
    </>
  );
}

function FaultsVisual() {
  return (
    <>
      <CourtShell>
        <Dot x={100} y={100} r={9} fill={T.charcoal} />
        <text x="100" y="103" textAnchor="middle" fontSize="9" fontWeight="700" fill={T.lime} fontFamily="'JetBrains Mono', monospace">1</text>
        <circle cx="100" cy="100" r="9" fill="none" stroke={T.lime} strokeWidth="1.4" />
        <Dot x={193} y={70} r={9} fill={T.charcoal} />
        <text x="193" y="73" textAnchor="middle" fontSize="9" fontWeight="700" fill={T.lime} fontFamily="'JetBrains Mono', monospace">2</text>
        <circle cx="193" cy="70" r="9" fill="none" stroke={T.lime} strokeWidth="1.4" />
        <Dot x={100} y={150} r={9} fill={T.charcoal} />
        <text x="100" y="153" textAnchor="middle" fontSize="9" fontWeight="700" fill={T.lime} fontFamily="'JetBrains Mono', monospace">3</text>
        <circle cx="100" cy="150" r="9" fill="none" stroke={T.lime} strokeWidth="1.4" />
        <Dot x={65} y={235} r={9} fill={T.charcoal} />
        <text x="65" y="238" textAnchor="middle" fontSize="9" fontWeight="700" fill={T.lime} fontFamily="'JetBrains Mono', monospace">4</text>
        <circle cx="65" cy="235" r="9" fill="none" stroke={T.lime} strokeWidth="1.4" />
      </CourtShell>
      <Legend
        items={[
          { mark: "1", text: "short of / on the kitchen line" },
          { mark: "2", text: "outside the sideline or baseline" },
          { mark: "3", text: "hits net, drops on own side" },
          { mark: "4", text: "bounces twice before it's returned" },
        ]}
      />
    </>
  );
}

function KitchenVisual() {
  return (
    <>
      <CourtShell>
        <rect x="14" y="103" width="172" height="47" fill={T.lime} opacity="0.22" />
        <rect x="14" y="150" width="172" height="47" fill={T.lime} opacity="0.22" />
        <g transform="translate(100,126)">
          <circle r="11" fill="none" stroke={T.white} strokeWidth="2" />
          <line x1="-8" y1="8" x2="8" y2="-8" stroke={T.white} strokeWidth="2" />
        </g>
        <g transform="translate(100,174)">
          <circle r="11" fill="none" stroke={T.white} strokeWidth="2" />
          <line x1="-8" y1="8" x2="8" y2="-8" stroke={T.white} strokeWidth="2" />
        </g>
      </CourtShell>
      <Legend items={[{ mark: "⌀", text: "no volleys anywhere in the shaded zone, line included" }]} />
    </>
  );
}

function ScoreRightsVisual() {
  return (
    <>
      <CourtShell>
        <Dot x={143} y={265} r={7} fill={T.lime} label="1" labelColor={T.black} />
        <Dot x={57} y={265} r={7} fill="none" />
        <circle cx={57} cy={265} r={7} fill="none" stroke={T.stone} strokeWidth="1.4" strokeDasharray="2 2" />
        <path d="M133,255 Q100,225 67,255" fill="none" stroke={T.lime} strokeWidth="1.6" strokeDasharray="4 3" markerEnd="url(#pbArrow)" />
      </CourtShell>
      <Legend items={[{ mark: "1", text: "win the rally on your serve → swap sides with your partner, serve again" }]} />
    </>
  );
}

function ScoreCallVisual() {
  const tiles = ["3", "3", "1"];
  const labels = ["serving team", "receiving team", "server position"];

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="flex items-center gap-2">
        {tiles.map((tile, index) => (
          <div key={`${tile}-${index}`} className="flex items-center gap-2">
            <div
              className="flex items-center justify-center rounded-md"
              style={{ width: 46, height: 58, background: T.black, border: `1px solid ${T.lime}`, color: T.lime, fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700 }}
            >
              {tile}
            </div>
            {index < tiles.length - 1 && <span style={{ color: bodyColor }}>-</span>}
          </div>
        ))}
      </div>
      <div className="flex gap-4">
        {labels.map((label) => (
          <span key={label} className="text-[10px] uppercase tracking-wide" style={{ color: bodyColor, fontFamily: "'JetBrains Mono', monospace" }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function WinByTwoVisual() {
  const steps = [
    { s: "10–10", tag: "tied" },
    { s: "11–10", tag: "not over" },
    { s: "12–10", tag: "game" },
  ];

  return (
    <div className="flex items-center justify-center gap-2 py-4">
      {steps.map((step, index) => (
        <div key={step.s} className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className="flex items-center justify-center rounded-md px-2"
              style={{
                height: 44,
                minWidth: 62,
                background: T.black,
                border: `1px solid ${index === 2 ? T.lime : "rgba(233,231,225,0.25)"}`,
                color: index === 2 ? T.lime : T.white,
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              {step.s}
            </div>
            <span className="text-[9px] uppercase tracking-wide" style={{ color: index === 2 ? T.lime : bodyColor, fontFamily: "'JetBrains Mono', monospace" }}>
              {step.tag}
            </span>
          </div>
          {index < steps.length - 1 && <ChevronRight size={16} color={T.stone} style={{ opacity: 0.5, marginTop: -14 }} />}
        </div>
      ))}
    </div>
  );
}

function ServingDetailsVisual() {
  return (
    <>
      <CourtShell>
        <line x1="14" y1="288" x2="186" y2="288" stroke={T.white} strokeWidth="3" strokeDasharray="2 3" opacity="0.7" />
        <Dot x={143} y={265} r={7} fill={T.lime} />
        <path d="M143,260 Q95,120 57,42" fill="none" stroke={T.lime} strokeWidth="2" strokeDasharray="5 4" markerEnd="url(#pbArrow)" />
        <path d="M120,108 Q130,95 145,90" fill="none" stroke={T.white} strokeWidth="1.2" markerEnd="url(#pbArrow)" opacity="0.8" />
      </CourtShell>
      <Legend items={[{ mark: "•", text: "feet stay fully behind this line until contact" }, { mark: "↗", text: "serve must clear the kitchen line completely" }]} />
    </>
  );
}

function DoublesSinglesVisual() {
  const Mini = ({ label, players }: { label: string; players: Array<[number, number]> }) => (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <svg viewBox="0 0 120 180" style={{ width: "100%", height: "auto", maxHeight: 170 }}>
        <rect x="8" y="8" width="104" height="164" rx="4" fill={T.charcoal} stroke={T.stone} strokeOpacity="0.35" strokeWidth="1.5" />
        <rect x="8" y="62" width="104" height="28" fill={T.lime} opacity="0.09" />
        <rect x="8" y="90" width="104" height="28" fill={T.lime} opacity="0.09" />
        <line x1="8" y1="90" x2="112" y2="90" stroke={T.white} strokeWidth="2" />
        <line x1="60" y1="8" x2="60" y2="62" stroke={T.stone} strokeWidth="0.8" opacity="0.4" />
        <line x1="60" y1="118" x2="60" y2="172" stroke={T.stone} strokeWidth="0.8" opacity="0.4" />
        {players.map(([x, y], index) => (
          <circle key={`${label}-${index}`} cx={x} cy={y} r="5" fill={T.white} />
        ))}
      </svg>
      <span className="text-[10px] uppercase tracking-wide" style={{ color: T.lime, fontFamily: "'JetBrains Mono', monospace" }}>{label}</span>
    </div>
  );

  return (
    <div className="flex items-start justify-center gap-2.5">
      <Mini label="Doubles" players={[[35, 145], [85, 145], [35, 35], [85, 35]]} />
      <Mini label="Singles" players={[[85, 145], [35, 35]]} />
    </div>
  );
}

function RecapVisual() {
  return (
    <CourtShell maxHeight={220}>
      <Dot x={143} y={265} r={6} fill={T.lime} />
      <path d="M143,260 Q95,150 57,42" fill="none" stroke={T.lime} strokeWidth="1.6" strokeDasharray="4 3" markerEnd="url(#pbArrow)" opacity="0.7" />
      <rect x="14" y="103" width="172" height="47" fill={T.lime} opacity="0.09" />
      <rect x="14" y="150" width="172" height="47" fill={T.lime} opacity="0.09" />
    </CourtShell>
  );
}

type Slide = {
  kind?: "intro" | "recap";
  eyebrow?: string;
  title: string;
  body?: string;
  footnote?: string;
  number?: string;
  tag?: string;
  list?: string[];
  recap?: string[];
  visual: ReactNode;
};

const SLIDES: Slide[] = [
  {
    kind: "intro",
    eyebrow: "The rules, in order",
    title: "How a point actually gets played",
    body: "Seven core rules govern every rally, from the first serve to game point. This walkthrough covers only the rules of play — swipe or use the arrows to move through them in order.",
    visual: <IntroVisual />,
  },
  {
    number: "01",
    tag: "Serve",
    title: "Every rally opens with a serve",
    body: "The player standing on the right side serves diagonally to the opposite service box. It can be struck after a bounce or out of the air — but an air serve must be an underhand swing, contact below the waist, with the paddle moving upward through the ball.",
    footnote: "Miss any of those three conditions and it's a fault before the rally even starts.",
    visual: <ServeVisual />,
  },
  {
    number: "02",
    tag: "Two-bounce rule",
    title: "The ball has to bounce once per side first",
    body: "After the serve, the return must also bounce before anyone volleys it. That's two bounces total — one on each side — before either team is allowed to hit the ball out of the air.",
    footnote: "This is what keeps the serving team from crashing the net for a free advantage right after serving.",
    visual: <TwoBounceVisual />,
  },
  {
    number: "03",
    tag: "Faults",
    title: "Four ways a rally ends early",
    list: [
      "The serve lands outside the service box or fails to clear the kitchen",
      "The ball lands outside the sideline or baseline",
      "The ball hits the net and drops on the hitter's own side",
      "The ball bounces twice on one side before it's returned",
    ],
    footnote: "Any one of these hands the rally — and possibly the serve — to the other side.",
    visual: <FaultsVisual />,
  },
  {
    number: "04",
    tag: "The kitchen",
    title: "No volleys inside the non-volley zone",
    body: "The 7-foot strip on each side of the net is off-limits for volleys — including standing on its line, and including drifting in on momentum right after one. Once the ball has bounced inside it, though, it's fair game to step in and play it.",
    footnote: "Everything else about court positioning follows from this one restriction.",
    visual: <KitchenVisual />,
  },
  {
    number: "05",
    tag: "Scoring rights",
    title: "Only the serving side can score",
    body: "Win a rally on your serve and you score a point, then swap sides with your partner and serve again. Lose a rally on your serve and the serve passes — first to your partner, then, once both of you have lost a serve, over to the opponents entirely.",
    footnote: "A rally lost on the return side never costs — or earns — a point.",
    visual: <ScoreRightsVisual />,
  },
  {
    number: "06",
    tag: "Calling score",
    title: "Score gets called out before every serve",
    body: "Three numbers, always in this order: the serving team's score, the receiving team's score, then which server is up — first (1) or second (2). At the very start of a game, the opening server calls out position 2, since that side only gets one serve to open.",
    footnote: "Everyone on the court should be able to say the score back from memory.",
    visual: <ScoreCallVisual />,
  },
  {
    number: "07",
    tag: "Winning the game",
    title: "First to 11 — but only by two",
    body: "A game ends at 11 points, provided the leading side is ahead by at least two. Tied at 10–10, play continues past 11 until someone opens up that two-point gap, however long that takes.",
    footnote: "Final scores like 13–11 or 17–15 are normal, not exceptions.",
    visual: <WinByTwoVisual />,
  },
  {
    number: "08",
    tag: "Serving details",
    title: "Where servers can stand — and what breaks the serve",
    list: [
      "Feet must stay fully behind the baseline, not touching it, until contact",
      "The serve must clear the kitchen line completely — landing on that line is a fault",
      "Spin can't be added to the ball before contact",
      "Serving out of turn, or from the wrong side, is also a fault",
    ],
    footnote: "The serving team also has to stay back until the third shot, or risk breaking the two-bounce rule.",
    visual: <ServingDetailsVisual />,
  },
  {
    number: "09",
    tag: "Doubles vs. singles",
    title: "Singles keeps every rule but one",
    body: "Every rule above applies to singles too — the one change is how serving side is decided. Serving from an even score (0, 2, 4…) means serving from the right; an odd score (1, 3, 5…) means serving from the left. There's no second server: lose the rally, and the serve passes straight to your opponent.",
    footnote: "Doubles is the default everywhere else in this guide.",
    visual: <DoublesSinglesVisual />,
  },
  {
    kind: "recap",
    eyebrow: "Recap",
    title: "The seven rules, back to back",
    recap: [
      "Serve underhand, diagonally, to start the rally",
      "One bounce per side before anyone can volley",
      "Four fault types end a rally on the spot",
      "No volleys inside the kitchen — ever",
      "Only the serving side scores points",
      "Call the full score before every serve",
      "Win by two, starting from 11",
    ],
    visual: <RecapVisual />,
  },
];

export default function Pbj101Page() {
  const [, setLocation] = useLocation();
  const [index, setIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const total = SLIDES.length;

  const goTo = useCallback((nextIndex: number) => {
    setIndex(((nextIndex % total) + total) % total);
  }, [total]);

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") prev();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    setTouchStartX(event.touches[0]?.clientX ?? null);
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX === null) return;

    const dx = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;

    if (dx > 50) prev();
    if (dx < -50) next();

    setTouchStartX(null);
  };

  const slide = SLIDES[index];
  const progress = ((index + 1) / total) * 100;

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    setLocation("/");
  };

  return (
    <div
      className="flex min-h-[100dvh] w-full items-center justify-center px-4 py-24"
      style={{
        fontFamily: "'Inter', sans-serif",
        background: `radial-gradient(circle at 20% 0%, #1c1c1c 0%, ${T.black} 55%)`,
      }}
    >
      <style>{`
        ${FONTS_IMPORT}
        .pb-display { font-family: 'Oswald', sans-serif; letter-spacing: 0.01em; }
        .pb-mono { font-family: 'JetBrains Mono', monospace; }
        .pb-card-enter { animation: pbFade 0.32s ease; }
        @keyframes pbFade { from { opacity: 0; transform: translateY(6px);} to { opacity: 1; transform: translateY(0);} }
        .pb-dot { transition: all 0.25s ease; }
        .pb-arrow-btn { transition: transform 0.15s ease; }
        .pb-arrow-btn:hover { transform: translateY(-1px); }
        .pb-arrow-btn:active { transform: scale(0.96); }
        @media (prefers-reduced-motion: reduce) {
          .pb-card-enter { animation: none; }
          .pb-arrow-btn:hover { transform: none; }
        }
      `}</style>

      <div
        className="relative mx-auto flex w-full flex-col overflow-hidden rounded-[28px]"
        style={{
          maxWidth: 402,
          minHeight: 760,
          background: T.charcoal,
          border: "1px solid rgba(233,231,225,0.12)",
          boxShadow: "0 30px 60px -25px rgba(0,0,0,0.7)",
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div style={{ height: 3, background: `linear-gradient(90deg, transparent, ${T.lime}, transparent)` }} />

        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 rounded-full bg-white/6 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/10"
          >
            <ChevronLeft size={14} color={T.white} />
            Back
          </button>
        </div>

        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <span className="pb-mono text-[11px] tracking-widest" style={{ color: bodyColor }}>
            RULE {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </span>
          <span
            className="pb-display rounded-full px-2.5 py-1 text-[11px] uppercase"
            style={{ color: T.black, background: T.lime, fontWeight: 600, letterSpacing: "0.08em" }}
          >
            Pickleball Rules
          </span>
        </div>

        <div className="px-5">
          <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div className="h-full rounded-full" style={{ width: `${progress}%`, background: T.lime, transition: "width 0.35s ease" }} />
          </div>
        </div>

        <div key={index} className="pb-card-enter flex-1 overflow-y-auto px-5 pb-3 pt-5">
          {slide.kind === "intro" && (
            <div className="flex flex-col gap-4">
              <div className="mx-auto w-40">{slide.visual}</div>
              <div className="flex flex-col gap-2.5 text-center">
                <span className="pb-mono text-xs uppercase tracking-widest" style={{ color: T.lime }}>{slide.eyebrow}</span>
                <h1 className="pb-display text-[26px] leading-tight" style={{ color: T.white, fontWeight: 600 }}>{slide.title}</h1>
                <p className="text-[14px] leading-relaxed" style={{ color: bodyColor }}>{slide.body}</p>
              </div>
            </div>
          )}

          {slide.kind === "recap" && (
            <div className="flex flex-col gap-4">
              <div className="mx-auto w-36">{slide.visual}</div>
              <div className="flex flex-col gap-2.5">
                <span className="pb-mono text-center text-xs uppercase tracking-widest" style={{ color: T.lime }}>{slide.eyebrow}</span>
                <h1 className="pb-display text-center text-2xl leading-tight" style={{ color: T.white, fontWeight: 600 }}>{slide.title}</h1>
                <ol className="mt-1 flex flex-col gap-2">
                  {slide.recap?.map((item, recapIndex) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="pb-mono mt-0.5 w-4 shrink-0 text-xs" style={{ color: T.lime }}>{recapIndex + 1}</span>
                      <span className="text-[13.5px] leading-relaxed" style={{ color: T.stone }}>{item}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {!slide.kind && (
            <div className="flex flex-col gap-3.5">
              <div className="mx-auto w-44">{slide.visual}</div>

              <div className="flex flex-col gap-3.5">
                <div className="flex items-center justify-between">
                  <span className="pb-mono text-[11px] uppercase tracking-widest" style={{ color: T.lime }}>{slide.tag}</span>
                  <span className="pb-display text-2xl leading-none" style={{ color: "rgba(255,255,255,0.18)", fontWeight: 700 }}>{slide.number}</span>
                </div>

                <h2 className="pb-display text-[22px] leading-snug" style={{ color: T.white, fontWeight: 600 }}>{slide.title}</h2>

                {slide.body && <p className="text-[14px] leading-relaxed" style={{ color: bodyColor }}>{slide.body}</p>}

                {slide.list && (
                  <ul className="mt-1 flex flex-col gap-2">
                    {slide.list.map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <span className="shrink-0 rounded-full" style={{ width: 5, height: 5, marginTop: 8, background: T.lime }} />
                        <span className="text-[13.5px] leading-relaxed" style={{ color: T.stone }}>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {slide.footnote && (
                  <p className="mt-1 border-t pt-2 text-[12.5px] leading-relaxed" style={{ color: T.lime, borderTop: "1px dashed rgba(183,227,52,0.3)" }}>
                    {slide.footnote}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between px-5 pb-6 pt-3">
          <button
            onClick={prev}
            aria-label="Previous rule"
            className="pb-arrow-btn flex items-center justify-center rounded-full"
            style={{ width: 44, height: 44, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(233,231,225,0.16)" }}
          >
            <ChevronLeft size={20} color={T.white} />
          </button>

          <div className="flex items-center gap-1.5">
            {SLIDES.map((_, dotIndex) => (
              <button
                key={dotIndex}
                aria-label={`Go to slide ${dotIndex + 1}`}
                onClick={() => goTo(dotIndex)}
                className="pb-dot rounded-full"
                style={{ width: dotIndex === index ? 18 : 6, height: 6, background: dotIndex === index ? T.lime : "rgba(233,231,225,0.25)" }}
              />
            ))}
          </div>

          <button
            onClick={next}
            aria-label="Next rule"
            className="pb-arrow-btn flex items-center justify-center rounded-full"
            style={{ width: 44, height: 44, background: T.lime, border: "1px solid rgba(233,231,225,0.16)" }}
          >
            <ChevronRight size={20} color={T.black} />
          </button>
        </div>
      </div>
    </div>
  );
}