import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserContainer } from '@/di/browserContainer';
import { ServicesProvider } from '../shared/services';
import { HistoryView } from './HistoryView';
import '../shared/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServicesProvider container={createBrowserContainer()}>
      <main className="history-page">
        <HistoryView />
      </main>
    </ServicesProvider>
  </StrictMode>,
);
