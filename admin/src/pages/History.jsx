import { useEffect, useState } from 'preact/hooks';
import { sb, must, errMsg } from '../supabase.js';
import { Btn, Field, Icon, PageHead, Spinner, Empty, toast, confirmDialog } from '../ui.jsx';

const MAXY = new Date().getFullYear() + 5;

function EventForm({ init, onSave, onCancel, rows }) {
  const [year, setYear] = useState(init ? String(init.year) : '');
  const [desc, setDesc] = useState(init ? init.description : '');
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const y = parseInt(year, 10); const d = desc.trim(); const er = {};
    if (!/^\d{4}$/.test(year.trim()) || y < 1900 || y > MAXY) er.year = `Ano entre 1900 e ${MAXY}.`;
    if (d.length < 3) er.desc = 'Escreva a descrição (mín. 3 caracteres).';
    if (!er.year && !er.desc && rows.some((r) => r.id !== (init && init.id) && r.year === y && r.description.trim().toLowerCase() === d.toLowerCase())) er.desc = 'Este acontecimento já existe nesse ano.';
    setErrs(er); if (Object.keys(er).length) return;
    setBusy(true); await onSave({ year: y, description: d }); setBusy(false);
  }
  return (
    <form class="inline-form" onSubmit={submit} noValidate>
      <div class="grid-year">
        <Field label="Ano" error={errs.year}><input inputMode="numeric" maxLength={4} value={year} onInput={(e) => setYear(e.currentTarget.value.replace(/\D/g, ''))} autoFocus placeholder="1938" /></Field>
        <Field label="Descrição" error={errs.desc}><textarea rows={3} maxLength={1200} value={desc} onInput={(e) => setDesc(e.currentTarget.value)} /></Field>
      </div>
      <div class="row end">
        <button type="button" class="btn ghost" onClick={onCancel}>Cancelar</button>
        <Btn busy={busy} type="submit" icon="check">Guardar</Btn>
      </div>
    </form>
  );
}

export function History() {
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState(null); // 'new' | id
  const load = () => sb.from('history_events').select('id, year, description').order('year').order('created_at')
    .then(({ data, error }) => { if (error) toast.err(errMsg(error)); setRows(data || []); });
  useEffect(() => { load(); }, []);

  async function save(row, id) {
    try {
      if (id) await must(sb.from('history_events').update(row).eq('id', id).select('id').single());
      else await must(sb.from('history_events').insert(row).select('id').single());
      toast.ok(id ? 'Acontecimento atualizado.' : 'Acontecimento adicionado à cronologia.');
      setEdit(null); await load();
    } catch (e) { toast.err(errMsg(e)); }
  }
  async function del(r) {
    if (!(await confirmDialog({ title: `Eliminar ${r.year}?`, text: 'Esta entrada deixa de aparecer na cronologia do site.', ok: 'Eliminar', danger: true }))) return;
    try { await must(sb.from('history_events').delete().eq('id', r.id).select('id').single()); toast.ok('Entrada eliminada.'); await load(); }
    catch (e) { toast.err(errMsg(e)); }
  }

  return (
    <section class="narrow">
      <PageHead title="A Nossa História">{edit !== 'new' && <Btn icon="plus" onClick={() => setEdit('new')}>Adicionar acontecimento</Btn>}</PageHead>
      <p class="lead">A cronologia do site fica sempre por ordem dos anos.</p>
      {edit === 'new' && <div class="panel"><EventForm rows={rows || []} onSave={(r) => save(r)} onCancel={() => setEdit(null)} /></div>}
      {!rows ? <Spinner /> : !rows.length ? <Empty>Ainda não há acontecimentos.</Empty> : (
        <ol class="timeline">
          {rows.map((r) => (
            <li key={r.id} data-testid="history-row">
              {edit === r.id ? <EventForm init={r} rows={rows} onSave={(x) => save(x, r.id)} onCancel={() => setEdit(null)} /> : (
                <div class="tl-row">
                  <span class="tl-year">{r.year}</span>
                  <p>{r.description}</p>
                  <div class="item-a">
                    <button class="iconbtn" aria-label={'Editar ' + r.year} title="Editar" onClick={() => setEdit(r.id)}><Icon name="edit" /></button>
                    <button class="iconbtn danger" aria-label={'Eliminar ' + r.year} title="Eliminar" onClick={() => del(r)}><Icon name="trash" /></button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
