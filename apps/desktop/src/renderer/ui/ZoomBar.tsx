import { Minus, Plus } from 'lucide-react';
import { useStore } from '../lib/store';

export function ZoomBar() {
  const zoom = useStore((s) => s.camera.zoom);
  const setZoom = (z: number) => {
    const { camera } = useStore.getState();
    const el = document.querySelector('[data-canvas-host]')!;
    const cx = el.clientWidth / 2, cy = el.clientHeight / 2;
    const wx = (cx - camera.x) / camera.zoom, wy = (cy - camera.y) / camera.zoom;
    const zoomed = Math.min(64, Math.max(0.02, z));
    useStore.setState({ camera: { zoom: zoomed, x: cx - wx * zoomed, y: cy - wy * zoomed } });
  };
  return (
    <div className="pointer-events-auto flex h-9 items-center gap-1 rounded-xl border border-line bg-panel px-1 shadow-xl shadow-black/30">
      <button title="Zoom out (-)" onClick={() => setZoom(zoom / 1.25)} className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted hover:bg-panel-3 hover:text-fg"><Minus size={14} /></button>
      <button title="Zoom to fit (Shift+1)" onClick={() => useStore.setState((s) => ({ fitRequest: s.fitRequest + 1 }))} className="w-14 rounded-lg py-1 text-center text-[12px] font-medium hover:bg-panel-3">{Math.round(zoom * 100)}%</button>
      <button title="Zoom in (+)" onClick={() => setZoom(zoom * 1.25)} className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted hover:bg-panel-3 hover:text-fg"><Plus size={14} /></button>
    </div>
  );
}
