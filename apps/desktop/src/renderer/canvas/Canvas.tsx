import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { attachedBox, connectorRoute, insertOpsFor, routeConnectors, runLayout, type ArchaDocument } from '@archa/core';
import { drawNode, drawPage, FrameBitmapCache } from '@archa/render';
import { isContainer, type ConnectorEnd, type ConnectorNode, type Node, type NodeInput, type Op } from '@archa/schema';
import { commit, select, setTool, useStore, type Camera, type Tool } from '../lib/store';
import { connectorEnds, containerAt, fitCamera, handleCursor, handlePoint, HANDLES, hitPath, originOf, pageRoot, pickFromPath, selectionBounds, toWorld, type Handle } from '../lib/geometry';
import { drawOverlay, type OverlayExtras } from './overlay';
import { cursorAlive, drawCursors } from './cursors';
import * as changes from './changes';
import { TextEditor } from './TextEditor';
import { EmbedLayer, scrollEmbed } from './EmbedLayer';
import { CommentsLayer } from './CommentsLayer';
import { onImageLoaded } from '@archa/render';
import { penBounds, penPath, type PenPoint } from './pen';
import { scaleOps } from './scale';
import { ASSET_MIME, assetStyle, insertAsset } from '../lib/assets';
import { dropFiles } from '../lib/importers';

type Pt = { x: number; y: number };
type Gesture =
  | { kind: 'pan'; sx: number; sy: number; cam: Camera }
  | { kind: 'move'; start: Pt; ids: string[]; orig: Map<string, Pt>; ends: Map<string, Ends>; moved: boolean; reorder: { parentId: string; index: number } | null; drop: string | null }
  /** Drawing a new connector (id null) or dragging one end of an existing one. */
  | { kind: 'connect'; id: string | null; which: 'start' | 'end'; fixed: ConnectorEnd; start: Pt; end: ConnectorEnd | null }
  | { kind: 'resize'; id: string; handle: Handle; orig: { x: number; y: number; width: number; height: number }; start: Pt }
  | { kind: 'marquee'; start: Pt; cur: Pt }
  | { kind: 'create'; tool: CreateTool; start: Pt; cur: Pt; parentId: string }
  | { kind: 'scale'; id: string; handle: Handle; orig: { x: number; y: number; width: number; height: number }; start: Pt; cur: { x: number; y: number; width: number; height: number } }
  | { kind: 'pen'; index: number };

type Ends = { start: ConnectorEnd; end: ConnectorEnd };
type CreateTool = 'frame' | 'rect' | 'ellipse' | 'polygon' | 'sticky' | 'embed';
const CREATE_TOOLS: ReadonlySet<Tool> = new Set<Tool>(['frame', 'rect', 'ellipse', 'polygon', 'sticky', 'embed']);
/** Size used when the person clicks instead of dragging (shapes centre on the click, the rest start there). */
const CLICK_SIZE: Record<CreateTool, [number, number]> = { frame: [400, 300], rect: [100, 100], ellipse: [100, 100], polygon: [100, 100], sticky: [200, 200], embed: [390, 844] };
const NAMES: Record<CreateTool, string> = { frame: 'Frame', rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon', sticky: 'Sticky note', embed: 'Web page' };

const cache = new FrameBitmapCache();
const DEFAULT_FILL: Record<string, string> = { frame: '#ffffff', rect: '#d4d4d8', ellipse: '#d4d4d8', polygon: '#d4d4d8', sticky: '#fde68a' };
let frameCounter = 1;
/** Line style of connectors drawn with the tool. */
const CONNECTOR_STROKE = { color: '#71717a', width: 2, align: 'center' };

export function Canvas() {
  const wrap = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const cursorLayer = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const extras = useRef<OverlayExtras>({});
  const spaceDown = useRef(false);
  /** Points of the path being drawn with the pen (page coordinates). */
  const pen = useRef<PenPoint[]>([]);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [cursor, setCursor] = useState('default');
  const frame = useRef(0);

  const doc = useStore((s) => s.doc);
  const rev = useStore((s) => s.rev);
  const camera = useStore((s) => s.camera);
  const selection = useStore((s) => s.selection);
  const hover = useStore((s) => s.hover);
  const tool = useStore((s) => s.tool);
  const cursors = useStore((s) => s.cursors);
  const fitRequest = useStore((s) => s.fitRequest);
  const editingText = useStore((s) => s.editingText);
  const pixelGrid = useStore((s) => s.pixelGrid);
  const bgJob = useStore((s) => s.bgJob);

  const redraw = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const st = useStore.getState();
      const dpr = window.devicePixelRatio || 1;
      const c = content.current, o = overlay.current;
      if (!c || !o) return;
      const ctx = c.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-canvas') || '#1b1b1e';
      ctx.fillRect(0, 0, c.width, c.height);
      const now = performance.now();
      if (st.doc) drawPage(ctx, st.doc, pageRoot(st.doc), st.camera, cache, dpr, size, changes.frame(st.doc, now));
      changes.drawGhosts(ctx, st.camera, dpr, now);
      if (st.doc && extras.current.lifted) drawLifted(ctx, st.doc, extras.current.lifted, st.camera, dpr);
      const octx = o.getContext('2d')!;
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, size.width, size.height);
      if (st.doc) drawOverlay(octx, st.doc, st, extras.current);
      // Change animations keep painting until they settle.
      if (changes.playing()) redraw();
    });
  };

  useLayoutEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    for (const c of [content.current, overlay.current, cursorLayer.current]) {
      if (!c) continue;
      c.width = Math.round(size.width * dpr);
      c.height = Math.round(size.height * dpr);
      c.style.width = `${size.width}px`;
      c.style.height = `${size.height}px`;
    }
    redraw();
  });

  useEffect(() => {
    const d = useStore.getState().doc;
    if (d) useStore.setState({ camera: fitCamera(d, size) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest]);

  useEffect(redraw, [doc, rev, camera, selection, hover, editingText, size, pixelGrid]);

  useEffect(() => onImageLoaded(() => { cache.invalidate(); redraw(); }));

  // Leaving the pen tool finishes the path in progress.
  useEffect(() => {
    if (tool !== 'pen' && pen.current.length) void finishPen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);
  // Agent session cursors animate on their own layer, so the design is not repainted every frame.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = cursorLayer.current;
      if (!el) return;
      const st = useStore.getState();
      const dpr = window.devicePixelRatio || 1;
      const ctx = el.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);
      const now = performance.now();
      const working = new Set([...Object.values(st.runs).map((r) => r.persona), ...st.agents.map((a) => a.name)]);
      const all = Object.values(st.cursors);
      const alive = all.filter((c) => cursorAlive(c, now, working.has(c.name)));
      if (alive.length !== all.length) useStore.setState({ cursors: Object.fromEntries(alive.map((c) => [c.id, c])) });
      drawCursors(ctx, st.camera, alive, working, now);
      if (alive.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cursors, size]);

  const pointer = (e: React.PointerEvent | React.WheelEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  /* ------------------------------- wheel ------------------------------- */
  const onWheel = (e: React.WheelEvent) => {
    const cam = useStore.getState().camera;
    const { sx, sy } = pointer(e);
    if (e.ctrlKey || e.metaKey) {
      const zoom = Math.min(64, Math.max(0.02, cam.zoom * Math.exp(-e.deltaY * 0.0025 * (e.deltaMode ? 30 : 1))));
      const w = toWorld(cam, sx, sy);
      useStore.setState({ camera: { zoom, x: sx - w.x * zoom, y: sy - w.y * zoom } });
    } else {
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      const dy = e.shiftKey ? 0 : e.deltaY;
      // A wheel over the selected web page scrolls the page, not the canvas.
      const st = useStore.getState();
      const sel = st.selection.length === 1 ? st.doc?.get(st.selection[0]!) : undefined;
      if (sel?.type === 'embed') {
        const w = toWorld(cam, sx, sy);
        const lx = w.x - sel.x, ly = w.y - sel.y;
        if (lx >= 0 && ly >= 0 && lx <= sel.width && ly <= sel.height && scrollEmbed(sel.id, lx, ly, dx, dy)) return;
      }
      useStore.setState({ camera: { ...cam, x: cam.x - dx, y: cam.y - dy } });
    }
  };

  /* ------------------------------ pointer ------------------------------ */
  const onPointerDown = (e: React.PointerEvent) => {
    const st = useStore.getState();
    if (!st.doc || st.editingText) return;
    if (st.interactEmbed) useStore.setState({ interactEmbed: null });
    if (st.openComment && st.tool !== 'comment') useStore.setState({ openComment: null, commentDraft: null });
    (e.target as Element).setPointerCapture(e.pointerId);
    const { sx, sy } = pointer(e);
    const w = toWorld(st.camera, sx, sy);
    const d = st.doc;

    if (e.button === 2) {
      // Right-click picks like a click (a hit inside the selection keeps it), then opens the menu.
      const label = labelHit(d, st.camera, sx, sy);
      const path = label ? [label] : hitPath(d, w.x, w.y);
      const hit = path.find((n) => st.selection.includes(n.id)) ?? pickFromPath(d, path, st.selection, e.ctrlKey || e.metaKey);
      if (!hit) select([]);
      else if (!st.selection.includes(hit.id)) select([hit.id]);
      useStore.setState({ contextMenu: { x: e.clientX, y: e.clientY, world: w } });
      return;
    }
    if (e.button === 1 || st.tool === 'hand' || spaceDown.current) {
      gesture.current = { kind: 'pan', sx, sy, cam: st.camera };
      setCursor('grabbing');
      return;
    }
    if (CREATE_TOOLS.has(st.tool)) {
      // Web pages and sticky notes sit on the page; shapes and frames go into the frame under the pointer.
      const parent = st.tool === 'embed' || st.tool === 'sticky' ? d.require(pageRoot(d)) : containerAt(d, w.x, w.y);
      gesture.current = { kind: 'create', tool: st.tool as CreateTool, start: w, cur: w, parentId: parent.id };
      return;
    }
    if (st.tool === 'pen') {
      const pts = pen.current;
      const first = pts[0];
      // Clicking the first point closes the shape.
      if (first && pts.length > 2 && Math.hypot(first.x - w.x, first.y - w.y) * st.camera.zoom < 8) { void finishPen(true); return; }
      pts.push({ x: w.x, y: w.y });
      gesture.current = { kind: 'pen', index: pts.length - 1 };
      showPen(w);
      return;
    }
    if (st.tool === 'comment') {
      const target = hitPath(d, w.x, w.y).at(-1);
      if (target) {
        const b = d.worldBounds(target.id);
        useStore.setState({ openComment: 'new', commentDraft: { nodeId: target.id, x: w.x - b.x, y: w.y - b.y } });
      } else useStore.setState({ openComment: 'new', commentDraft: { nodeId: null, x: w.x, y: w.y } });
      return;
    }
    if (st.tool === 'text') {
      void createText(w);
      return;
    }
    if (st.tool === 'connector') {
      gesture.current = { kind: 'connect', id: null, which: 'end', fixed: endAt(d, w, e.ctrlKey || e.metaKey).end, start: w, end: null };
      return;
    }

    // Ends of a selected connector: drag to reattach.
    const selConn = st.selection.length === 1 ? d.get(st.selection[0]!) : undefined;
    if (selConn?.type === 'connector') {
      const which = connectorHandleAt(d, selConn, w, st.camera.zoom);
      if (which) {
        gesture.current = { kind: 'connect', id: selConn.id, which, fixed: which === 'start' ? selConn.end : selConn.start, start: w, end: null };
        return;
      }
    }

    // Resize handle of a single selection.
    if (st.selection.length === 1 && selConn?.type !== 'connector') {
      const r = selectionBounds(d, st.selection)!;
      const tol = 6 / st.camera.zoom;
      for (const h of HANDLES) {
        const p = handlePoint(r, h);
        if (Math.abs(p.x - w.x) <= tol && Math.abs(p.y - w.y) <= tol) {
          const n = d.require(st.selection[0]!);
          const orig = { x: n.x, y: n.y, width: n.width, height: n.height };
          gesture.current = st.tool === 'scale'
            ? { kind: 'scale', id: n.id, handle: h, orig, start: w, cur: d.worldBounds(n.id) }
            : { kind: 'resize', id: n.id, handle: h, orig, start: w };
          return;
        }
      }
    }

    const label = labelHit(d, st.camera, sx, sy);
    const path = label ? [label] : hitPath(d, w.x, w.y);
    const inSelection = path.find((n) => st.selection.includes(n.id));
    let picked = inSelection ?? pickFromPath(d, path, st.selection, e.ctrlKey || e.metaKey);

    if (!picked) {
      if (!e.shiftKey) select([]);
      gesture.current = { kind: 'marquee', start: w, cur: w };
      return;
    }
    if (e.shiftKey) {
      select(st.selection.includes(picked.id) ? st.selection.filter((id) => id !== picked!.id) : [...st.selection, picked.id]);
      return;
    }
    if (!st.selection.includes(picked.id)) select([picked.id]);
    const ids = useStore.getState().selection;
    picked = d.require(ids[0]!);
    const orig = new Map(ids.map((id) => [id, { x: d.require(id).x, y: d.require(id).y }]));
    const ends = new Map(ids.flatMap((id) => { const n = d.require(id); return n.type === 'connector' ? [[id, { start: n.start, end: n.end }] as const] : []; }));
    gesture.current = { kind: 'move', start: w, ids, orig, ends, moved: false, reorder: null, drop: null };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = useStore.getState();
    const d = st.doc;
    if (!d) return;
    const { sx, sy } = pointer(e);
    const w = toWorld(st.camera, sx, sy);
    const g = gesture.current;

    if (!g) {
      if (st.tool === 'pen' && pen.current.length) showPen(w);
      if ((st.tool !== 'select' && st.tool !== 'scale') || spaceDown.current) { setCursor(st.tool === 'hand' || spaceDown.current ? 'grab' : 'crosshair'); return; }
      const hovered = st.selection.length === 1 ? d.get(st.selection[0]!) : undefined;
      if (hovered?.type === 'connector') {
        if (connectorHandleAt(d, hovered, w, st.camera.zoom)) { setCursor('crosshair'); return; }
      } else if (st.selection.length === 1) {
        const r = selectionBounds(d, st.selection)!;
        const tol = 6 / st.camera.zoom;
        const h = HANDLES.find((hh) => { const p = handlePoint(r, hh); return Math.abs(p.x - w.x) <= tol && Math.abs(p.y - w.y) <= tol; });
        if (h) { setCursor(handleCursor[h]); return; }
      }
      setCursor('default');
      const label = labelHit(d, st.camera, sx, sy);
      const target = label ?? pickFromPath(d, hitPath(d, w.x, w.y), st.selection, e.ctrlKey || e.metaKey);
      if ((target?.id ?? null) !== st.hover) useStore.setState({ hover: target?.id ?? null });
      return;
    }

    if (g.kind === 'pen') {
      // Dragging after placing a point pulls out symmetric curve handles.
      const p = pen.current[g.index];
      if (p && Math.hypot(w.x - p.x, w.y - p.y) * st.camera.zoom > 2) { p.out = { x: w.x, y: w.y }; p.in = { x: 2 * p.x - w.x, y: 2 * p.y - w.y }; }
      showPen(w);
    } else if (g.kind === 'scale') {
      const wb = d.worldBounds(g.id);
      const dx = w.x - g.start.x, dy = w.y - g.start.y;
      let { x, y } = wb;
      let width = g.orig.width, height = g.orig.height;
      if (g.handle.includes('e')) width += dx;
      if (g.handle.includes('s')) height += dy;
      if (g.handle.includes('w')) { width -= dx; x += dx; }
      if (g.handle.includes('n')) { height -= dy; y += dy; }
      // Scale keeps proportions; Shift on a side handle stretches one axis.
      if (!(e.shiftKey && g.handle.length === 1) && g.orig.width && g.orig.height) {
        const k = g.handle === 'n' || g.handle === 's' ? height / g.orig.height : width / g.orig.width;
        const nw = g.orig.width * k, nh = g.orig.height * k;
        x = g.handle.includes('w') ? wb.x + g.orig.width - nw : wb.x;
        y = g.handle.includes('n') ? wb.y + g.orig.height - nh : wb.y;
        width = nw; height = nh;
      }
      g.cur = { x, y, width: Math.max(1, width), height: Math.max(1, height) };
      extras.current = { create: g.cur };
      redraw();
    } else if (g.kind === 'connect') {
      const hit = endAt(d, w, e.ctrlKey || e.metaKey);
      // One node at both ends makes no line: that end stays free.
      if (hit.end.nodeId && hit.end.nodeId === g.fixed.nodeId) { hit.end = { ...hit.end, nodeId: null }; hit.box = null; }
      if (g.id) {
        const n = d.require(g.id) as ConnectorNode;
        const o = originOf(d, n.parentId!);
        g.end = { ...hit.end, x: round2(w.x - o.x), y: round2(w.y - o.y) };
        d.nodes.set(g.id, { ...n, [g.which]: g.end });
        routeConnectors(d);
        extras.current = { connect: { points: null, target: hit.box } };
        cache.invalidate();
        useStore.setState((s) => ({ rev: s.rev + 1 }));
      } else {
        g.end = hit.end;
        const from = { box: attachedBox(d, g.fixed.nodeId), point: { x: g.fixed.x, y: g.fixed.y }, side: g.fixed.side };
        extras.current = { connect: { points: connectorRoute(from, { box: hit.box, point: w, side: 'auto' }, 'elbow'), target: hit.box } };
        redraw();
      }
    } else if (g.kind === 'pan') {
      useStore.setState({ camera: { ...g.cam, x: g.cam.x + sx - g.sx, y: g.cam.y + sy - g.sy } });
    } else if (g.kind === 'marquee' || g.kind === 'create') {
      g.cur = w;
      extras.current = g.kind === 'marquee' ? { marquee: rectOf(g.start, w) } : { create: rectOf(g.start, w, e.shiftKey || g.tool === 'sticky') };
      redraw();
    } else if (g.kind === 'move') {
      const dx = w.x - g.start.x, dy = w.y - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) * st.camera.zoom < 3) return;
      g.moved = true;
      const first = d.require(g.ids[0]!);
      const parent = first.parentId ? d.get(first.parentId) : undefined;
      // Inside auto-layout: dragging reorders while the pointer stays in the frame; leaving it drags the layers out.
      if (parent?.type === 'frame' && parent.layout !== 'none' && !first.absolute && g.ids.every((id) => d.get(id)?.parentId === parent.id) && inside(d.worldBounds(parent.id), w)) {
        // Back inside after a trip out: the layers return to their slots.
        for (const id of g.ids) { const o = g.orig.get(id)!; const n = d.require(id); if (n.x !== o.x || n.y !== o.y) d.nodes.set(id, { ...n, x: o.x, y: o.y }); }
        const slot = layoutSlot(d, parent.id, w, new Set(g.ids));
        g.reorder = { parentId: parent.id, index: slot.index };
        g.drop = null;
        extras.current = { insertLine: slot.line };
        cache.invalidate();
        useStore.setState((s) => ({ rev: s.rev + 1 }));
        return;
      }
      g.reorder = null;
      for (const id of g.ids) {
        const o = g.orig.get(id)!;
        const n = d.require(id);
        const ends = g.ends.get(id);
        if (n.type === 'connector' && ends) {
          // Free ends follow the drag; attached ends stay on their nodes.
          const shift = (en: ConnectorEnd) => (attachedBox(d, en.nodeId, id) ? en : { ...en, x: round2(en.x + dx), y: round2(en.y + dy) });
          d.nodes.set(id, { ...n, start: shift(ends.start), end: shift(ends.end) });
        } else d.nodes.set(id, { ...n, x: Math.round(o.x + dx), y: Math.round(o.y + dy) });
      }
      routeConnectors(d);
      const exclude = new Set(g.ids);
      const target = containerAt(d, w.x, w.y, exclude);
      g.drop = target.id !== first.parentId ? target.id : null;
      // Dropping into an auto-layout frame shows where the layers will land.
      const slot = g.drop && target.type === 'frame' && target.layout !== 'none' ? layoutSlot(d, target.id, w, exclude) : null;
      // The dragged layers draw on top, so a clipping frame never hides them on the way out.
      extras.current = { dropTarget: g.drop, insertLine: slot?.line, lifted: g.ids };
      cache.invalidate();
      useStore.setState((s) => ({ rev: s.rev + 1 }));
    } else if (g.kind === 'resize') {
      const n = d.require(g.id);
      const o = g.orig;
      const dx = w.x - g.start.x, dy = w.y - g.start.y;
      let { x, y, width, height } = o;
      if (g.handle.includes('e')) width = o.width + dx;
      if (g.handle.includes('s')) height = o.height + dy;
      if (g.handle.includes('w')) { width = o.width - dx; x = o.x + dx; }
      if (g.handle.includes('n')) { height = o.height - dy; y = o.y + dy; }
      if (e.shiftKey && o.width && o.height) {
        const ratio = o.width / o.height;
        if (g.handle === 'n' || g.handle === 's') width = height * ratio; else height = width / ratio;
      }
      width = Math.max(1, Math.round(width));
      height = Math.max(1, Math.round(height));
      const patch: Partial<Node> = { x: Math.round(x), y: Math.round(y), width, height };
      d.nodes.set(g.id, { ...n, ...patch, ...sizingAfterResize(n, g.handle) } as Node);
      runLayout(d);
      cache.invalidate();
      useStore.setState((s) => ({ rev: s.rev + 1 }));
    }
  };

  const onPointerUp = async (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    extras.current = {};
    const st = useStore.getState();
    const d = st.doc;
    if (!g || !d) return;
    if (g.kind === 'pan') { setCursor(st.tool === 'hand' || spaceDown.current ? 'grab' : 'default'); return; }
    if (g.kind === 'pen') return;
    if (g.kind === 'scale') {
      redraw();
      const ops = scaleOps(d, g.id, g.cur);
      if (ops.length) await commit('Scale', ops);
      return;
    }

    if (g.kind === 'connect') {
      redraw();
      if (!g.end) return;
      if (g.id) {
        const n = d.require(g.id) as ConnectorNode;
        await commit('Reconnect', [{ op: 'update', id: g.id, patch: { [g.which]: n[g.which] } }]);
        return;
      }
      setTool('select');
      setCursor('default');
      const w = toWorld(st.camera, pointer(e).sx, pointer(e).sy);
      if (Math.hypot(w.x - g.start.x, w.y - g.start.y) * st.camera.zoom < 4) return;
      const input = { type: 'connector', name: 'Connector', start: g.fixed, end: g.end, strokes: [CONNECTOR_STROKE] } as unknown as NodeInput;
      const { ops, rootId } = insertOpsFor(input, pageRoot(d));
      if (await commit('Create connector', ops)) select([rootId]);
      return;
    }

    if (g.kind === 'marquee') {
      const r = rectOf(g.start, g.cur);
      if (r.width < 2 && r.height < 2) { redraw(); return; }
      const scope = st.selection[0] ? d.get(st.selection[0])?.parentId ?? pageRoot(d) : pageRoot(d);
      const hits = d.children(scope).filter((n) => n.visible && !n.locked && intersects(d.worldBounds(n.id), r)).map((n) => n.id);
      select(e.shiftKey ? [...new Set([...st.selection, ...hits])] : hits);
      redraw();
      return;
    }

    if (g.kind === 'create') {
      let r = rectOf(g.start, g.cur, e.shiftKey || g.tool === 'sticky');
      if (r.width < 3 && r.height < 3) {
        const [cw, ch] = CLICK_SIZE[g.tool];
        const centred = g.tool === 'rect' || g.tool === 'ellipse' || g.tool === 'polygon';
        r = { x: g.start.x - (centred ? cw / 2 : 0), y: g.start.y - (centred ? ch / 2 : 0), width: cw, height: ch };
      }
      const origin = originOf(d, g.parentId);
      const name = g.tool === 'frame' ? `Frame ${frameCounter++}` : NAMES[g.tool];
      const extra: Record<string, unknown> = g.tool === 'sticky'
        ? { effects: [{ color: '#00000026', x: 0, y: 2, blur: 8 }] }
        : g.tool === 'embed' ? { url: '' } : {};
      const fills = DEFAULT_FILL[g.tool] ? { fills: [DEFAULT_FILL[g.tool]] } : {};
      const input = { type: g.tool, name, x: Math.round(r.x - origin.x), y: Math.round(r.y - origin.y), width: Math.round(r.width), height: Math.round(r.height), ...fills, ...extra } as unknown as NodeInput;
      const { ops, rootId } = insertOpsFor(input, g.parentId);
      if (await commit(`Create ${name}`, ops)) {
        select([rootId]);
        if (g.tool === 'sticky') useStore.setState({ editingText: rootId });
      }
      setTool('select');
      setCursor('default');
      return;
    }

    if (g.kind === 'move' && g.moved) {
      const ops: Op[] = [];
      if (g.reorder) {
        const { parentId, index } = g.reorder;
        g.ids.forEach((id, i) => ops.push({ op: 'move', id, parentId, index: index + i }));
        await commit('Reorder', ops);
        return;
      }
      const target = g.drop ? d.require(g.drop) : null;
      const auto = target?.type === 'frame' && target.layout !== 'none';
      const w = toWorld(st.camera, pointer(e).sx, pointer(e).sy);
      const slot = target && auto ? layoutSlot(d, target.id, w, new Set(g.ids)).index : undefined;
      let placed = 0;
      for (const id of g.ids) {
        const n = d.require(id);
        if (n.type === 'connector') {
          const o = g.ends.get(id);
          if (o && JSON.stringify({ s: n.start, e: n.end }) !== JSON.stringify({ s: o.start, e: o.end })) ops.push({ op: 'update', id, patch: { start: n.start, end: n.end } });
          continue;
        }
        if (target) {
          const world = d.worldBounds(id);
          const origin = originOf(d, target.id);
          ops.push({ op: 'move', id, parentId: target.id, ...(slot !== undefined ? { index: slot + placed++ } : {}) });
          if (auto) continue;
          // Out of auto layout: keep the size it had there ("fill" means nothing in a free frame).
          const fixed = n.sizing.horizontal === 'fill' || n.sizing.vertical === 'fill'
            ? { sizing: { horizontal: n.sizing.horizontal === 'fill' ? 'fixed' : n.sizing.horizontal, vertical: n.sizing.vertical === 'fill' ? 'fixed' : n.sizing.vertical }, width: n.width, height: n.height }
            : {};
          ops.push({ op: 'update', id, patch: { x: Math.round(world.x - origin.x), y: Math.round(world.y - origin.y), ...fixed } });
        } else if (n.x !== g.orig.get(id)!.x || n.y !== g.orig.get(id)!.y) {
          ops.push({ op: 'update', id, patch: { x: n.x, y: n.y } });
        }
      }
      await commit(!target ? 'Move' : target.type === 'page' ? 'Move out of frame' : 'Move into frame', ops);
      return;
    }

    if (g.kind === 'resize') {
      const n = d.require(g.id);
      const patch: Record<string, unknown> = { x: n.x, y: n.y, width: n.width, height: n.height, sizing: n.sizing };
      if (n.type === 'text') patch.textSizing = n.textSizing;
      await commit('Resize', [{ op: 'update', id: g.id, patch }]);
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const st = useStore.getState();
    const d = st.doc;
    if (!d) return;
    if (st.tool === 'pen') { void finishPen(false); return; }
    const r = wrap.current!.getBoundingClientRect();
    const w = toWorld(st.camera, e.clientX - r.left, e.clientY - r.top);
    const path = hitPath(d, w.x, w.y);
    const sel = st.selection[0] ? d.get(st.selection[0]) : undefined;
    if ((sel?.type === 'text' || sel?.type === 'sticky') && path.some((p) => p.id === sel.id)) { useStore.setState({ editingText: sel.id }); return; }
    const embed = path.find((p) => p.type === 'embed');
    if (embed) { select([embed.id]); useStore.setState({ interactEmbed: embed.id }); return; }
    // Enter the selected container: pick the next level down under the pointer.
    const i = sel ? path.findIndex((p) => p.id === sel.id) : -1;
    const next = i >= 0 ? path[i + 1] : path.at(-1);
    if (next?.type === 'text' || next?.type === 'sticky') { select([next.id]); useStore.setState({ editingText: next.id }); }
    else if (next) select([next.id]);
  };

  function showPen(cursorAt: Pt | null) {
    extras.current = { pen: { points: pen.current, d: penPath(pen.current, false), cursor: cursorAt } };
    redraw();
  }

  /** Turns the pen points into a vector node; a single point is discarded. */
  async function finishPen(closed: boolean) {
    const pts = pen.current;
    pen.current = [];
    gesture.current = null;
    extras.current = {};
    redraw();
    const d = useStore.getState().doc;
    if (!d || pts.length < 2) return;
    const b = penBounds(pts, closed);
    const parent = containerAt(d, pts[0]!.x, pts[0]!.y);
    const o = originOf(d, parent.id);
    const input = {
      type: 'path', name: 'Vector', d: penPath(pts, closed), viewBox: b,
      x: round2(b.x - o.x), y: round2(b.y - o.y), width: Math.max(1, round2(b.width)), height: Math.max(1, round2(b.height)),
      // Dark ink inside a (light) frame; light ink straight on the dark page so the line stays visible.
      fills: closed ? ['#d4d4d8'] : [], strokes: [{ color: parent.type === 'frame' ? '#18181b' : '#d4d4d8', width: 2, align: 'center' }],
    } as unknown as NodeInput;
    const { ops, rootId } = insertOpsFor(input, parent.id);
    if (await commit('Draw vector', ops)) select([rootId]);
  }

  // Enter or Escape finishes the open path; Backspace removes the last point.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (useStore.getState().tool !== 'pen' || !pen.current.length || isTyping(e)) return;
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); void finishPen(false); }
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); e.stopImmediatePropagation(); pen.current.pop(); showPen(null); }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createText(w: Pt) {
    const d = useStore.getState().doc!;
    const parent = containerAt(d, w.x, w.y);
    const origin = originOf(d, parent.id);
    const { ops, rootId } = insertOpsFor({ type: 'text', name: 'Text', text: 'Text', x: Math.round(w.x - origin.x), y: Math.round(w.y - origin.y - 10), fills: ['#111111'] } as unknown as NodeInput, parent.id);
    if (await commit('Create text', ops)) {
      select([rootId]);
      useStore.setState({ editingText: rootId });
      setTool('select');
    }
  }

  /* ----------------------------- space to pan ---------------------------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) { spaceDown.current = true; setCursor('grab'); e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') { spaceDown.current = false; setCursor('default'); }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  return (
    <div ref={wrap} className="absolute inset-0 overflow-hidden bg-canvas" style={{ cursor }}
      onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerLeave={() => useStore.setState({ hover: null })} onDoubleClick={onDoubleClick} onContextMenu={(e) => e.preventDefault()}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(ASSET_MIME) && !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        // Photo files show the frame they will land in.
        if (e.dataTransfer.types.includes('Files') && useStore.getState().doc) {
          const r = wrap.current!.getBoundingClientRect();
          const w = toWorld(useStore.getState().camera, e.clientX - r.left, e.clientY - r.top);
          const target = containerAt(useStore.getState().doc!, w.x, w.y);
          const drop = target.type === 'frame' ? target.id : null;
          if (extras.current.dropTarget !== drop) { extras.current = { dropTarget: drop }; redraw(); }
        }
      }}
      onDragLeave={() => { if (extras.current.dropTarget) { extras.current = {}; redraw(); } }}
      onDrop={(e) => {
        e.preventDefault();
        extras.current = {};
        redraw();
        const r = wrap.current!.getBoundingClientRect();
        const at = toWorld(useStore.getState().camera, e.clientX - r.left, e.clientY - r.top);
        // An icon dragged from the Assets panel lands where it is dropped.
        const ref = e.dataTransfer.getData(ASSET_MIME);
        if (ref) { void insertAsset(ref, assetStyle(), at); return; }
        // Photos and SVG files from Explorer land under the pointer, inside the frame there.
        void dropFiles([...e.dataTransfer.files], at);
      }}>
      <canvas ref={content} className="absolute inset-0" />
      <canvas ref={overlay} className="absolute inset-0" />
      <EmbedLayer />
      <CommentsLayer />
      <canvas ref={cursorLayer} className="pointer-events-none absolute inset-0" />
      {doc && editingText && doc.get(editingText) && <TextEditor nodeId={editingText} camera={camera} />}
      {bgJob && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-panel-2 px-3 py-1 text-xs text-fg-muted shadow-lg">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          {bgJob.phase === 'download'
            ? `Downloading the background model (once) · ${Math.round(bgJob.progress * 100)}%`
            : 'Removing background on this computer…'}
        </div>
      )}
      {tool !== 'select' && !bgJob && <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-panel-2 px-3 py-1 text-xs text-fg-muted">{toolHint(tool)}</div>}
    </div>
  );
}

/* --------------------------------- helpers --------------------------------- */

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
};

function rectOf(a: Pt, b: Pt, square = false) {
  let w = b.x - a.x, h = b.y - a.y;
  if (square) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
  return { x: Math.min(a.x, a.x + w), y: Math.min(a.y, a.y + h), width: Math.abs(w), height: Math.abs(h) };
}

const intersects = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

const inside = (r: { x: number; y: number; width: number; height: number }, p: Pt) => p.x >= r.x && p.y >= r.y && p.x <= r.x + r.width && p.y <= r.y + r.height;

/** Where layers dropped at `w` land among an auto-layout frame's children, and the insert line to show. */
function layoutSlot(d: ArchaDocument, parentId: string, w: Pt, exclude: Set<string>): { index: number; line: { x1: number; y1: number; x2: number; y2: number } } {
  const parent = d.require(parentId);
  if (parent.type !== 'frame') return { index: 0, line: { x1: w.x, y1: w.y, x2: w.x, y2: w.y } };
  const origin = originOf(d, parent.id);
  const row = parent.layout === 'row';
  const pos = row ? w.x - origin.x : w.y - origin.y;
  const siblings = d.children(parent.id).filter((s) => !exclude.has(s.id) && !s.absolute);
  let index = siblings.findIndex((s) => pos < (row ? s.x + s.width / 2 : s.y + s.height / 2));
  if (index < 0) index = siblings.length;
  const before = siblings[index - 1], after = siblings[index];
  const at = after ? (row ? after.x : after.y) - parent.gap / 2 : before ? (row ? before.x + before.width : before.y + before.height) + parent.gap / 2 : (row ? parent.padding.left : parent.padding.top);
  // The op index counts every child, absolute ones and the dragged layers included.
  const all = d.children(parent.id).filter((s) => !exclude.has(s.id));
  const opIndex = after ? all.findIndex((s) => s.id === after.id) : all.length;
  return {
    index: opIndex,
    line: row
      ? { x1: origin.x + at, y1: origin.y + parent.padding.top, x2: origin.x + at, y2: origin.y + parent.height - parent.padding.bottom }
      : { x1: origin.x + parent.padding.left, y1: origin.y + at, x2: origin.x + parent.width - parent.padding.right, y2: origin.y + at },
  };
}

function sizingAfterResize(n: Node, h: Handle): Partial<Node> {
  const horiz = h.includes('e') || h.includes('w');
  const vert = h.includes('n') || h.includes('s');
  const sizing = { horizontal: horiz ? 'fixed' as const : n.sizing.horizontal, vertical: vert ? 'fixed' as const : n.sizing.vertical };
  if (n.type === 'text') return { sizing, textSizing: vert ? 'fixed' : horiz ? 'auto-height' : n.textSizing } as Partial<Node>;
  return { sizing };
}

/** Frame name labels above top-level frames are clickable (selects the frame). */
function labelHit(d: NonNullable<ReturnType<typeof useStore.getState>['doc']>, cam: Camera, sx: number, sy: number): Node | null {
  const root = d.get(pageRoot(d));
  if (!root || !isContainer(root)) return null;
  for (let i = root.children.length - 1; i >= 0; i--) {
    const n = d.get(root.children[i]!);
    if (!n || n.type !== 'frame' || !n.visible) continue;
    const x = n.x * cam.zoom + cam.x, y = n.y * cam.zoom + cam.y;
    const w = Math.min(n.width * cam.zoom, n.name.length * 6.5 + 8);
    if (sx >= x && sx <= x + w && sy >= y - 18 && sy <= y - 2) return n;
  }
  return null;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Dragged layers whose frame clips them are drawn again on top, whole, so they stay visible on their way out. */
function drawLifted(ctx: CanvasRenderingContext2D, d: ArchaDocument, ids: string[], cam: Camera, dpr: number) {
  for (const id of ids) {
    const n = d.get(id);
    if (!n?.parentId || n.type === 'connector') continue;
    let clipped = false;
    for (let p = d.get(n.parentId); p && p.type !== 'page'; p = p.parentId ? d.get(p.parentId) : undefined) if (p.type === 'frame' && p.clip) { clipped = true; break; }
    if (!clipped) continue;
    const o = originOf(d, n.parentId);
    ctx.save();
    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (cam.x + o.x * cam.zoom), dpr * (cam.y + o.y * cam.zoom));
    drawNode(ctx, d, n);
    ctx.restore();
  }
}

/**
 * A connector end at page point `w`: stuck to the node under it, or free. The top-level node wins
 * (a whole screen in a page map); Ctrl picks the deepest one. Connectors are never targets.
 */
function endAt(d: ArchaDocument, w: Pt, deep: boolean): { end: ConnectorEnd; box: { x: number; y: number; width: number; height: number } | null } {
  const lines = new Set([...d.nodes.values()].filter((n) => n.type === 'connector').map((n) => n.id));
  const path = hitPath(d, w.x, w.y, lines);
  const t = deep ? path.at(-1) : path[0];
  return { end: { nodeId: t?.id ?? null, side: 'auto', x: round2(w.x), y: round2(w.y) }, box: t ? d.worldBounds(t.id) : null };
}

/** Which end handle of a connector is under `w`, if any. */
function connectorHandleAt(d: ArchaDocument, n: ConnectorNode, w: Pt, zoom: number): 'start' | 'end' | null {
  const ends = connectorEnds(d, n.id);
  if (!ends) return null;
  const tol = 8 / zoom;
  if (Math.hypot(ends.end.x - w.x, ends.end.y - w.y) <= tol) return 'end';
  if (Math.hypot(ends.start.x - w.x, ends.start.y - w.y) <= tol) return 'start';
  return null;
}

const toolHint = (t: string) => ({
  frame: 'Drag to draw a frame · click for 400×300', rect: 'Drag to draw a rectangle · Shift for square', ellipse: 'Drag to draw an ellipse · Shift for circle',
  polygon: 'Drag to draw a polygon · Shift keeps it even', text: 'Click to place text', hand: 'Drag to pan', scale: 'Drag a handle to scale everything inside, text and strokes too',
  pen: 'Click to add points · drag for curves · click the first point to close · Enter to finish', sticky: 'Click to add a sticky note',
  embed: 'Drag to place a web page · double-click it to scroll and click inside', connector: 'Drag from a shape to another · Ctrl targets the layer inside', comment: 'Click anywhere to leave a comment',
}[t] ?? '');
