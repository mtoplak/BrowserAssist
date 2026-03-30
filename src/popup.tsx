import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import GesturePanel from "./features/gesture/GesturePanel";
import EyeTrackingPanel from "./features/eye/EyeTrackingPanel";
import "./index.css";

type PopupTab = "gesture" | "eye";

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<PopupTab>("gesture");

  return (
    <main className="popup-shell">
      <div className="page-title">Browser Assist</div>
      <p className="page-desc">Choose a control mode below.</p>

      <div className="tab-bar mt-4" role="tablist">
        <button
          className={`tab-btn ${activeTab === "gesture" ? "tab-btn-active" : ""}`}
          role="tab"
          aria-selected={activeTab === "gesture"}
          onClick={() => setActiveTab("gesture")}
        >
          Gestures
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

      {activeTab === "gesture" ? <GesturePanel /> : <EyeTrackingPanel />}
    </main>
  );
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);
root.render(<App />);
