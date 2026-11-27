import type { Channel, Message } from '@archa/protocol';

/**
 * Two connected Channels in one process (blueprint ARCHITECTURE/02, "In-process" row): what one side
 * sends the other receives on a later microtask, as a structured clone, so neither side shares objects.
 */
export function channelPair(): [Channel, Channel] {
  const make = (deliver: (m: Message) => void, subs: Array<(m: Message) => void>): Channel => ({
    send: (m) => deliver(m),
    onMessage: (cb) => { subs.push(cb); },
  });
  const aSubs: Array<(m: Message) => void> = [];
  const bSubs: Array<(m: Message) => void> = [];
  const to = (subs: Array<(m: Message) => void>) => (m: Message) => {
    const copy = structuredClone(m);
    queueMicrotask(() => { for (const s of subs) s(copy); });
  };
  return [make(to(bSubs), aSubs), make(to(aSubs), bSubs)];
}
