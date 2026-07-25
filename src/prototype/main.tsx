import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PanelNavPrototype } from './PanelNavPrototype';
import './prototype.css';

createRoot(document.getElementById('proto-root')!).render(
  <StrictMode>
    <PanelNavPrototype />
  </StrictMode>,
);
