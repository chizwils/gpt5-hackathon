import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '../styles/global.css';
import { PopupApp } from './popup-app';

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <PopupApp />
  </StrictMode>
);
