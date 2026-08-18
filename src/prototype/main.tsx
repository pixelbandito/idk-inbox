import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrototypeHub } from './PrototypeHub';
import './prototype.css';

createRoot(document.getElementById('proto-root')!).render(
  <StrictMode>
    <PrototypeHub />
  </StrictMode>,
);
