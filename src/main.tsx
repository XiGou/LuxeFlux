import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// 註冊 Capacitor（原生平台時自動啟動）
import { Capacitor } from '@capacitor/core';
if (Capacitor.isNativePlatform()) {
  // Native WebView: 確保狀態列與安全區域渲染正確
  document.documentElement.style.setProperty('--sat', 'env(safe-area-inset-top)');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
