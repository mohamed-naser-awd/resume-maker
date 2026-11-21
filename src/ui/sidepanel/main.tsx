import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserContainer } from '@/di/browserContainer';
import { ServicesProvider } from '../shared/services';
import { App } from './App';
import '../shared/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServicesProvider container={createBrowserContainer()}>
      <App />
    </ServicesProvider>
  </StrictMode>,
);
