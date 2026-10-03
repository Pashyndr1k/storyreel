import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { agentActive, agentAlert } from './lib/agent/registry.js';

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

// While the agent is running a call nobody is there to answer a dialog:
// confirm() says yes (the agent already decided) and alert() is handed to the
// agent as the call's message instead of stopping the app.
if (typeof window !== 'undefined') {
  const humanAlert = window.alert.bind(window);
  const humanConfirm = window.confirm.bind(window);
  window.alert = (m) => (agentActive() ? agentAlert(m) : humanAlert(m));
  window.confirm = (m) => (agentActive() ? true : humanConfirm(m));
}

createRoot(document.getElementById('root')).render(<App />);
