import { useEffect, useRef, useState } from 'preact/hooks';
import { sb, must, errMsg, publicUrl } from '../supabase.js';
import { Btn, Field, Icon, PageHead, Spinner, Empty, toast, confirmDialog } from '../ui.jsx';

export const TEAMS = [['a', 'Equipa A'], ['s19', 'Sub-19'], ['s17', 'Sub-17'], ['s15', 'Sub-15']];
const POSITIONS = ['Guarda-redes', 'Defesa', 'Médio', 'Avançado'];
const GROUPS = [['Guarda-redes', 'Guarda-redes'], ['Defesa', 'Defesas'], ['Médio', 'Médios'], ['Avançado', 'Avançados'], [null, 'Posição a confirmar']];
const BUCKET = 'plantel';

function ourPath(url) {
  const m = String(url || '').match(/\/storage\/v1\/object\/public\/plantel\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

// Prepara a fotografia: retrato 4:5 (800×1000), centrada em cima (onde costuma estar a cara).
async function preparePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use uma fotografia JPG, PNG ou WebP.');
  if (file.size > 25 * 1024 * 1024) throw new Error('A fotografia tem mais de 25 MB.');
  const bmp = await createImageBitmap(file).catch(() => { throw new Error('Não foi possível ler a fotografia.'); });
  const W = 800, H = 1000, r = W / H;
  let sw = bmp.width, sh = bmp.height, sx = 0, sy = 0;
  if (sw / sh > r) { sw = Math.round(sh * r); sx = Math.round((bmp.width - sw) / 2); } else { sh = Math.round(sw / r); sy = Math.round((bmp.height - sh) * 0.15); }
  const c = document.createElement('canvas'); c.width = Math.min(W, sw); c.height = Math.round(c.width / r);
  c.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
  if (!blob) throw new Error('Não foi possível preparar a fotografia.');
  return blob;
}

function PlayerForm({ init, team, rows, onDone, onCancel }) {
  const [name, setName] = useState(init ? init.full_name : '');
  const [num, setNum] = useState(init && init.number ? String(init.number) : '');
  const [pos, setPos] = useState(init ? init.position || '' : '');
  const [featured, setFeatured] = useState(init ? init.featured : false);
  const [photo, setPhoto] = useState(null); // { blob, preview }
  const [removePhoto, setRemovePhoto] = useState(false);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const fr = useRef();
  const current = removePhoto ? '' : photo ? photo.preview : init ? init.photo_url || '' : '';
  const shown = current && current.startsWith('/') ? current : current;

  async function pick(e) {
    const f = e.currentTarget.files[0]; e.currentTarget.value = '';
    if (!f) return;
    try { const blob = await preparePhoto(f); setPhoto({ blob, preview: URL.createObjectURL(blob) }); setRemovePhoto(false); setErrs({ ...errs, photo: '' }); }
    catch (er) { setErrs({ ...errs, photo: er.message }); }
  }

  async function submit(e) {
    e.preventDefault(); const er = {};
    if (name.trim().length < 2) er.name = 'Indique o nome do atleta.';
    if (num && (!/^\d{1,2}$/.test(num) || +num < 1 || +num > 99)) er.num = 'Número entre 1 e 99.';
    setErrs(er); if (Object.keys(er).length) return;
    const clash = num && rows.find((r) => r.id !== (init && init.id) && r.number === +num);
    if (clash && !(await confirmDialog({ title: `O número ${num} já é de ${clash.full_name}`, text: 'Quer guardar mesmo assim?', ok: 'Guardar' }))) return;
    setBusy(true); let up = null;
    try {
      let photo_url = init ? init.photo_url || null : null;
      if (removePhoto) photo_url = null;
      if (photo) {
        up = `${team}/${crypto.randomUUID()}.jpg`;
        await must(sb.storage.from(BUCKET).upload(up, photo.blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false }));
        photo_url = publicUrl(BUCKET, up);
      }
      const row = { full_name: name.trim(), number: num ? +num : null, position: pos || null, photo_url, featured: team === 'a' ? featured : false };
      if (init) await must(sb.from('players').update(row).eq('id', init.id).select('id').single());
      else await must(sb.from('players').insert({ ...row, team, sort: rows.length ? Math.max(...rows.map((r) => r.sort)) + 10 : 10 }).select('id').single());
      const old = init && ourPath(init.photo_url);
      if (old && init.photo_url !== photo_url) await sb.storage.from(BUCKET).remove([old]).catch(() => {});
      toast.ok(init ? 'Atleta atualizado no site.' : 'Atleta adicionado ao plantel.');
      onDone();
    } catch (er2) {
      if (up) await sb.storage.from(BUCKET).remove([up]).catch(() => {});
      toast.err(errMsg(er2));
    }
    setBusy(false);
  }

  return (
    <form class="inline-form player-form" onSubmit={submit} noValidate>
      <div class="pf-grid">
        <div class="pf-photo">
          <div class="pf-frame">{shown ? <img src={shown} alt="Fotografia do atleta" /> : <span><Icon name="people" size={36} /></span>}</div>
          <button type="button" class="btn ghost sm" onClick={() => fr.current.click()}><Icon name="upload" /><span>{shown ? 'Trocar fotografia' : 'Escolher fotografia'}</span></button>
          {shown && <button type="button" class="linkbtn" onClick={() => { setPhoto(null); setRemovePhoto(true); }}>Remover fotografia</button>}
          <input ref={fr} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} aria-label="Fotografia do atleta" />
          {errs.photo ? <span class="err" role="alert">{errs.photo}</span> : <span class="hint">A fotografia é recortada ao alto (4:5).</span>}
        </div>
        <div>
          <Field label="Nome do atleta" error={errs.name}><input value={name} maxLength={80} onInput={(e) => setName(e.currentTarget.value)} autoFocus /></Field>
          <div class="grid2">
            <Field label="Número da camisola" error={errs.num} hint="Opcional"><input inputMode="numeric" maxLength={2} value={num} onInput={(e) => setNum(e.currentTarget.value.replace(/\D/g, ''))} /></Field>
            <Field label="Posição"><select value={pos} onChange={(e) => setPos(e.currentTarget.value)}><option value="">A confirmar</option>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</select></Field>
          </div>
          {team === 'a' && (
            <label class="check"><input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.currentTarget.checked)} /> <span>Mostrar na página inicial ("Quem veste a camisola", até 8 atletas)</span></label>
          )}
        </div>
      </div>
      <div class="row end">
        <button type="button" class="btn ghost" onClick={onCancel}>Cancelar</button>
        <Btn busy={busy} type="submit" icon="check">{init ? 'Guardar' : 'Adicionar atleta'}</Btn>
      </div>
    </form>
  );
}

export function Players() {
  const [team, setTeam] = useState(() => { const m = location.hash.match(/plantel\/(a|s19|s17|s15)/); return m ? m[1] : 'a'; });
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = () => sb.from('players').select('*').eq('team', team).order('number', { ascending: true, nullsFirst: false }).order('sort')
    .then(({ data, error }) => { if (error) toast.err(errMsg(error)); setRows(data || []); });
  useEffect(() => { setRows(null); setEdit(null); load(); }, [team]);

  async function del(r) {
    if (!(await confirmDialog({ title: `Remover ${r.full_name}?`, text: 'O atleta deixa de aparecer no plantel do site. A fotografia também é apagada.', ok: 'Remover', danger: true }))) return;
    try {
      await must(sb.from('players').delete().eq('id', r.id).select('id').single());
      const p = ourPath(r.photo_url); if (p) await sb.storage.from(BUCKET).remove([p]).catch(() => {});
      toast.ok('Atleta removido do plantel.'); await load();
    } catch (e) { toast.err(errMsg(e)); }
  }

  const nFeat = (rows || []).filter((r) => r.featured).length;
  const label = TEAMS.find((t) => t[0] === team)[1];
  return (
    <section>
      <PageHead title="Plantéis">{edit !== 'new' && <Btn icon="plus" onClick={() => setEdit('new')}>Adicionar atleta</Btn>}</PageHead>
      <div class="toolbar">
        <div class="seg" role="tablist" aria-label="Equipa">
          {TEAMS.map(([k, l]) => <button key={k} role="tab" aria-selected={team === k} class={team === k ? 'on' : ''} onClick={() => setTeam(k)}>{l}</button>)}
        </div>
        {rows && <span class="muted">{rows.length} {rows.length === 1 ? 'atleta' : 'atletas'}{team === 'a' ? ` · ${nFeat} na página inicial` : ''}</span>}
      </div>
      {team !== 'a' && <p class="lead">Atletas menores de idade: publique fotografias só com autorização dos encarregados de educação.</p>}
      {edit === 'new' && <div class="panel"><PlayerForm team={team} rows={rows || []} onDone={() => { setEdit(null); load(); }} onCancel={() => setEdit(null)} /></div>}
      {!rows ? <Spinner /> : !rows.length ? <Empty>O plantel {label} ainda não tem atletas.</Empty> : GROUPS.map(([pos, title]) => {
        const list = rows.filter((r) => (r.position || null) === pos);
        if (!list.length) return null;
        return (
          <div class="pgroup" key={title}>
            <h2>{title} <span class="muted">· {list.length}</span></h2>
            <div class="pgrid">
              {list.map((r) => edit === r.id ? (
                <div class="pgrid-full" key={r.id}><PlayerForm init={r} team={team} rows={rows} onDone={() => { setEdit(null); load(); }} onCancel={() => setEdit(null)} /></div>
              ) : (
                <article class="pcard" key={r.id} data-testid="player-card">
                  <div class="pcard-ph">{r.photo_url ? <img src={r.photo_url} alt="" loading="lazy" /> : <span>{r.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>}
                    {r.number && <b class="pcard-nr">{r.number}</b>}
                    {r.featured && <i class="pcard-star" title="Na página inicial">★</i>}
                  </div>
                  <div class="pcard-b">
                    <span class="pcard-n">{r.full_name}</span>
                    <div class="item-a">
                      <button class="btn ghost sm" onClick={() => setEdit(r.id)} aria-label={'Editar ' + r.full_name}><Icon name="edit" /><span>Editar</span></button>
                      <button class="iconbtn danger" aria-label={'Remover ' + r.full_name} title="Remover" onClick={() => del(r)}><Icon name="trash" /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
