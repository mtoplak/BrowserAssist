import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

type CheatCard = {
  title: string;
  visual: string;
  preview:
    | "swipe-left"
    | "swipe-right"
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
    title: "Swipe Left",
    visual: "Hand moves left quickly",
    preview: "swipe-left",
    effect: "Browser Back",
    details: "Navigate to the previous page in your current tab.",
  },
  {
    title: "Swipe Right",
    visual: "Hand moves right quickly",
    preview: "swipe-right",
    effect: "Browser Forward",
    details: "Navigate forward in your browsing history.",
  },
  {
    title: "Point Up",
    visual: "Index finger extended upward, hold steady",
    preview: "point-up",
    effect: "Scroll Up",
    details: "Hold your index finger pointing up for 3 seconds to scroll the page up.",
  },
  {
    title: "Point Down",
    visual: "Index finger extended downward, hold steady",
    preview: "point-down",
    effect: "Scroll Down",
    details: "Hold your index finger pointing down for 3 seconds to scroll the page down.",
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

const GesturePreview: React.FC<{ kind: CheatCard["preview"] }> = ({ kind }) => {
  if (kind === "pinch-out" || kind === "pinch-in") {
    return (
      <div className={`gesture-preview ${kind}`} aria-hidden="true">
        <div className="pinch-center" />
        <div className="pinch-dot pinch-dot-left" />
        <div className="pinch-dot pinch-dot-right" />
      </div>
    );
  }

  if (kind === "point-dwell") {
    return (
      <div className="gesture-preview point-dwell" aria-hidden="true">
        <div className="preview-target" />
        <div className="preview-pointer" />
      </div>
    );
  }

  if (kind === "point-up" || kind === "point-down") {
    return (
      <div className={`gesture-preview ${kind}`} aria-hidden="true">
        <div className="point-hold-line" />
        <div className="preview-pointer" />
      </div>
    );
  }

  if (kind === "open-palm") {
    return (
      <div className="gesture-preview open-palm" aria-hidden="true">
        <div className="palm-shape" />
        <div className="zoom-label" />
      </div>
    );
  }

  return (
    <div className={`gesture-preview ${kind}`} aria-hidden="true">
      <div className="preview-path" />
      <div className="preview-pointer" />
    </div>
  );
};

const CheatsheetApp: React.FC = () => {
  return (
    <main className="nebula-shell cheatsheet-shell">
      <div className="orb orb-one" aria-hidden="true" />
      <div className="orb orb-two" aria-hidden="true" />

      <section className="glass-card w-full cheatsheet-card">
        <p className="chip-label">Browser Assist</p>
        <h1 className="hero-title mt-3">Gesture Cheatsheet</h1>
        <p className="hero-copy mt-2">
          Use this page as a quick visual guide while controlling the browser
          with hand gestures.
        </p>

        <div className="cheatsheet-grid mt-6">
          {GESTURE_CARDS.map((card) => (
            <article className="gesture-card" key={card.title}>
              <p className="metric-kicker">Gesture</p>
              <h2 className="gesture-title">{card.title}</h2>
              <GesturePreview kind={card.preview} />
              <p className="gesture-visual">Visual: {card.visual}</p>
              <p className="gesture-effect">Action: {card.effect}</p>
              <p className="status-note">{card.details}</p>
            </article>
          ))}
        </div>

        <div className="metric-card mt-6">
          <p className="metric-kicker">Tips</p>
          <p className="status-note mt-1">
            Keep your hand centered in camera view and move with deliberate,
            short gestures.
          </p>
          <p className="status-note mt-1">
            The engine has a cooldown between triggers to reduce repeated
            actions.
          </p>
        </div>
      </section>
    </main>
  );
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);
root.render(<CheatsheetApp />);
