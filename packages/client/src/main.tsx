import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/oswald/400.css';
import '@fontsource/oswald/600.css';
import '@fontsource/oswald/700.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import './styles.css';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Falta #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
