/*
 * Session names (blueprint AGENT_BRIDGE/03 → Sessions). Every chat thread works on the canvas under a
 * random two-word name instead of the CLI's id, so parallel sessions of the same agent stay apart in
 * the cursor tags, activity and undo history.
 */

import { PERSONA_COLORS, personaColor } from '@archa/protocol';

const ADJECTIVES = [
  'Swift', 'Quiet', 'Bright', 'Amber', 'Cobalt', 'Velvet', 'Lucky', 'Nimble', 'Brave', 'Calm',
  'Clever', 'Golden', 'Hidden', 'Jade', 'Keen', 'Lunar', 'Misty', 'Noble', 'Polar', 'Rapid',
  'Rustic', 'Silver', 'Solar', 'Steady', 'Sunny', 'Tidal', 'Vivid', 'Wild', 'Witty', 'Zesty',
];
const NOUNS = [
  'Heron', 'Falcon', 'Otter', 'Lynx', 'Fox', 'Panda', 'Raven', 'Koi', 'Badger', 'Gecko',
  'Ibis', 'Jaguar', 'Kestrel', 'Lemur', 'Marten', 'Narwhal', 'Ocelot', 'Puffin', 'Quokka', 'Robin',
  'Sparrow', 'Tapir', 'Wren', 'Yak', 'Bison', 'Crane', 'Dingo', 'Egret', 'Finch', 'Hare',
];

const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!;

/**
 * A random name not in `taken`. Prefers a colour slot none of the `active` sessions use, so sessions
 * working side by side get different cursor colours (falls back to a numbered name after a few tries).
 */
export function randomPersona(taken: Iterable<string> = [], active: Iterable<string> = []): string {
  const used = new Set([...taken, ...active].filter(Boolean));
  const colours = new Set([...active].filter(Boolean).map(personaColor));
  let fallback: string | null = null;
  for (let i = 0; i < 200; i++) {
    const name = `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
    if (used.has(name)) continue;
    if (!colours.has(personaColor(name)) || colours.size >= PERSONA_COLORS) return name;
    fallback ??= name;
  }
  return fallback ?? `${pick(ADJECTIVES)} ${pick(NOUNS)} ${used.size + 1}`;
}
