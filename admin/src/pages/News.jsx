import { useEffect, useRef, useState } from 'preact/hooks';
import { sb, must, errMsg, publicUrl, BUCKET_NEWS } from '../supabase.js';
import { Btn, Field, Icon, PageHead, Spinner, Empty, toast, confirmDialog, fmtDate, today } from '../ui.jsx';
import { RichEditor } from '../RichEditor.jsx';

export const CATEGORIES = ['Clube', 'Futebol', 'Formação'];
const MAX_IMG = 5 * 1024 * 1024;

function slugify(t) {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '') || 'noticia';
}
async function uniqueSlug(base) {
  const rows = await must(sb.from('news').select('slug').like('slug', base + '%'));
  const used = new Set(rows.map((r) => r.slug));
  if (!used.has(base)) return base;
  let i = 2; while (used.has(base + '-' + i)) i++;
  return base + '-' + i;
}
function ourPath(url) {
  const m = String(url || '').match(/\/storage\/v1\/object\/public\/noticias\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}
async function removeCover(url) {
  const p = ourPath(url);
  if (p) await sb.storage.from(BUCKET_NEWS).remove([p]);
}

// Reduz fotografias grandes antes de enviar (máx. 1920 px).
async function prepareImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use uma imagem JPG, PNG ou WebP.');
  if (file.size > 20 * 1024 * 1024) throw new Error('A imagem tem mais de 20 MB.');
  const bmp = await createImageBitmap(file).catch(() => { throw new Error('Não foi possível ler a imagem.'); });
  const scale = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size <= MAX_IMG) { bmp.close && bmp.close(); return { blob: file, ext: file.type.split('/')[1].replace('jpeg', 'jpg'), type: file.type }; }
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
  if (!blob || blob.size > MAX_IMG) throw new Error('A imagem continua demasiado grande (máx. 5 MB).');
  return { blob, ext: 'jpg', type: 'image/jpeg' };
}

const FILTERS = [['all', 'Todas'], ['published', 'Publicadas'], ['draft', 'Rascunhos']];

export function NewsList() {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const load = () => sb.from('news').select('id, slug, title, category, cover_url, published_at, status, updated_at').order('published_at', { ascending: false }).order('created_at', { ascending: false })
    .then(({ data, error }) => { if (error) { toast.err(errMsg(error)); setRows([]); } else setRows(data); });
  useEffect(() => { load(); }, []);

  async function setStatus(n, status) {
    setBusy(n.id);
    try {
      await must(sb.from('news').update({ status }).eq('id', n.id).select('id').single());
      toast.ok(status === 'published' ? 'Notícia publicada.' : 'Notícia despublicada.');
      await load();
    } catch (e) { toast.err(errMsg(e)); }
    setBusy('');
  }
  async function del(n) {
    if (!(await confirmDialog({ title: 'Eliminar notícia?', text: `"${n.title}" deixa de existir no site e no painel. Esta ação não pode ser desfeita.`, ok: 'Eliminar', danger: true }))) return;
    setBusy(n.id);
    try {
      await must(sb.from('news').delete().eq('id', n.id).select('id').single());
      await removeCover(n.cover_url).catch(() => {});
      toast.ok('Notícia eliminada.');
      await load();
    } catch (e) { toast.err(errMsg(e)); }
    setBusy('');
  }

  const list = (rows || []).filter((n) => (f === 'all' || n.status === f) && (!q || n.title.toLowerCase().includes(q.toLowerCase())));
  return (
    <section>
      <PageHead title="Notícias"><a class="btn primary" href="#/noticias/nova"><Icon name="plus" /><span>Nova notícia</span></a></PageHead>
      <div class="toolbar">
        <div class="seg" role="tablist">
          {FILTERS.map(([k, l]) => <button key={k} role="tab" aria-selected={f === k} class={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}
        </div>
        <input class="search" type="search" placeholder="Procurar por título" aria-label="Procurar notícias" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      </div>
      {!rows ? <Spinner /> : !list.length ? <Empty>Sem notícias {f === 'draft' ? 'em rascunho' : f === 'published' ? 'publicadas' : ''}.</Empty> : (
        <ul class="list">
          {list.map((n) => (
            <li class="item" key={n.id} data-testid="news-row">
              <div class="thumb">{n.cover_url ? <img src={n.cover_url} alt="" loading="lazy" /> : <Icon name="news" />}</div>
              <div class="item-main">
                <a class="item-t" href={'#/noticias/' + n.id}>{n.title}</a>
                <span class="item-m">{fmtDate(n.published_at)} · {n.category} · <span class={'badge ' + n.status}>{n.status === 'published' ? 'Publicada' : 'Rascunho'}</span></span>
              </div>
              <div class="item-a">
                <a class="btn ghost sm" href={'#/noticias/' + n.id}><Icon name="edit" /><span>Editar</span></a>
                {n.status === 'published'
                  ? <Btn kind="ghost sm" icon="eyeoff" busy={busy === n.id} onClick={() => setStatus(n, 'draft')}>Despublicar</Btn>
                  : <Btn kind="ok sm" icon="check" busy={busy === n.id} onClick={() => setStatus(n, 'published')}>Publicar</Btn>}
                <button class="iconbtn danger" aria-label={'Eliminar ' + n.title} title="Eliminar" disabled={busy === n.id} onClick={() => del(n)}><Icon name="trash" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function NewsForm({ id }) {
  const [n, setN] = useState(id ? null : { title: '', category: 'Clube', published_at: today(), cover_url: '', body: [], status: 'draft' });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState('');
  const [img, setImg] = useState(null); // { blob, ext, type, preview }
  const [dirty, setDirty] = useState(false);
  const bodyRef = useRef({ get: () => [] });
  const fileRef = useRef();

  useEffect(() => {
    if (!id) return;
    sb.from('news').select('*').eq('id', id).maybeSingle().then(({ data, error }) => {
      if (error || !data) { toast.err(error ? errMsg(error) : 'Notícia não encontrada.'); location.hash = '#/noticias'; return; }
      setN(data);
    });
  }, [id]);
  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!n) return <Spinner />;
  const set = (k, v) => { setN({ ...n, [k]: v }); setDirty(true); };

  async function pick(e) {
    const file = e.currentTarget.files[0]; e.currentTarget.value = '';
    if (!file) return;
    try { const r = await prepareImage(file); setImg({ ...r, preview: URL.createObjectURL(r.blob) }); setDirty(true); setErrs({ ...errs, cover: '' }); }
    catch (er) { setErrs({ ...errs, cover: er.message }); }
  }

  async function save(status) {
    const body = bodyRef.current.get();
    const e = {};
    if (n.title.trim().length < 3) e.title = 'Escreva um título (mín. 3 caracteres).';
    if (!n.published_at) e.date = 'Escolha a data.';
    if (!body.length) e.body = 'Escreva o texto da notícia.';
    setErrs(e);
    if (Object.keys(e).length) { toast.err('Verifique os campos assinalados.'); return; }
    setBusy(status);
    let uploaded = null;
    try {
      let cover = n.cover_url || null;
      if (img) {
        const path = `${n.published_at.slice(0, 4)}/${crypto.randomUUID()}.${img.ext}`;
        await must(sb.storage.from(BUCKET_NEWS).upload(path, img.blob, { contentType: img.type, cacheControl: '31536000', upsert: false }));
        uploaded = path; cover = publicUrl(BUCKET_NEWS, path);
      }
      const row = { title: n.title.trim(), category: n.category, published_at: n.published_at, cover_url: cover, body, status };
      let saved;
      if (id) saved = await must(sb.from('news').update(row).eq('id', id).select('*').single());
      else saved = await must(sb.from('news').insert({ ...row, slug: await uniqueSlug(slugify(row.title)) }).select('*').single());
      if (img && n.cover_url && n.cover_url !== cover) await removeCover(n.cover_url).catch(() => {});
      setDirty(false); setImg(null);
      toast.ok(status === 'published' ? (n.status === 'published' && id ? 'Alterações publicadas.' : 'Notícia publicada no site.') : 'Guardada como rascunho.');
      if (!id) location.hash = '#/noticias/' + saved.id; else setN(saved);
    } catch (er) {
      if (uploaded) await sb.storage.from(BUCKET_NEWS).remove([uploaded]).catch(() => {});
      toast.err(errMsg(er));
    }
    setBusy('');
  }

  const preview = img ? img.preview : n.cover_url;
  const isPub = n.status === 'published';
  return (
    <section class="narrow">
      <PageHead title={id ? 'Editar notícia' : 'Nova notícia'} back="#/noticias">
        {id && <span class={'badge big ' + n.status}>{isPub ? 'Publicada' : 'Rascunho'}</span>}
      </PageHead>
      <div class="form">
        <Field label="Título" error={errs.title}><input value={n.title} maxLength={200} onInput={(e) => set('title', e.currentTarget.value)} /></Field>
        <div class="grid2">
          <Field label="Data de publicação" error={errs.date}><input type="date" value={n.published_at} onInput={(e) => set('published_at', e.currentTarget.value)} /></Field>
          <Field label="Categoria"><select value={n.category} onChange={(e) => set('category', e.currentTarget.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div>
        <Field group label="Imagem de capa" hint="JPG, PNG ou WebP. Fotografias grandes são reduzidas automaticamente." error={errs.cover}>
          <div class="cover">
            {preview ? <img src={preview} alt="Pré-visualização da capa" /> : <div class="cover-empty"><Icon name="upload" size={28} /><span>Sem imagem</span></div>}
            <div class="row">
              <button type="button" class="btn ghost sm" onClick={() => fileRef.current.click()}><Icon name="upload" /><span>{preview ? 'Trocar imagem' : 'Escolher imagem'}</span></button>
              {preview && <button type="button" class="btn ghost sm" onClick={() => { setImg(null); set('cover_url', ''); }}>Remover</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} aria-label="Ficheiro da imagem de capa" />
          </div>
        </Field>
        <Field group label="Texto da notícia" error={errs.body}>
          <RichEditor initial={n.body} api={bodyRef} onChange={() => setDirty(true)} />
        </Field>
        <div class="actions sticky">
          {isPub ? (
            <>
              <Btn kind="ghost" busy={busy === 'draft'} disabled={!!busy} onClick={() => save('draft')} icon="eyeoff">Despublicar</Btn>
              <Btn busy={busy === 'published'} disabled={!!busy} onClick={() => save('published')} icon="check">Guardar alterações</Btn>
            </>
          ) : (
            <>
              <Btn kind="ghost" busy={busy === 'draft'} disabled={!!busy} onClick={() => save('draft')}>Guardar rascunho</Btn>
              <Btn busy={busy === 'published'} disabled={!!busy} onClick={() => save('published')} icon="check">Publicar</Btn>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
