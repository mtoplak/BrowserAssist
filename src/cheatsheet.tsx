import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

type CheatCard = {
  title: string;
  visual: string;
  preview:
    | "point-left"
    | "point-right"
    | "point-up"
    | "point-down"
    | "pinch-out"
    | "pinch-in"
    | "point-dwell"
    | "open-palm";
  effect: string;
  details: string;
};

const GESTURE_CARDS: CheatCard[] = [
  {
    title: "Point Left",
    visual: "Index finger pointing left, hold steady",
    preview: "point-left",
    effect: "Browser Back",
    details: "Point your index finger to the left and hold for 2 seconds to go back.",
  },
  {
    title: "Point Right",
    visual: "Index finger pointing right, hold steady",
    preview: "point-right",
    effect: "Browser Forward",
    details: "Point your index finger to the right and hold for 2 seconds to go forward.",
  },
  {
    title: "Point Up",
    visual: "Index finger extended upward, hold steady",
    preview: "point-up",
    effect: "Scroll Up",
    details:
      "Hold your index finger pointing up for 3 seconds to scroll the page up.",
  },
  {
    title: "Point Down",
    visual: "Index finger extended downward, hold steady",
    preview: "point-down",
    effect: "Scroll Down",
    details:
      "Hold your index finger pointing down for 3 seconds to scroll the page down.",
  },
  {
    title: "Pinch Out",
    visual: "Thumb and index finger separate",
    preview: "pinch-out",
    effect: "Zoom In",
    details: "Increase page zoom in small steps.",
  },
  {
    title: "Pinch In",
    visual: "Thumb and index finger come together",
    preview: "pinch-in",
    effect: "Zoom Out",
    details: "Decrease page zoom in small steps.",
  },
  {
    title: "Point + Dwell",
    visual: "Index finger extended, hold over target",
    preview: "point-dwell",
    effect: "Hover and Click",
    details:
      "Move pointer with your finger. Holding steady triggers a dwell click.",
  },
  {
    title: "Open Palm",
    visual: "All fingers open, hold steady toward camera",
    preview: "open-palm",
    effect: "Zoom Out",
    details: "Hold an open palm steady briefly to zoom out the page.",
  },
];

/* ── Hand pose SVG illustrations ── */

type HandPose =
  | "point"
  | "point-down"
  | "flat"
  | "pinch"
  | "palm"
  | "emoji-up"
  | "emoji-down"
  | "emoji-pinch"
  | "emoji-left"
  | "emoji-right"
  | "emoji-dwell";

const HandIllustration: React.FC<{ pose: HandPose }> = ({ pose }) => {
  if (pose === "emoji-up") return <span className="preview-emoji">👆</span>;
  if (pose === "emoji-down") return <span className="preview-emoji">👇</span>;
  if (pose === "emoji-pinch") return <span className="preview-emoji">👌</span>;
  if (pose === "emoji-left") return <span className="preview-emoji">👈</span>;
  if (pose === "emoji-right") return <span className="preview-emoji">👉</span>;
  if (pose === "emoji-dwell") return <span className="preview-emoji">☝️</span>;

  const color = "rgba(255, 255, 255, 0.5)";
  const common: React.SVGProps<SVGSVGElement> = {
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  if (pose === "point") {
    return (
      <svg
        width="24"
        height="40"
        viewBox="0 0 24 40"
        stroke={color}
        {...common}
      >
        <line x1="12" y1="17" x2="12" y2="4" strokeWidth="3" />
        <rect x="4" y="17" width="16" height="14" rx="4" strokeWidth="1.5" />
        <line x1="4" y1="26" x2="1" y2="20" strokeWidth="2.5" />
      </svg>
    );
  }

  if (pose === "point-down") {
    return (
      <svg
        width="24"
        height="40"
        viewBox="0 0 24 40"
        stroke={color}
        {...common}
      >
        <line x1="12" y1="23" x2="12" y2="36" strokeWidth="3" />
        <rect x="4" y="9" width="16" height="14" rx="4" strokeWidth="1.5" />
        <line x1="4" y1="14" x2="1" y2="20" strokeWidth="2.5" />
      </svg>
    );
  }

  if (pose === "flat") {
    return (
      <svg
        width="28"
        height="40"
        viewBox="0 0 28 40"
        stroke={color}
        {...common}
      >
        <line x1="8" y1="17" x2="8" y2="7" strokeWidth="3" />
        <line x1="12" y1="17" x2="12" y2="4" strokeWidth="3" />
        <line x1="16" y1="17" x2="16" y2="4" strokeWidth="3" />
        <line x1="20" y1="17" x2="20" y2="7" strokeWidth="3" />
        <rect x="3" y="17" width="21" height="14" rx="4" strokeWidth="1.5" />
        <line x1="3" y1="26" x2="0" y2="19" strokeWidth="2.5" />
      </svg>
    );
  }

  if (pose === "pinch") {
    return (
      <svg
        width="26"
        height="40"
        viewBox="0 0 26 40"
        stroke={color}
        {...common}
      >
        <line x1="9" y1="18" x2="11" y2="5" strokeWidth="3" />
        <line x1="17" y1="22" x2="13" y2="7" strokeWidth="2.5" />
        <circle
          cx="12"
          cy="5"
          r="2.5"
          fill="rgba(110, 159, 255, 0.2)"
          strokeWidth="1"
        />
        <rect x="3" y="20" width="16" height="13" rx="4" strokeWidth="1.5" />
        <path d="M16 20c3 0 5 2 5 5" strokeWidth="1.5" />
      </svg>
    );
  }

  // palm
  return (
    <svg width="30" height="40" viewBox="0 0 30 40" stroke={color} {...common}>
      <line x1="8" y1="17" x2="4" y2="5" strokeWidth="3" />
      <line x1="12" y1="17" x2="10" y2="3" strokeWidth="3" />
      <line x1="17" y1="17" x2="19" y2="3" strokeWidth="3" />
      <line x1="21" y1="17" x2="25" y2="5" strokeWidth="3" />
      <rect x="4" y="17" width="21" height="14" rx="4" strokeWidth="1.5" />
      <line x1="4" y1="26" x2="0" y2="16" strokeWidth="2.5" />
    </svg>
  );
};

const POSE_MAP: Record<CheatCard["preview"], HandPose> = {
  "point-left": "emoji-left",
  "point-right": "emoji-right",
  "point-up": "emoji-up",
  "point-down": "emoji-down",
  "pinch-out": "emoji-pinch",
  "pinch-in": "emoji-pinch",
  "point-dwell": "emoji-dwell",
  "open-palm": "palm",
};

/* ── Gesture preview with hand pose + motion animation ── */

const GesturePreview: React.FC<{ kind: CheatCard["preview"] }> = ({ kind }) => {
  const renderMotion = () => {
    if (kind === "pinch-out" || kind === "pinch-in") {
      return (
        <>
          <div className="pinch-center" />
          <div className="pinch-dot pinch-dot-left" />
          <div className="pinch-dot pinch-dot-right" />
        </>
      );
    }

    if (kind === "point-dwell") {
      return (
        <>
          <div className="preview-target" />
          <div className="preview-pointer" />
        </>
      );
    }

    if (
      kind === "point-up" ||
      kind === "point-down" ||
      kind === "point-left" ||
      kind === "point-right"
    ) {
      return (
        <>
          <div className="point-hold-line" />
          <div className="preview-pointer" />
        </>
      );
    }

    if (kind === "open-palm") {
      return <div className="zoom-label" />;
    }

    return (
      <>
        <div className="preview-path" />
        <div className="preview-pointer" />
      </>
    );
  };

  return (
    <div className={`gesture-preview ${kind}`} aria-hidden="true">
      <div className="preview-pose">
        <HandIllustration pose={POSE_MAP[kind]} />
      </div>
      <div className="preview-motion">{renderMotion()}</div>
    </div>
  );
};

const CheatsheetApp: React.FC = () => {
  return (
    <main className="cheatsheet-shell">
      <div className="cheatsheet-inner">
        <div className="page-title">Gesture Cheatsheet</div>
        <p className="page-desc">
          Quick reference for hand gestures. Keep your hand centered in camera
          view.
        </p>

        <div className="cheatsheet-grid mt-5">
          {GESTURE_CARDS.map((card) => (
            <article className="gesture-card" key={card.title}>
              <div className="label">Gesture</div>
              <h2 className="gesture-title">{card.title}</h2>
              <GesturePreview kind={card.preview} />
              <p className="gesture-visual">{card.visual}</p>
              <p className="gesture-effect">{card.effect}</p>
              <p className="note mt-1">{card.details}</p>
            </article>
          ))}
        </div>

        <div className="metric-card mt-5">
          <div className="label">Tips</div>
          <p className="note mt-2">
            Move with short, deliberate gestures. There is a cooldown between
            triggers to prevent repeated actions.
          </p>
        </div>
      </div>
    </main>
  );
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);
root.render(<CheatsheetApp />);
