import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import CountShow from "./compontments/CountShow";

const App: React.FC = () => {
  return (
    <main className="options-shell">
      <section className="card max-w-2xl w-full">
        <div className="page-title">Control Center</div>
        <p className="page-desc">
          Manage local state and tune the extension behavior.
        </p>

        <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="label">Storage demo</div>
          <p className="note mt-1">
            The counter below is stored in chrome local storage and updates
            reactively.
          </p>
          <div className="mt-4">
            <CountShow />
          </div>
        </div>
      </section>
    </main>
  );
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);
root.render(<App />);
