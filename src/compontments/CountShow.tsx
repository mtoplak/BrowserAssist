// src/popup.tsx
import React from "react";
import useChromeStorageLocal from "../tools/localStore";

export function App() {
  const [count1, setCount1] = useChromeStorageLocal<number>("count1", 0);

  return (
    <div className="counter-shell">
      <p className="counter-label">Stored Count</p>
      <p className="counter-value">
        <span role="countInfo">{count1}</span>
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className="counter-btn counter-btn-primary"
          onClick={() => setCount1(count1 + 1)}
        >
          Increment
        </button>
        <button
          className="counter-btn counter-btn-ghost"
          onClick={() => setCount1(0)}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export default App;
