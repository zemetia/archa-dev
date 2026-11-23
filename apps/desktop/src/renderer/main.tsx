import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles.css';
import { registerBundledFonts } from './lib/bundled-fonts';

registerBundledFonts();

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
