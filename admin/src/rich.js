// Texto das notícias: o editor trabalha em HTML, mas o que se guarda é JSON estruturado
// (parágrafos, listas, negrito e links). Nenhum HTML chega à base de dados nem ao site.

const SAFE_HREF = /^(https?:\/\/[^\s<>"]+|mailto:[^\s<>"]+)$/i;

export function normalizeHref(h) {
  let v = String(h || '').trim();
  if (!v) return '';
  if (/^www\./i.test(v)) v = 'https://' + v;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) v = 'mailto:' + v;
  return SAFE_HREF.test(v) ? v : '';
}

function pushPart(parts, text, bold, href) {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last && !!last.bold === !!bold && (last.href || '') === (href || '')) { last.text += text; return; }
  const p = { text };
  if (bold) p.bold = true;
  if (href) p.href = href;
  parts.push(p);
}

function inline(node, parts, bold, href) {
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { pushPart(parts, n.nodeValue.replace(/ /g, ' '), bold, href); continue; }
    if (n.nodeType !== 1) continue;
    const tag = n.tagName;
    if (tag === 'BR') { pushPart(parts, '\n', bold, href); continue; }
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' || tag === 'OBJECT') continue;
    const isBold = bold || tag === 'B' || tag === 'STRONG' || /^(bold|[6-9]00)$/.test(n.style && n.style.fontWeight);
    const h = tag === 'A' ? normalizeHref(n.getAttribute('href')) : href;
    inline(n, parts, isBold, h || href);
  }
}

function tidy(parts) {
  // remove espaços/quebras nas pontas e partes vazias
  while (parts.length && !parts[0].text.replace(/^[\s\n]+/, '')) parts.shift();
  if (parts.length) parts[0].text = parts[0].text.replace(/^[\s\n]+/, '');
  while (parts.length && !parts[parts.length - 1].text.replace(/[\s\n]+$/, '')) parts.pop();
  if (parts.length) parts[parts.length - 1].text = parts[parts.length - 1].text.replace(/[\s\n]+$/, '');
  return parts.filter((p) => p.text);
}

/** HTML do editor → blocos seguros */
export function htmlToBlocks(root) {
  const blocks = [];
  let loose = [];
  const flush = () => { const p = tidy(loose); if (p.length) blocks.push({ type: 'p', parts: p }); loose = []; };
  for (const n of root.childNodes) {
    if (n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL')) {
      flush();
      const items = [];
      for (const li of n.children) {
        const p = []; inline(li, p, false, '');
        const t = tidy(p); if (t.length) items.push(t);
      }
      if (items.length) blocks.push({ type: n.tagName.toLowerCase(), items });
    } else if (n.nodeType === 1 && /^(P|DIV|H[1-6]|BLOCKQUOTE)$/.test(n.tagName)) {
      flush();
      // listas dentro de divs (colagens) também são aceites
      if (n.querySelector('ul,ol')) { blocks.push(...htmlToBlocks(n)); continue; }
      const p = []; inline(n, p, /^H[1-6]$/.test(n.tagName), '');
      const t = tidy(p); if (t.length) blocks.push({ type: 'p', parts: t });
    } else {
      const tmp = document.createElement('span'); tmp.appendChild(n.cloneNode(true));
      inline(tmp, loose, false, '');
    }
  }
  flush();
  return blocks;
}

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function partsHtml(parts) {
  return (parts || []).map((p) => {
    let t = esc(p.text).replace(/\n/g, '<br>');
    if (p.bold) t = '<strong>' + t + '</strong>';
    const h = normalizeHref(p.href);
    if (h) t = '<a href="' + esc(h) + '">' + t + '</a>';
    return t;
  }).join('');
}

/** Blocos → HTML para carregar no editor (tudo escapado) */
export function blocksToHtml(blocks) {
  return (blocks || []).map((b) => {
    if (b.type === 'p') return '<p>' + partsHtml(b.parts) + '</p>';
    const tag = b.type === 'ol' ? 'ol' : 'ul';
    return '<' + tag + '>' + (b.items || []).map((it) => '<li>' + partsHtml(it) + '</li>').join('') + '</' + tag + '>';
  }).join('') || '<p><br></p>';
}

export function blocksWordCount(blocks) {
  const t = (blocks || []).map((b) => b.type === 'p' ? b.parts.map((p) => p.text).join('') : (b.items || []).map((i) => i.map((p) => p.text).join('')).join(' ')).join(' ');
  return t.split(/\s+/).filter(Boolean).length;
}
