import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

function renderApp() {
  if (window.CONFIG && window.CONFIG.BACKEND_URL) {
    const root = createRoot(document.getElementById('root'));
    root.render(<App />);
  } else {
    // Fallback if CONFIG is not loaded
    const root = createRoot(document.getElementById('root'));
    root.render(<App />);
  }
}

renderApp();
