import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExecuteResult } from '@archa/protocol';
import { readPdfPage, summarizePage } from '@archa/mcp';
import { assetFile } from '@archa/protocol/node';
import { newHost } from './helpers';

/* Rebuild from a reference (blueprint MCP/05) and the execute helpers that go with it. */

let home: string;
let work: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'archa-ref-'));
  work = mkdtempSync(join(tmpdir(), 'archa-refwork-'));
  process.env.ARCHA_HOME = home;
});
afterEach(() => {
  delete process.env.ARCHA_HOME;
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

/** A one-page PDF (200×200): a red rect, blue "Hello World" at 24 pt, a 2×1 px image scaled to 40×20. */
function makePdf(): Buffer {
  const content = '1 0 0 rg 10 10 100 50 re f\n0 0 1 rg BT /F1 24 Tf 20 100 Td (Hello World) Tj ET\nq 40 0 0 20 150 20 cm /Im1 Do Q\n';
  const img = Buffer.concat([Buffer.from('<< /Type /XObject /Subtype /Image /Width 2 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 6 >>\nstream\n', 'latin1'), Buffer.from([255, 0, 0, 0, 255, 0]), Buffer.from('\nendstream', 'latin1')]);
  const objs: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> >>'),
    Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}endstream`, 'latin1'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
    img,
  ];
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [];
  let len = parts[0]!.length;
  objs.forEach((o, i) => {
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from('\nendobj\n')]);
    offsets.push(len);
    parts.push(chunk);
    len += chunk.length;
  });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF\n`;
  return Buffer.concat([...parts, Buffer.from(xref)]);
}

describe('reference', () => {
  it('reads text lines, shapes and images (into the asset folder) from a PDF page', async () => {
    const pdf = join(work, 'mock.pdf');
    writeFileSync(pdf, makePdf());
    const assets = join(work, 'mock-asset');
    const p = await readPdfPage(pdf, 1, assets);
    expect(p).toMatchObject({ page: 1, pages: 1, width: 200, height: 200 });
    expect(p.texts).toHaveLength(1);
    expect(p.texts[0]).toMatchObject({ text: 'Hello World', x: 20, baseline: 100, fontSize: 24 });
    expect(p.shapes).toContainEqual(expect.objectContaining({ kind: 'rect', x: 10, y: 140, width: 100, height: 50, fill: '#ff0000' }));
    expect(p.images).toHaveLength(1);
    expect(p.images[0]).toMatchObject({ x: 150, y: 160, width: 40, height: 20, pixelWidth: 2, pixelHeight: 1 });
    expect(existsSync(assetFile(assets, p.images[0]!.src)!)).toBe(true);
    const summary = summarizePage(p, { json: 'x.json' });
    expect(summary).toContain('24px×1 "Hello World"');
    expect(summary).toContain('#ff0000');
    await expect(readPdfPage(pdf, 3, assets)).rejects.toThrow(/has 1 page/);
  }, 60_000);
});

describe('execute helpers', () => {
  const conn = { id: 'c1', author: { kind: 'agent' as const, id: 'a', name: 'Test' }, client: { kind: 'mcp' as const, name: 't' } };
  const run = (ws: ReturnType<typeof newHost>, code: string) => (ws.handlers['agent.execute'] as unknown as (p: unknown, c: unknown) => Promise<ExecuteResult>)({ code }, conn);

  it('image() copies a file into the asset folder at its natural size', async () => {
    const ws = newHost();
    const png = join(work, 'photo.png');
    // 3×2 PNG header is enough for the size; the bytes are copied as they are.
    const head = Buffer.alloc(33);
    head.writeUInt32BE(0x89504e47, 0); head.writeUInt32BE(0x0d0a1a0a, 4); head.writeUInt32BE(13, 8); head.write('IHDR', 12, 'latin1');
    head.writeUInt32BE(300, 16); head.writeUInt32BE(200, 20);
    writeFileSync(png, head);
    const r = await run(ws, `a = image(${JSON.stringify(png)}, null, { width: 150 }); print(JSON.stringify(get(a)))`);
    if (!r.ok) throw new Error(r.reason);
    const node = JSON.parse(r.output.find((o) => o.startsWith('{'))!);
    expect(node).toMatchObject({ type: 'image', name: 'photo', width: 150, height: 100 });
    expect(node.src).toMatch(/^asset:images\//);
    expect(readFileSync(assetFile(ws.ctx.assetDir(ws.ctx.session()), node.src)!).length).toBe(33);
    const bad = await run(ws, `image("C:/nope/missing.png", null)`);
    expect(bad.ok).toBe(false);
  }, 60_000);

  it('bind() links a node to variables by name; setVariable re-themes it', async () => {
    const ws = newHost();
    const r = await run(ws, `setVariable("color/accent", "#e13044"); b = insert(null, { type: "rect", name: "B", fills: ["#000000"] }); bind(b, { fill: "color/accent" }); setVariable("color/accent", "#0b74de"); print(JSON.stringify(get(b).bind))`);
    if (!r.ok) throw new Error(r.reason);
    const s = ws.ctx.session();
    const b = [...s.doc.nodes.values()].find((n) => n.name === 'B')!;
    expect(b.type === 'rect' && b.fills[0]!.type === 'solid' && b.fills[0]!.color.h).toBeGreaterThan(200);
    const bad = await run(ws, `bind("B", { fill: "color/none" })`);
    expect(!bad.ok && bad.reason).toMatch(/no variable/);
  }, 60_000);
});
