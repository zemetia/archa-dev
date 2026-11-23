import { useEffect, useRef } from 'react';
import { hexToColor, paintColor, colorToCss, type StickyNode, type TextNode } from '@archa/schema';
import { STICKY_LINE, STICKY_PADDING } from '@archa/render';
import { commit, useStore, type Camera } from '../lib/store';
import { inAutoLayout } from '@archa/core';
import { applyMat, nodeMatrix, pageRotation, toScreen } from '../lib/geometry';

/** DOM text editing over the canvas for text and sticky notes; committed as one transaction on blur (blueprint RENDERING/01). */
export function TextEditor({ nodeId, camera }: { nodeId: string; camera: Camera }) {
  const doc = useStore((s) => s.doc)!;
  const node = doc.get(nodeId) as TextNode | StickyNode;
  const ref = useRef<HTMLTextAreaElement>(null);
  const original = useRef(node.text);
  const sticky = node.type === 'sticky';
  // Canva-like: free text keeps its width while typing and wraps; only auto layout (buttons, labels) still hugs.
  const fixWidth = node.type === 'text' && node.textSizing === 'auto-width' && !inAutoLayout(doc, node);
  const wraps = node.type === 'text' && (node.textSizing !== 'auto-width' || fixWidth);

  useEffect(() => {
    const el = ref.current!;
    el.focus();
    el.select();
    // Hide the drawn text while editing; restored before the commit. A sticky keeps its paper and hides only the words.
    doc.nodes.set(nodeId, sticky ? { ...node, text: '' } : { ...node, visible: false });
    useStore.setState((s) => ({ rev: s.rev + 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = useRef(false);

  const finish = async (save: boolean) => {
    // Enter/Escape unmount the editor, which can also fire blur: commit once.
    if (done.current) return;
    done.current = true;
    const current = doc.get(nodeId) as TextNode | StickyNode | undefined;
    if (current) doc.nodes.set(nodeId, sticky ? { ...current, text: original.current } : { ...current, visible: true });
    useStore.setState((s) => ({ editingText: null, rev: s.rev + 1 }));
    const text = ref.current?.value ?? '';
    if (save && text !== original.current) {
      const patch: Record<string, unknown> = { text };
      if (!sticky && (node.name === original.current.slice(0, 24) || node.name === 'Text')) patch.name = text.slice(0, 24) || 'Text';
      if (fixWidth) Object.assign(patch, { textSizing: 'auto-height', width: Math.ceil(node.width), sizing: { ...node.sizing, horizontal: 'fixed' } });
      await commit('Edit text', [{ op: 'update', id: nodeId, patch }]);
    }
  };

  const b = doc.worldBounds(nodeId);
  const z = camera.zoom;
  // Placed by the box centre and turned with the layer, so a rotated text edits where it is drawn.
  const c = applyMat(nodeMatrix(doc, nodeId), b.width / 2, b.height / 2);
  const sc = toScreen(camera, c.x, c.y);
  const p = { x: sc.x - (b.width / 2) * z, y: sc.y - (b.height / 2) * z };
  const turn = pageRotation(doc, nodeId);
  const style: React.CSSProperties = node.type === 'sticky'
    ? {
      left: p.x + STICKY_PADDING * z, top: p.y + STICKY_PADDING * z,
      width: (b.width - STICKY_PADDING * 2) * z, height: (b.height - STICKY_PADDING * 2) * z,
      font: `500 ${node.fontSize * z}px Inter, "Segoe UI", system-ui, sans-serif`, lineHeight: STICKY_LINE, color: '#1f1f23', whiteSpace: 'pre-wrap',
    }
    : {
      left: p.x, top: p.y,
      width: Math.max(40, (wraps ? b.width : b.width + 40) * z),
      minHeight: b.height * z,
      font: `${node.fontWeight} ${node.fontSize * z}px "${node.fontFamily}", Inter, system-ui, sans-serif`,
      lineHeight: node.lineHeight,
      letterSpacing: node.letterSpacing * z,
      textAlign: node.textAlign,
      color: colorToCss((node.fills.find((f) => f.visible) && paintColor(node.fills.find((f) => f.visible)!)) || hexToColor('#111111')),
      whiteSpace: wraps ? 'pre-wrap' : 'pre',
      fontStyle: node.fontStyle,
      textDecoration: [node.underline && 'underline', node.strikethrough && 'line-through'].filter(Boolean).join(' ') || undefined,
      textTransform: node.textCase === 'upper' ? 'uppercase' : node.textCase === 'lower' ? 'lowercase' : node.textCase === 'title' ? 'capitalize' : undefined,
    };
  if (turn) Object.assign(style, { transform: `rotate(${turn}deg)`, transformOrigin: `${(b.width / 2) * z}px ${(b.height / 2) * z}px` });
  return (
    <textarea
      ref={ref}
      defaultValue={node.text}
      spellCheck={false}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => void finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); void finish(true); }
        // Enter saves; Shift+Enter starts a new line.
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void finish(true); }
      }}
      className={`absolute resize-none overflow-hidden border-none bg-transparent p-0 ${sticky ? 'outline-none' : 'outline outline-1 outline-accent'}`}
      style={style}
    />
  );
}
