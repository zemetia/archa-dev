import { describe, expect, it } from 'vitest';
import { colorToHex, hexToColor, type Node, type TextNode } from '@archa/schema';
import { adjustSpans, ArchaDocument, DocumentSession, insertOpsFor, instanceOps, layoutText, makeComponentOps, normaliseInput, syncInstanceOps, textSegments, textWidth } from '../src';

/* Gradients, rich text, token bindings and instance overrides (blueprint DESIGN_SYSTEM/01–02, DOCUMENT_MODEL/01). */

const user = { kind: 'user' as const, id: 'u' };
function session() {
  const s = new DocumentSession(ArchaDocument.create('d'));
  return { s, root: s.doc.pages[0]!.rootId };
}
function add(s: DocumentSession, parent: string, input: Record<string, unknown>) {
  const r = insertOpsFor(input as never, parent);
  s.apply({ author: user, label: 'add', baseRevision: s.revision, ops: r.ops });
  return r.rootId;
}
const hexOf = (n: Node | undefined) => (n && 'fills' in n && n.fills[0]?.type === 'solid' ? colorToHex(n.fills[0].color) : null);

describe('gradients', () => {
  it('reads CSS gradient strings and object form into gradient paints', () => {
    const lin = normaliseInput({ type: 'rect', fills: ['linear-gradient(to right, #000000 0%, rgba(255, 255, 255, 0.5) 100%)'] }).fills as Array<Record<string, any>>;
    expect(lin[0]).toMatchObject({ type: 'linear', angle: 90 });
    expect(lin[0]!.stops).toHaveLength(2);
    expect(lin[0]!.stops[1].color.a).toBeCloseTo(0.5, 2);
    const rad = normaliseInput({ type: 'rect', fills: ['radial-gradient(circle at 30% 40%, #ff0000, #0000ff)'] }).fills as Array<Record<string, any>>;
    expect(rad[0]).toMatchObject({ type: 'radial', cx: 0.3, cy: 0.4 });
    expect(rad[0]!.stops.map((x: { offset: number }) => x.offset)).toEqual([0, 1]);
    const obj = normaliseInput({ type: 'rect', fills: [{ type: 'linear', angle: 45, stops: ['#000', '#fff', '#000'] }] }).fills as Array<Record<string, any>>;
    expect(obj[0]!.stops.map((x: { offset: number }) => x.offset)).toEqual([0, 0.5, 1]);
    const { s, root } = session();
    const id = add(s, root, { type: 'rect', name: 'Scrim', fills: ['linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.7) 100%)'] });
    expect(s.doc.get(id)!.type === 'rect' && (s.doc.get(id) as { fills: Array<{ type: string }> }).fills[0]!.type).toBe('linear');
  });
});

describe('rich text', () => {
  it('builds text + spans from runs, and lays out with the span styles', () => {
    const { s, root } = session();
    const id = add(s, root, { type: 'text', name: 'T', fontSize: 40, runs: ['Kami menghadirkan ', { text: 'gudang modern', fill: '#8c9196', fontWeight: 700 }] });
    const n = s.doc.get(id) as TextNode;
    expect(n.text).toBe('Kami menghadirkan gudang modern');
    expect(n.spans).toHaveLength(1);
    expect(n.spans![0]).toMatchObject({ start: 18, end: 31, fontWeight: 700 });
    // The bold run is wider than the same characters at the node's weight.
    const plain = textWidth(n.text, n);
    expect(n.width).toBeGreaterThan(plain);
    const segs = textSegments(n, layoutText(n)[0]!);
    expect(segs.map((g) => n.text.slice(g.start, g.end))).toEqual(['Kami menghadirkan ', 'gudang modern']);
    expect(segs[1]!.x).toBeCloseTo(textWidth('Kami menghadirkan ', n), 6);
  });

  it('keeps spans on the same characters when the text is edited', () => {
    expect(adjustSpans('Hello world', 'Hello big world', [{ start: 6, end: 11 }])).toEqual([{ start: 10, end: 15 }]);
    expect(adjustSpans('Hello world', 'Hi world', [{ start: 0, end: 5 }, { start: 6, end: 11 }])).toEqual([{ start: 0, end: 2 }, { start: 3, end: 8 }]);
    const { s, root } = session();
    const id = add(s, root, { type: 'text', name: 'T', runs: ['A ', { text: 'bold', fontWeight: 700 }] });
    s.apply({ author: user, label: 'edit', baseRevision: s.revision, ops: [{ op: 'update', id, patch: { text: 'A very bold' } }] });
    const n = s.doc.get(id) as TextNode;
    expect(n.text.slice(n.spans![0]!.start, n.spans![0]!.end)).toBe('bold');
  });
});

describe('token bindings', () => {
  it('applies bound variables, follows changes, detaches on a hand edit, and undoes cleanly', () => {
    const { s, root } = session();
    s.apply({ author: user, label: 'vars', baseRevision: 0, ops: [
      { op: 'setVariable', variable: { id: 'v1', name: 'color/accent', type: 'color', value: hexToColor('#e13044') } },
      { op: 'setVariable', variable: { id: 'v2', name: 'radius/card', type: 'number', value: 20 } },
    ] });
    const id = add(s, root, { type: 'rect', name: 'Card', fills: ['#000000'], bind: { fill: 'color/accent', cornerRadius: 'v2' } });
    expect(hexOf(s.doc.get(id))).toBe('#e13044');
    expect((s.doc.get(id) as { cornerRadius: number }).cornerRadius).toBe(20);

    s.apply({ author: user, label: 'retheme', baseRevision: s.revision, ops: [{ op: 'setVariable', variable: { id: 'v1', name: 'color/accent', type: 'color', value: hexToColor('#0b74de') } }] });
    expect(hexOf(s.doc.get(id))).toBe('#0b74de');
    s.undo(user);
    expect(hexOf(s.doc.get(id))).toBe('#e13044');

    s.apply({ author: user, label: 'hand', baseRevision: s.revision, ops: [{ op: 'update', id, patch: { fills: [{ type: 'solid', color: hexToColor('#00ff00'), visible: true }] } }] });
    expect(s.doc.get(id)!.bind).toEqual({ cornerRadius: 'v2' });
    s.apply({ author: user, label: 'retheme', baseRevision: s.revision, ops: [{ op: 'setVariable', variable: { id: 'v1', name: 'color/accent', type: 'color', value: hexToColor('#111111') } }] });
    expect(hexOf(s.doc.get(id))).toBe('#00ff00');
  });
});

describe('instance overrides', () => {
  function withComponent() {
    const { s, root } = session();
    const main = add(s, root, { type: 'frame', name: 'Button', layout: 'row', fills: ['#e13044'], children: [
      { type: 'text', name: 'Label', text: 'Chat WhatsApp', fills: ['#ffffff'] },
      { type: 'rect', name: 'Icon', width: 14, height: 14, fills: ['#ffffff'] },
    ] });
    s.apply({ author: user, label: 'comp', baseRevision: s.revision, ops: makeComponentOps(s.doc, main, 'Primary') });
    const r = instanceOps(s.doc, main, root, { x: 300, y: 0 });
    s.apply({ author: user, label: 'inst', baseRevision: s.revision, ops: r.ops });
    const label = s.doc.children(r.rootId).find((c) => c.name === 'Label')!.id;
    return { s, main, inst: r.rootId, label };
  }

  it('keeps edits made on a copy when the main is synced, and keeps node ids', () => {
    const { s, main, inst, label } = withComponent();
    s.apply({ author: user, label: 'override', baseRevision: s.revision, ops: [{ op: 'update', id: label, patch: { text: 'Jadwalkan Survey' } }] });
    const mainLabel = s.doc.children(main).find((c) => c.name === 'Label')!.id;
    s.apply({ author: user, label: 'restyle', baseRevision: s.revision, ops: [
      { op: 'update', id: main, patch: { fills: [{ type: 'solid', color: hexToColor('#16181b'), visible: true }] } },
      { op: 'update', id: mainLabel, patch: { fontSize: 18 } },
    ] });
    s.apply({ author: user, label: 'sync', baseRevision: s.revision, ops: syncInstanceOps(s.doc, inst) });
    const l = s.doc.get(label) as TextNode;
    expect(l).toBeDefined();
    expect(l.text).toBe('Jadwalkan Survey');
    expect(l.fontSize).toBe(18);
    expect(hexOf(s.doc.get(inst))).toBe('#16181b');
  });

  it('adds what the main gained, removes what it lost, and records overrides given at insert', () => {
    const { s, main, inst } = withComponent();
    const icon = s.doc.children(main).find((c) => c.name === 'Icon')!.id;
    s.apply({ author: user, label: 'edit main', baseRevision: s.revision, ops: [
      { op: 'delete', id: icon },
      ...insertOpsFor({ type: 'ellipse', name: 'Dot', width: 6, height: 6 } as never, main).ops,
    ] });
    s.apply({ author: user, label: 'sync', baseRevision: s.revision, ops: syncInstanceOps(s.doc, inst) });
    expect(s.doc.children(inst).map((c) => c.name)).toEqual(['Label', 'Dot']);

    const r = instanceOps(s.doc, main, s.doc.pages[0]!.rootId);
    const ops = r.ops.map((op) => (op.op === 'insert' && op.node.name === 'Label' ? { ...op, node: { ...op.node, text: 'Ajukan' } as never } : op));
    s.apply({ author: user, label: 'inst2', baseRevision: s.revision, ops });
    const lbl = s.doc.children(r.rootId).find((c) => c.name === 'Label')!;
    expect(lbl.meta.overrides).toEqual(['text']);
    s.apply({ author: user, label: 'sync', baseRevision: s.revision, ops: syncInstanceOps(s.doc, r.rootId) });
    expect((s.doc.get(lbl.id) as TextNode).text).toBe('Ajukan');
  });
});
