import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { installImageResolver } from './lib/asset-urls';
import './styles.css';
import { registerBundledFonts } from './lib/bundled-fonts';

registerBundledFonts();

installImageResolver();

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
