import { useEffect, useRef, useState } from 'preact/hooks';
import { htmlToBlocks, blocksToHtml, normalizeHref } from './rich.js';
import { Icon } from './ui.jsx';

/**
 * Editor simples: parágrafos, negrito, listas e links.
 * O conteúdo sai sempre como blocos seguros (ver rich.js) — nunca HTML.
 */
export function RichEditor({ initial, api, onChange }) {
  const ed = useRef();
  const saved = useRef(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [linkErr, setLinkErr] = useState('');
  const [state, setState] = useState({});

  useEffect(() => {
    ed.current.innerHTML = blocksToHtml(initial);
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
  }, []);
  api.current = { get: () => htmlToBlocks(ed.current) };

  const refresh = () => {
    try {
      setState({ b: document.queryCommandState('bold'), ul: document.queryCommandState('insertUnorderedList'), ol: document.queryCommandState('insertOrderedList') });
    } catch (e) {}
  };
  useEffect(() => { document.addEventListener('selectionchange', refresh); return () => document.removeEventListener('selectionchange', refresh); }, []);

  const cmd = (c, v) => { ed.current.focus(); document.execCommand(c, false, v); onChange && onChange(); refresh(); };

  function onPaste(e) {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    let clean;
    if (html) {
      const tmp = document.createElement('div');
      tmp.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
      clean = blocksToHtml(htmlToBlocks(tmp));
    } else {
      clean = text.split(/\n{2,}/).map((p) => '<p>' + p.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/\n/g, '<br>') + '</p>').join('');
    }
    document.execCommand('insertHTML', false, clean);
    onChange && onChange();
  }

  function openLink() {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !ed.current.contains(sel.anchorNode)) { setLinkErr('Selecione primeiro o texto do link.'); setLinkOpen(true); saved.current = null; return; }
    saved.current = sel.getRangeAt(0).cloneRange();
    const a = sel.anchorNode.parentElement && sel.anchorNode.parentElement.closest('a');
    setUrl(a ? a.getAttribute('href') : ''); setLinkErr(''); setLinkOpen(true);
  }
  function applyLink(e) {
    e && e.preventDefault();
    if (!saved.current) { setLinkOpen(false); return; }
    const h = normalizeHref(url);
    if (!h) { setLinkErr('Use um endereço https://… ou um email.'); return; }
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(saved.current);
    cmd('createLink', h);
    setLinkOpen(false); setUrl('');
  }

  return (
    <div class="rte">
      <div class="rte-bar" role="toolbar" aria-label="Formatação do texto">
        <button type="button" class={state.b ? 'on' : ''} aria-pressed={!!state.b} title="Negrito" aria-label="Negrito" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('bold')}><Icon name="bold" /></button>
        <button type="button" class={state.ul ? 'on' : ''} aria-pressed={!!state.ul} title="Lista" aria-label="Lista com marcas" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('insertUnorderedList')}><Icon name="list" /></button>
        <button type="button" class={state.ol ? 'on' : ''} aria-pressed={!!state.ol} title="Lista numerada" aria-label="Lista numerada" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('insertOrderedList')}><Icon name="olist" /></button>
        <span class="sep" />
        <button type="button" title="Inserir link" aria-label="Inserir link" onMouseDown={(e) => e.preventDefault()} onClick={openLink}><Icon name="link" /></button>
        <button type="button" title="Remover link" aria-label="Remover link" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('unlink')}><Icon name="unlink" /></button>
      </div>
      {linkOpen && (
        <form class="rte-link" onSubmit={applyLink}>
          {saved.current && <input type="url" inputMode="url" placeholder="https://…" value={url} onInput={(e) => setUrl(e.currentTarget.value)} autoFocus aria-label="Endereço do link" />}
          {linkErr && <span class="err">{linkErr}</span>}
          {saved.current && <button class="btn primary sm" type="submit">Aplicar</button>}
          <button class="btn ghost sm" type="button" onClick={() => setLinkOpen(false)}>Fechar</button>
        </form>
      )}
      <div ref={ed} class="rte-area" contentEditable role="textbox" aria-multiline="true" aria-label="Texto da notícia"
        onInput={() => onChange && onChange()} onPaste={onPaste} onKeyUp={refresh} onMouseUp={refresh}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); cmd('bold'); } }} />
    </div>
  );
}
