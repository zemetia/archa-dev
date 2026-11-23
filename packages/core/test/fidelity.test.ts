import { describe, expect, it } from 'vitest';
import { colorToHex, hexToColor, paintColor, type Node, type Op, type TextNode } from '@archa/schema';
import {
  ArchaDocument, DocumentSession, approxMeasure, bindTokens, insertOpsFor, instanceOps, linearGradientLine, makeComponentOps,
  remapSpans, setPropsOps, styledParagraphs, syncInstanceOps,
} from '../src';

const user = { kind: 'user' as const, id: 'u1' };

function setup() {
  const s = new DocumentSession(ArchaDocument.create('Fidelity'));
  const root = s.doc.pages[0]!.rootId;
  const apply = (ops: Op[]) => s.apply({ author: user, label: 't', baseRevision: s.revision, ops });
  const insert = (input: Record<string, unknown>, parent = root) => { const r = insertOpsFor(input as never, parent); apply(r.ops); return r.rootId; };
  return { s, root, apply, insert };
}
const hexOf = (n: Node | undefined) => (n && 'fills' in n && n.fills[0]?.type === 'solid' ? colorToHex(n.fills[0].color) : null);

describe('paints', () => {
  it('accepts gradients with hex stops and picture fills, and stands one colour in for them', () => {
    const { s, insert } = setup();
    const id = insert({ type: 'frame', name: 'Hero', fills: [
      { type: 'image', src: 'data:image/png;base64,AA==', fit: 'cover' },
      { type: 'linear', angle: 180, stops: ['#00000000', '#000000b3'] },
      { type: 'radial-gradient', radius: 0.8, stops: [{ position: 0, color: '#8b5cf6' }, { position: 100, color: '#8b5cf600' }] },
    ] });
    const n = s.doc.require(id) as Extract<Node, { type: 'frame' }>;
    expect(n.fills.map((f) => f.type)).toEqual(['image', 'linear-gradient', 'radial-gradient']);
    expect(n.fills[0]!.type === 'image' && n.fills[0]!.fit).toBe('crop');
    const lin = n.fills[1]!;
    expect(lin.type === 'linear-gradient' && lin.stops.map((st) => st.position)).toEqual([0, 1]);
    const rad = n.fills[2]!;
    expect(rad.type === 'radial-gradient' && [rad.radius, rad.stops[1]!.position]).toEqual([{ x: 0.8, y: 0.8 }, 1]);
    expect(paintColor(n.fills[0]!)).toBeNull();
    expect(paintColor(lin)!.a).toBeCloseTo(0.7, 1);
  });

  it('places a CSS gradient line across the box', () => {
    expect(Object.values(linearGradientLine(180, 100, 50)).map((v) => Math.round(v) + 0)).toEqual([50, 0, 50, 50]);
    const l = linearGradientLine(90, 100, 50);
    expect([l.x0, l.x1].map(Math.round)).toEqual([0, 100]);
  });
});

describe('rich text', () => {
  const node = (over: Partial<TextNode>) => ({
    text: 'Design faster', textCase: 'none', list: 'none', curve: 0, spans: [], fontFamily: 'Inter', fontSize: 40, fontWeight: 700,
    fontStyle: 'normal', letterSpacing: 0, underline: false, strikethrough: false, fills: [], ...over,
  }) as TextNode;

  it('cuts paragraphs into pieces at span edges', () => {
    const accent = [{ type: 'solid' as const, color: hexToColor('#8b5cf6'), visible: true }];
    const paras = styledParagraphs(node({ text: 'Design faster\nwith agents', spans: [{ start: 7, end: 13, fills: accent }], textCase: 'upper' }));
    expect(paras.map((p) => p.map((x) => x.text))).toEqual([['DESIGN ', 'FASTER'], ['WITH AGENTS']]);
    expect(paras[0]![1]!.style.fills).toBe(accent);
  });

  it('keeps spans on their characters while the text is edited', () => {
    const spans = [{ start: 7, end: 13, fontWeight: 300 }];
    expect(remapSpans('Design faster', 'Design much faster', spans)).toEqual([{ start: 12, end: 18, fontWeight: 300 }]);
    expect(remapSpans('Design faster', 'Design fasterer', spans)).toEqual([{ start: 7, end: 15, fontWeight: 300 }]);
    expect(remapSpans('Design faster', 'Design ', spans)).toEqual([]);
  });

  it('remaps spans when an update only changes the text, and measures larger pieces taller', () => {
    const { s, apply, insert } = setup();
    const id = insert({ type: 'text', name: 'H', text: 'Hi there', fill: '#111111', spans: [{ start: 3, end: 8, color: '#ff0000', fontSize: 80 }] });
    const t = s.doc.require(id) as TextNode;
    expect(t.spans[0]!.fills?.[0]?.type).toBe('solid');
    expect(t.height).toBeGreaterThan(80);
    expect(approxMeasure({ ...t, spans: [] }).height).toBeLessThan(t.height);
    apply([{ op: 'update', id, patch: { text: 'Oh hi there' } }]);
    expect((s.doc.require(id) as TextNode).spans[0]).toMatchObject({ start: 6, end: 11 });
  });
});

describe('token bindings', () => {
  it('writes the token on insert, follows setVariable, and undo restores both', () => {
    const { s, apply, insert } = setup();
    apply([{ op: 'setVariable', variable: { id: 'v1', name: 'color/accent', type: 'color', value: hexToColor('#8b5cf6') } }]);
    apply([{ op: 'setVariable', variable: { id: 'v2', name: 'radius/md', type: 'number', value: 12 } }]);
    const id = insert({ type: 'rect', name: 'Chip', bindings: { 'fills.0.color': 'v1', cornerRadius: 'v2' } });
    expect(hexOf(s.doc.get(id))).toBe('#8b5cf6');
    expect((s.doc.require(id) as Extract<Node, { type: 'rect' }>).cornerRadius).toBe(12);
    apply([{ op: 'setVariable', variable: { id: 'v1', name: 'color/accent', type: 'color', value: hexToColor('#ef4444') } }]);
    expect(hexOf(s.doc.get(id))).toBe('#ef4444');
    s.undo(user);
    expect(hexOf(s.doc.get(id))).toBe('#8b5cf6');
  });

  it('unbinds a property edited by hand to another value', () => {
    const { s, apply, insert } = setup();
    apply([{ op: 'setVariable', variable: { id: 'v1', name: 'color/accent', type: 'color', value: hexToColor('#8b5cf6') } }]);
    const id = insert({ type: 'rect', name: 'Chip', bindings: { 'fills.0.color': 'v1' } });
    apply([{ op: 'update', id, patch: { fills: [{ type: 'solid', color: hexToColor('#000000'), visible: true }] } }]);
    expect(s.doc.require(id).bindings).toBeUndefined();
    apply([{ op: 'setVariable', variable: { id: 'v1', name: 'color/accent', type: 'color', value: hexToColor('#22c55e') } }]);
    expect(hexOf(s.doc.get(id))).toBe('#000000');
  });

  it('turns "$name" values into bindings', () => {
    const { s, apply } = setup();
    apply([{ op: 'setVariable', variable: { id: 'v1', name: 'color/accent', type: 'color', value: hexToColor('#8b5cf6') } }]);
    apply([{ op: 'setVariable', variable: { id: 'v2', name: 'space/4', type: 'number', value: 16 } }]);
    const out = bindTokens(s.doc, { type: 'frame', fills: ['$color/accent'], padding: '$space/4', name: '$29 plan' }, (v) => colorToHex(v.value));
    expect(out).toMatchObject({ fills: ['#8b5cf6'], padding: 16, name: '$29 plan', bindings: { 'fills.0.color': 'v1', padding: 'v2' } });
  });
});

describe('components v2', () => {
  function button() {
    const ctx = setup();
    const id = ctx.insert({ type: 'frame', name: 'Button', layout: 'row', padding: 12, sizing: 'hug', fill: '#8b5cf6', children: [
      { type: 'text', name: 'Label', text: 'Buy' }, { type: 'rect', name: 'Icon', width: 16, height: 16 },
    ] });
    const [label, icon] = ctx.s.doc.children(id).map((c) => c.id) as [string, string];
    return { ...ctx, id, label, icon };
  }
  const textOf = (s: DocumentSession, id: string) => (s.doc.children(id).find((c) => c.name === 'Label') as TextNode).text;

  it('keeps an instance text edit (an override) through a sync, and reset drops it', () => {
    const { s, root, apply, id, label } = button();
    apply(makeComponentOps(s.doc, id));
    const inst = instanceOps(s.doc, id, root, { x: 300 });
    apply(inst.ops);
    const copy = s.doc.children(inst.rootId).find((c) => c.name === 'Label')!;
    apply([{ op: 'update', id: copy.id, patch: { text: 'Sign up' } }]);
    apply([{ op: 'update', id: label, patch: { fontWeight: 800 } }, { op: 'update', id, patch: { cornerRadius: 20 } }]);
    apply(syncInstanceOps(s.doc, inst.rootId));
    const after = s.doc.children(inst.rootId).find((c) => c.name === 'Label') as TextNode;
    expect([after.id, after.text, after.fontWeight]).toEqual([copy.id, 'Sign up', 800]);
    expect((s.doc.require(inst.rootId) as Extract<Node, { type: 'frame' }>).cornerRadius).toBe(20);
    apply(syncInstanceOps(s.doc, inst.rootId, { reset: true }));
    expect(textOf(s, inst.rootId)).toBe('Buy');
  });

  it('sets text and boolean props', () => {
    const { s, root, apply, id, label, icon } = button();
    apply(makeComponentOps(s.doc, id, 'CTA', { props: { label: { type: 'text', node: label }, showIcon: { type: 'boolean', node: icon } } }));
    const inst = instanceOps(s.doc, id, root, { x: 300, props: { label: 'Start free' } });
    apply(inst.ops);
    expect(textOf(s, inst.rootId)).toBe('Start free');
    apply(setPropsOps(s.doc, inst.rootId, { showIcon: false }));
    expect(s.doc.children(inst.rootId).find((c) => c.name === 'Icon')!.visible).toBe(false);
    expect(textOf(s, inst.rootId)).toBe('Start free');
    apply(syncInstanceOps(s.doc, inst.rootId));
    expect(textOf(s, inst.rootId)).toBe('Start free');
    expect(() => setPropsOps(s.doc, inst.rootId, { colour: 'red' })).toThrow(/no prop "colour" — props: label, showIcon/);
  });

  it('swaps variants of a set, keeping props and overrides', () => {
    const { s, root, apply, insert, id, label } = button();
    apply(makeComponentOps(s.doc, id, '', { set: 'Button', variant: { size: 'md' }, props: { label: { type: 'text', node: label } } }));
    const lg = insert({ type: 'frame', name: 'Button', y: 200, layout: 'row', padding: 20, sizing: 'hug', fill: '#8b5cf6', children: [{ type: 'text', name: 'Label', text: 'Buy', fontSize: 20 }] });
    apply(makeComponentOps(s.doc, lg, '', { set: 'Button', variant: { size: 'lg' }, props: { label: { type: 'text', node: s.doc.children(lg)[0]!.id } } }));
    expect(() => makeComponentOps(s.doc, lg, '', { set: 'Button', variant: { size: 'md' } })).toThrow(/already the/);
    const inst = instanceOps(s.doc, id, root, { x: 400, props: { label: 'Go' } });
    apply(inst.ops);
    apply(setPropsOps(s.doc, inst.rootId, { size: 'lg' }));
    const n = s.doc.require(inst.rootId);
    expect(n.meta.instanceOf).toBe(lg);
    expect((n as Extract<Node, { type: 'frame' }>).padding.top).toBe(20);
    expect(textOf(s, inst.rootId)).toBe('Go');
    expect(() => setPropsOps(s.doc, inst.rootId, { size: 'xl' })).toThrow(/no variant/);
  });
});
