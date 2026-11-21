import { runLayout } from '@archa/core';
import type { Node } from '@archa/schema';
import { invalidateCanvas } from '../canvas/Canvas';
import { patchNodes } from '../ui/inspector/shared';
import { useStore } from './store';

/*
 * Slider edits (text toolbar, Effects panel): the canvas follows the thumb without an undo step per
 * pixel, then one transaction lands on release. The core host stays the only writer: the preview
 * only touches the renderer's view model, and the commit replaces it.
 */

export function previewPatch(id: string, patch: Record<string, unknown>) {
  const d = useStore.getState().doc;
  const n = d?.get(id);
  if (!d || !n) return;
  d.nodes.set(id, { ...n, ...patch } as Node);
  runLayout(d);
  invalidateCanvas();
  useStore.setState((s) => ({ rev: s.rev + 1 }));
}

export const commitPatch = (id: string, patch: Record<string, unknown>, label: string) => patchNodes([id], patch, label);
