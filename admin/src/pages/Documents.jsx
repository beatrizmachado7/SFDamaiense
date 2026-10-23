import { useEffect, useRef, useState } from 'preact/hooks';
import { sb, must, errMsg, publicUrl, BUCKET_DOCS } from '../supabase.js';
import { Btn, Field, Icon, PageHead, Spinner, Empty, toast, confirmDialog, fmtDate } from '../ui.jsx';
import { swapSort } from './Board.jsx';

export const DOC_CATS = ['Estatutos e regulamentos', 'Relatórios e contas', 'Assembleia Geral', 'Outros'];
const MAX_PDF = 15 * 1024 * 1024;

function slug(t) { return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'documento'; }
const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

/** Só PDF verdadeiro: extensão, tipo e assinatura %PDF- no início do ficheiro. */
export async function checkPdf(file) {
  if (!file) return 'Escolha um ficheiro PDF.';
  if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) return 'Só são aceites ficheiros PDF.';
  if (file.size > MAX_PDF) return 'O PDF tem mais de 15 MB.';
  if (file.size < 8) return 'O ficheiro está vazio.';
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...head) !== '%PDF-') return 'O ficheiro não é um PDF válido.';
  return '';
}
async function upload(file, title) {
  const path = `${slug(title)}-${crypto.randomUUID().slice(0, 8)}.pdf`;
  await must(sb.storage.from(BUCKET_DOCS).upload(path, file, { contentType: 'application/pdf', cacheControl: '3600', upsert: false }));
  return path;
}

function DocForm({ init, onDone, onCancel, nextSort }) {
  const [title, setTitle] = useState(init ? init.title : '');
  const [cat, setCat] = useState(init ? init.category : DOC_CATS[0]);
  const [date, setDate] = useState(init ? init.doc_date || '' : '');
  const [file, setFile] = useState(null);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const fr = useRef();
  async function pick(e) { const f = e.currentTarget.files[0]; const m = await checkPdf(f); setErrs({ ...errs, file: m }); setFile(m ? null : f); }
  async function submit(e) {
    e.preventDefault(); const er = {};
    if (title.trim().length < 2) er.title = 'Indique o título.';
    if (!init && !file) er.file = errs.file || 'Escolha o ficheiro PDF.';
    setErrs(er); if (Object.keys(er).length) return;
    setBusy(true); let up = null;
    try {
      const row = { title: title.trim(), category: cat, doc_date: date || null };
      if (init) await must(sb.from('documents').update(row).eq('id', init.id).select('id').single());
      else {
        up = await upload(file, title);
        await must(sb.from('documents').insert({ ...row, file_path: up, file_size: file.size, sort: nextSort }).select('id').single());
      }
      toast.ok(init ? 'Documento atualizado.' : 'Documento publicado no site.');
      onDone();
    } catch (er2) {
      if (up) await sb.storage.from(BUCKET_DOCS).remove([up]).catch(() => {});
      toast.err(errMsg(er2));
    }
    setBusy(false);
  }
  return (
    <form class="inline-form" onSubmit={submit} noValidate>
      <div class="grid3">
        <Field label="Título" error={errs.title}><input value={title} maxLength={160} onInput={(e) => setTitle(e.currentTarget.value)} autoFocus placeholder="Relatório e contas 2025/26" /></Field>
        <Field label="Categoria"><select value={cat} onChange={(e) => setCat(e.currentTarget.value)}>{DOC_CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Data" hint="Opcional"><input type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} /></Field>
      </div>
      {!init && (
        <Field group label="Ficheiro PDF" hint="Máximo 15 MB." error={errs.file}>
          <div class="row">
            <button type="button" class="btn ghost sm" onClick={() => fr.current.click()}><Icon name="upload" /><span>{file ? 'Trocar ficheiro' : 'Escolher PDF'}</span></button>
            {file && <span class="muted">{file.name} · {kb(file.size)}</span>}
          </div>
          <input ref={fr} type="file" accept="application/pdf,.pdf" hidden onChange={pick} aria-label="Ficheiro PDF" />
        </Field>
      )}
      <div class="row end">
        <button type="button" class="btn ghost" onClick={onCancel}>Cancelar</button>
        <Btn busy={busy} type="submit" icon="check">{init ? 'Guardar' : 'Adicionar documento'}</Btn>
      </div>
    </form>
  );
}

export function Documents() {
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState('');
  const rep = useRef(); const repFor = useRef(null);
  const load = () => sb.from('documents').select('*').order('sort').order('created_at', { ascending: false })
    .then(({ data, error }) => { if (error) toast.err(errMsg(error)); setRows(data || []); });
  useEffect(() => { load(); }, []);

  async function del(d) {
    if (!(await confirmDialog({ title: 'Eliminar documento?', text: `"${d.title}" e o respetivo PDF deixam de estar disponíveis no site.`, ok: 'Eliminar', danger: true }))) return;
    setBusy(d.id);
    try {
      await must(sb.from('documents').delete().eq('id', d.id).select('id').single());
      await sb.storage.from(BUCKET_DOCS).remove([d.file_path]);
      toast.ok('Documento eliminado.'); await load();
    } catch (e) { toast.err(errMsg(e)); }
    setBusy('');
  }
  async function replace(e) {
    const f = e.currentTarget.files[0]; e.currentTarget.value = ''; const d = repFor.current;
    if (!f || !d) return;
    const m = await checkPdf(f); if (m) { toast.err(m); return; }
    if (!(await confirmDialog({ title: 'Substituir PDF?', text: `O ficheiro de "${d.title}" passa a ser ${f.name}.`, ok: 'Substituir' }))) return;
    setBusy(d.id); let up = null;
    try {
      up = await upload(f, d.title);
      await must(sb.from('documents').update({ file_path: up, file_size: f.size }).eq('id', d.id).select('id').single());
      await sb.storage.from(BUCKET_DOCS).remove([d.file_path]);
      toast.ok('Ficheiro substituído.'); await load();
    } catch (er) { if (up) await sb.storage.from(BUCKET_DOCS).remove([up]).catch(() => {}); toast.err(errMsg(er)); }
    setBusy('');
  }
  async function move(i, dlt) {
    if (busy || !rows[i + dlt]) return;
    setBusy('move');
    try {
      const a = rows[i], b = rows[i + dlt];
      if (a.sort === b.sort) { await Promise.all(rows.map((r, k) => must(sb.from('documents').update({ sort: (k + 1) * 10 }).eq('id', r.id).select('id').single()))); a.sort = (i + 1) * 10; b.sort = (i + dlt + 1) * 10; }
      await swapSort('documents', a, b); await load();
    } catch (e) { toast.err(errMsg(e)); }
    setBusy('');
  }

  const nextSort = rows && rows.length ? Math.max(...rows.map((r) => r.sort)) + 10 : 10;
  return (
    <section class="narrow">
      <PageHead title="Documentos">{edit !== 'new' && <Btn icon="plus" onClick={() => setEdit('new')}>Adicionar documento</Btn>}</PageHead>
      <p class="lead">Ficheiros PDF que aparecem na página Clube, com opção para ver ou transferir.</p>
      {edit === 'new' && <div class="panel"><DocForm nextSort={nextSort} onDone={() => { setEdit(null); load(); }} onCancel={() => setEdit(null)} /></div>}
      <input ref={rep} type="file" accept="application/pdf,.pdf" hidden onChange={replace} aria-label="Novo ficheiro PDF" />
      {!rows ? <Spinner /> : !rows.length ? <Empty>Ainda não há documentos. Adicione o primeiro PDF.</Empty> : (
        <ul class="list">
          {rows.map((d, i) => (
            <li class="item" key={d.id} data-testid="doc-row">
              {edit === d.id ? <div style="flex:1"><DocForm init={d} onDone={() => { setEdit(null); load(); }} onCancel={() => setEdit(null)} /></div> : (
                <>
                  <div class="thumb pdf"><Icon name="doc" /></div>
                  <div class="item-main">
                    <span class="item-t">{d.title}</span>
                    <span class="item-m">{d.category}{d.doc_date ? ' · ' + fmtDate(d.doc_date) : ''}{d.file_size ? ' · ' + kb(d.file_size) : ''}</span>
                  </div>
                  <div class="item-a">
                    <a class="iconbtn" href={publicUrl(BUCKET_DOCS, d.file_path)} target="_blank" rel="noopener" aria-label={'Ver ' + d.title} title="Ver PDF"><Icon name="eye" /></a>
                    <button class="iconbtn" aria-label="Subir" title="Subir" disabled={!i || !!busy} onClick={() => move(i, -1)}><Icon name="up" /></button>
                    <button class="iconbtn" aria-label="Descer" title="Descer" disabled={i === rows.length - 1 || !!busy} onClick={() => move(i, 1)}><Icon name="down" /></button>
                    <button class="iconbtn" aria-label={'Editar ' + d.title} title="Editar" onClick={() => setEdit(d.id)}><Icon name="edit" /></button>
                    <Btn kind="ghost sm" icon="upload" busy={busy === d.id} onClick={() => { repFor.current = d; rep.current.click(); }}>Substituir</Btn>
                    <button class="iconbtn danger" aria-label={'Eliminar ' + d.title} title="Eliminar" disabled={!!busy} onClick={() => del(d)}><Icon name="trash" /></button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
