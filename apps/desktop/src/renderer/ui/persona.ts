import { personaColor } from '@archa/protocol';

/* Session colour classes; literal strings so Tailwind generates them (tokens in styles.css). */
const BG = ['bg-persona-0', 'bg-persona-1', 'bg-persona-2', 'bg-persona-3', 'bg-persona-4', 'bg-persona-5', 'bg-persona-6', 'bg-persona-7'];
const TEXT = ['text-persona-0', 'text-persona-1', 'text-persona-2', 'text-persona-3', 'text-persona-4', 'text-persona-5', 'text-persona-6', 'text-persona-7'];

/** Background class of a session's colour (matches its cursor on the canvas). */
export const personaBg = (name: string) => BG[personaColor(name)]!;
export const personaText = (name: string) => TEXT[personaColor(name)]!;
