import { useEffect, useRef } from 'react';
import { colorToCss, paintColor, type StickyNode, type TextNode } from '@archa/schema';
import { STICKY_LINE, STICKY_PADDING } from '@archa/render';
import { commit, useStore, type Camera } from '../lib/store';
import { toScreen } from '../lib/geometry';

/** DOM text editing over the canvas for text and sticky notes; committed as one transaction on blur (blueprint RENDERING/01). */
export function TextEditor({ nodeId, camera }: { nodeId: string; camera: Camera }) {
  const doc = useStore((s) => s.doc)!;
  const node = doc.get(nodeId) as TextNode | StickyNode;
  const ref = useRef<HTMLTextAreaElement>(null);
  const original = useRef(node.text);
  const sticky = node.type === 'sticky';

  useEffect(() => {
    const el = ref.current!;
    el.focus();
    el.select();
    // Hide the drawn text while editing; restored before the commit. A sticky keeps its paper and hides only the words.
    doc.nodes.set(nodeId, sticky ? { ...node, text: '' } : { ...node, visible: false });
    useStore.setState((s) => ({ rev: s.rev + 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async (save: boolean) => {
    const current = doc.get(nodeId) as TextNode | StickyNode | undefined;
    if (current) doc.nodes.set(nodeId, sticky ? { ...current, text: original.current } : { ...current, visible: true });
    useStore.setState((s) => ({ editingText: null, rev: s.rev + 1 }));
    const text = ref.current?.value ?? '';
    if (save && text !== original.current) {
      const patch: Record<string, unknown> = { text };
      if (!sticky && (node.name === original.current.slice(0, 24) || node.name === 'Text')) patch.name = text.slice(0, 24) || 'Text';
      await commit('Edit text', [{ op: 'update', id: nodeId, patch }]);
    }
  };

  const b = doc.worldBounds(nodeId);
  const p = toScreen(camera, b.x, b.y);
  const z = camera.zoom;
  const style: React.CSSProperties = node.type === 'sticky'
    ? {
      left: p.x + STICKY_PADDING * z, top: p.y + STICKY_PADDING * z,
      width: (b.width - STICKY_PADDING * 2) * z, height: (b.height - STICKY_PADDING * 2) * z,
      font: `500 ${node.fontSize * z}px Inter, "Segoe UI", system-ui, sans-serif`, lineHeight: STICKY_LINE, color: '#1f1f23', whiteSpace: 'pre-wrap',
    }
    : {
      left: p.x, top: p.y,
      width: Math.max(40, (node.textSizing === 'auto-width' ? b.width + 40 : b.width) * z),
      minHeight: b.height * z,
      font: `${node.fontWeight} ${node.fontSize * z}px "${node.fontFamily}", Inter, system-ui, sans-serif`,
      lineHeight: node.lineHeight,
      letterSpacing: node.letterSpacing * z,
      textAlign: node.textAlign,
      color: node.fills.find((f) => f.visible) ? colorToCss(paintColor(node.fills.find((f) => f.visible)!)) : '#111',
      whiteSpace: node.textSizing === 'auto-width' ? 'pre' : 'pre-wrap',
    };
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
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void finish(true); }
      }}
      className={`absolute resize-none overflow-hidden border-none bg-transparent p-0 ${sticky ? 'outline-none' : 'outline outline-1 outline-accent'}`}
      style={style}
    />
  );
}
