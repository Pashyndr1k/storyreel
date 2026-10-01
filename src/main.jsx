import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// In the desktop app, alert() / confirm() go through the main process:
// Chromium's own boxes leave the window without keyboard focus on Windows,
// after which no text field shows a caret or accepts typing until the window
// is re-activated. Every existing window.alert / window.confirm call is
// covered by this one redirect; the browser build keeps the native boxes.
const isPolicyMsg = (m) => /^(Blocked by content policy|Content policy check failed):/.test(String(m ?? ''));
if (typeof window !== 'undefined' && window.nativeDialogs) {
  const text = (m) => (m == null ? '' : String(m));
  window.alert = (m) => {
    if (isPolicyMsg(m)) return; // the policy dialog already explains it
    window.nativeDialogs.alert(text(m));
  };
  window.confirm = (m) => !!window.nativeDialogs.confirm(text(m));
}
 else if (typeof window !== 'undefined') {
  const nativeAlert = window.alert.bind(window);
  window.alert = (m) => {
    if (!isPolicyMsg(m)) nativeAlert(m);
  };
}

createRoot(document.getElementById('root')).render(<App />);
