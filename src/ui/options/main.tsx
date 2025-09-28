import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/ui/styles/global.css';
import { OptionsApp } from './options-app';

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>
);
