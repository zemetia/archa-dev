import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { installImageResolver } from './lib/assets';
import { preloadFonts } from './lib/fonts';
import './styles.css';

installImageResolver();
void preloadFonts();

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
