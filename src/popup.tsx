import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import GesturePanel from "./features/gesture/GesturePanel";
import EyeTrackingPanel from "./features/eye/EyeTrackingPanel";
import { handleOpenCheatsheet } from "./tools/functions";
import "./index.css";

type PopupTab = "gesture" | "eye";

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<PopupTab>("gesture");

  return (
    <main className="nebula-shell popup-shell">
      <div className="orb orb-one" aria-hidden="true" />
      <div className="orb orb-two" aria-hidden="true" />

      <section className="glass-card w-full">
        <p className="chip-label">Browser Assist</p>
        <h1 className="hero-title mt-3">Assistive Control Panel</h1>
        <p className="hero-copy mt-3">
          Choose a control mode for this session. All processing stays on your
          device.
        </p>

        <div className="tab-bar mt-5" role="tablist">
          <button
            className={`tab-btn ${activeTab === "gesture" ? "tab-btn-active" : ""}`}
            role="tab"
            aria-selected={activeTab === "gesture"}
            onClick={() => setActiveTab("gesture")}
          >
            Gesture Control
          </button>
          <button
            className={`tab-btn ${activeTab === "eye" ? "tab-btn-active" : ""}`}
            role="tab"
            aria-selected={activeTab === "eye"}
            onClick={() => setActiveTab("eye")}
          >
            Eye Tracking
          </button>
        </div>

        <button
          className="counter-btn counter-btn-ghost mt-4 w-full"
          onClick={handleOpenCheatsheet}
        >
          Open Gesture Cheatsheet
        </button>

        {activeTab === "gesture" ? <GesturePanel /> : <EyeTrackingPanel />}
      </section>
    </main>
  );
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);
root.render(<App />);
