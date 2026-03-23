import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import CountShow from './compontments/CountShow';

const App: React.FC = () => {
  return (
    <main className='nebula-shell options-shell'>
      <div className='orb orb-three' aria-hidden='true' />

      <section className='glass-card max-w-2xl w-full'>
        <p className='chip-label'>Options</p>
        <h1 className='hero-title mt-3'>Control Center</h1>
        <p className='hero-copy mt-3'>
          Manage local state and tune the extension behavior from a dedicated panel that feels like a real product.
        </p>

        <div className='mt-6 rounded-2xl border border-white/20 bg-white/5 p-4 md:p-5'>
          <p className='metric-kicker'>Storage demo</p>
          <p className='text-sm text-slate-200/90 mt-1'>
            The counter below is stored in chrome local storage and updates reactively.
          </p>
          <div className='mt-4'>
            <CountShow />
          </div>
        </div>
      </section>
    </main>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
