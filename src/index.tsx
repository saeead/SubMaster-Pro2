import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initSmartBidi } from './utils/smartBidi';

// Initialize intelligent bi-directional text and placeholder auto-alignment across the app
initSmartBidi();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);