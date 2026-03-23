// src/popup.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { handleGoToOptions } from './tools/functions';
import './index.css';

const App: React.FC = () => {
  return (
    <main className='nebula-shell popup-shell'>
      <div className='orb orb-one' aria-hidden='true' />
      <div className='orb orb-two' aria-hidden='true' />

      <section className='glass-card w-full'>
        <p className='chip-label'>Browser Assist</p>
        <h1 className='hero-title mt-3'>Focus on action, not tabs.</h1>
        <p className='hero-copy mt-3'>
          Jump to your settings and keep your workflow tight. This popup is now a command deck, not a demo screen.
        </p>

        <div className='mt-5 grid grid-cols-2 gap-3'>
          <div className='metric-card'>
            <p className='metric-kicker'>Mode</p>
            <p className='metric-value'>Live</p>
          </div>
          <div className='metric-card'>
            <p className='metric-kicker'>Surface</p>
            <p className='metric-value'>Popup</p>
          </div>
        </div>

        <button className='primary-cta mt-6 w-full' onClick={handleGoToOptions}>
          Open Options Panel
        </button>
      </section>
    </main>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
