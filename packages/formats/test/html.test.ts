import { describe, expect, it } from 'vitest';
import { ArchaDocument, DocumentSession, insertOpsFor } from '@archa/core';
import { exportHtml, exportHtmlStandalone, tailwindClasses } from '../src';

function card() {
  const s = new DocumentSession(ArchaDocument.create('Export'));
  const root = s.doc.pages[0]!.rootId;
  const { ops, rootId } = insertOpsFor({ type: 'frame', name: 'Pricing Card', layout: 'column', gap: 12, padding: 24, cornerRadius: 16, sizing: { horizontal: 'fixed', vertical: 'hug' }, width: 320, fill: '#ffffff',
    strokes: [{ color: '#e4e4e7', width: 1, align: 'inside' }], effects: [{ color: '#0000001a', x: 0, y: 4, blur: 12 }], children: [
      { type: 'text', name: 'Title', text: 'Pro <plan>', fontSize: 24, fontWeight: 700, fill: '#111111' },
      { type: 'frame', name: 'Row', layout: 'row', gap: 8, sizing: { horizontal: 'fill', vertical: 'hug' }, align: 'center', children: [
        { type: 'ellipse', name: 'Dot', width: 8, height: 8, fill: '#22c55e' },
        { type: 'text', name: 'Label', text: 'Unlimited', fill: '#52525b' },
      ] },
      { type: 'image', name: 'Logo', width: 40, height: 40, src: 'data:image/png;base64,iVBORw0KGgo=' },
      { type: 'polygon', name: 'Badge', sides: 6, width: 20, height: 20, fill: '#8b5cf6' },
      { type: 'rect', name: 'Pinned', absolute: true, x: 290, y: 10, width: 20, height: 20, fill: '#ef4444' },
    ] } as never, root);
  s.apply({ author: { kind: 'user', id: 'u' }, label: 'x', baseRevision: 0, ops });
  return { doc: s.doc, id: rootId };
}

describe('HTML export', () => {
  it('writes HTML + CSS with flexbox, hug, fill and absolute children', () => {
    const { doc, id } = card();
    const files = exportHtml(doc, id, { style: 'css' });
    expect(files.map((f) => f.path)).toEqual(['pricing-card.html', 'pricing-card.css', 'pricing-card-assets/image-1.png']);
    const html = String(files[0]!.data), css = String(files[1]!.data);
    expect(html).toContain('<link rel="stylesheet" href="pricing-card.css">');
    expect(html).toContain('<p class="title">Pro &lt;plan&gt;</p>');
    expect(html).toContain('src="pricing-card-assets/image-1.png"');
    expect(html).toMatch(/<svg class="badge" viewBox=[^>]*><polygon/);
    expect(html).toContain('family=Inter:wght@400;700');
    expect(css).toMatch(/\.pricing-card \{[^}]*width: 320px;[^}]*display: flex;[^}]*flex-direction: column;[^}]*gap: 12px;[^}]*padding: 24px 24px 24px 24px;/s);
    expect(css).not.toMatch(/\.pricing-card \{[^}]*height:/s); // hug → auto
    expect(css).toMatch(/\.pricing-card \{[^}]*box-shadow: inset 0 0 0 1px #e4e4e7, 0px 4px 12px #0000001a;/s);
    expect(css).toMatch(/\.row \{[^}]*align-self: stretch;/s);
    expect(css).toMatch(/\.pinned \{[^}]*position: absolute;[^}]*left: 290px;[^}]*top: 10px;/s);
    expect(css).toMatch(/\.dot \{[^}]*border-radius: 50%;/s);
    expect(files[2]!.data).toBeInstanceOf(Uint8Array);
  });

  it('writes one HTML file with Tailwind classes', () => {
    const { doc, id } = card();
    const files = exportHtml(doc, id, { style: 'tailwind', name: 'Card' });
    expect(files[0]!.path).toBe('Card.html');
    const html = String(files[0]!.data);
    expect(html).toContain('@tailwindcss/browser@4');
    expect(html).toMatch(/class="relative w-\[320px\] bg-\[#ffffff\] rounded-\[16px\] shadow-\[inset_0_0_0_1px_#e4e4e7,0px_4px_12px_#0000001a\] flex flex-col gap-\[12px\] p-\[24px\] items-start overflow-hidden"/);
    expect(html).toContain('text-[length:24px] font-bold');
    expect(html).toContain('self-stretch');
  });

  it('inlines CSS and images for the standalone (PDF) page', () => {
    const { doc, id } = card();
    const page = exportHtmlStandalone(doc, id);
    expect(page).toContain('<style>');
    expect(page).not.toContain('.css"');
    expect(page).toContain('src="data:image/png;base64,');
  });

  it('maps declarations to Tailwind utilities', () => {
    expect(tailwindClasses([['padding', '8px 16px 8px 16px'], ['font-family', "'Segoe UI', sans-serif"], ['flex', '1 1 0'], ['font-weight', '650']]))
      .toEqual(['py-[8px]', 'px-[16px]', "[font-family:'Segoe_UI',sans-serif]", 'flex-1', '[font-weight:650]']);
  });
});
