import { useEffect, useState } from 'preact/hooks';
import { sb, must, errMsg } from '../supabase.js';
import { Btn, Field, Icon, PageHead, Spinner, Empty, toast, confirmDialog } from '../ui.jsx';
import { swapSort } from './Board.jsx';

const DIAS = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [7, 'Dom']];
const t5 = (t) => (t ? String(t).slice(0, 5) : '');
const daysTxt = (d) => (d && d.length ? d.slice().sort().map((x) => DIAS[x - 1][1]).join(' · ') : 'A confirmar');

function RowForm({ init, onSave, onCancel }) {
  const [v, setV] = useState({
    escalao: init ? init.escalao : '', idade: init ? init.idade || '' : '', dias: init ? init.dias || [] : [],
    hora_inicio: init ? t5(init.hora_inicio) : '', hora_fim: init ? t5(init.hora_fim) : '',
    local: init ? init.local || '' : '', treinador: init ? init.treinador || '' : '', observacoes: init ? init.observacoes || '' : ''
  });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, x) => setV({ ...v, [k]: x });
  const toggle = (d) => set('dias', v.dias.includes(d) ? v.dias.filter((x) => x !== d) : [...v.dias, d].sort());
  async function submit(e) {
    e.preventDefault(); const er = {};
    if (v.escalao.trim().length < 2) er.escalao = 'Indique o escalão.';
    if (v.hora_fim && !v.hora_inicio) er.hora_inicio = 'Indique a hora de início.';
    if (v.hora_inicio && v.hora_fim && v.hora_fim <= v.hora_inicio) er.hora_fim = 'O fim tem de ser depois do início.';
    for (const k of ['local', 'treinador']) if (v[k].trim() && v[k].trim().length < 2) er[k] = 'Demasiado curto.';
    setErrs(er); if (Object.keys(er).length) return;
    setBusy(true);
    const n = (x) => (x.trim() ? x.trim() : null);
    await onSave({ escalao: v.escalao.trim(), idade: n(v.idade), dias: v.dias, hora_inicio: v.hora_inicio || null, hora_fim: v.hora_fim || null,
      local: n(v.local), treinador: n(v.treinador), observacoes: n(v.observacoes) });
    setBusy(false);
  }
  return (
    <form class="inline-form" onSubmit={submit} noValidate>
      <div class="grid2">
        <Field label="Escalão" error={errs.escalao}><input value={v.escalao} maxLength={60} onInput={(e) => set('escalao', e.currentTarget.value)} autoFocus placeholder="Benjamins" /></Field>
        <Field label="Idade"><input value={v.idade} maxLength={40} onInput={(e) => set('idade', e.currentTarget.value)} placeholder="Sub-11" /></Field>
      </div>
      <Field group label="Dias de treino">
        <div class="chips" role="group" aria-label="Dias de treino">
          {DIAS.map(([d, l]) => <button type="button" key={d} class={v.dias.includes(d) ? 'chip on' : 'chip'} aria-pressed={v.dias.includes(d)} onClick={() => toggle(d)}>{l}</button>)}
        </div>
      </Field>
      <div class="grid2">
        <Field label="Hora de início" error={errs.hora_inicio}><input type="time" value={v.hora_inicio} onInput={(e) => set('hora_inicio', e.currentTarget.value)} /></Field>
        <Field label="Hora de fim" error={errs.hora_fim}><input type="time" value={v.hora_fim} onInput={(e) => set('hora_fim', e.currentTarget.value)} /></Field>
      </div>
      <div class="grid2">
        <Field label="Local de treino" error={errs.local} hint="Opcional"><input value={v.local} maxLength={120} onInput={(e) => set('local', e.currentTarget.value)} /></Field>
        <Field label="Treinador" error={errs.treinador} hint="Vazio = “A confirmar”."><input value={v.treinador} maxLength={120} onInput={(e) => set('treinador', e.currentTarget.value)} /></Field>
      </div>
      <Field label="Observações" hint="Opcional. Aparece por baixo do escalão."><input value={v.observacoes} maxLength={300} onInput={(e) => set('observacoes', e.currentTarget.value)} /></Field>
      <div class="row end">
        <button type="button" class="btn ghost" onClick={onCancel}>Cancelar</button>
        <Btn busy={busy} type="submit" icon="check">Guardar alterações</Btn>
      </div>
    </form>
  );
}

function NoteEditor() {
  const [v, setV] = useState(null);
  const [orig, setOrig] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { sb.from('site_texts').select('value').eq('key', 'academia_nota').maybeSingle().then(({ data }) => { setV(data ? data.value : ''); setOrig(data ? data.value : ''); }); }, []);
  if (v == null) return null;
  async function save() {
    setBusy(true);
    try { await must(sb.from('site_texts').upsert({ key: 'academia_nota', value: v.trim() }).select('key').single()); setOrig(v.trim()); toast.ok('Nota atualizada.'); }
    catch (e) { toast.err(errMsg(e)); }
    setBusy(false);
  }
  return (
    <div class="panel">
      <Field label="Nota por baixo da tabela" hint="Informações adicionais para os pais."><textarea rows={2} maxLength={600} value={v} onInput={(e) => setV(e.currentTarget.value)} /></Field>
      <div class="row end"><Btn busy={busy} disabled={v.trim() === orig || !v.trim()} onClick={save} icon="check">Guardar nota</Btn></div>
    </div>
  );
}

export function Academy() {
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => sb.from('academy_schedule').select('*').order('sort').order('created_at')
    .then(({ data, error }) => { if (error) toast.err(errMsg(error)); setRows(data || []); });
  useEffect(() => { load(); }, []);

  async function save(data, id) {
    try {
      if (id) await must(sb.from('academy_schedule').update(data).eq('id', id).select('id').single());
      else await must(sb.from('academy_schedule').insert({ ...data, sort: rows.length ? Math.max(...rows.map((r) => r.sort)) + 10 : 10 }).select('id').single());
      toast.ok(id ? 'Horário atualizado no site.' : 'Horário adicionado.'); setEdit(null); await load();
    } catch (e) { toast.err(errMsg(e)); }
  }
  async function del(r) {
    if (!(await confirmDialog({ title: `Eliminar ${r.escalao}?`, text: 'Esta linha deixa de aparecer na tabela de horários da Academia.', ok: 'Eliminar', danger: true }))) return;
    try { await must(sb.from('academy_schedule').delete().eq('id', r.id).select('id').single()); toast.ok('Linha eliminada.'); await load(); }
    catch (e) { toast.err(errMsg(e)); }
  }
  async function move(i, d) {
    if (busy || !rows[i + d]) return;
    setBusy(true);
    try { await swapSort('academy_schedule', rows[i], rows[i + d]); await load(); } catch (e) { toast.err(errMsg(e)); }
    setBusy(false);
  }

  return (
    <section>
      <PageHead title="Academia">{edit !== 'new' && <Btn icon="plus" onClick={() => setEdit('new')}>Adicionar horário</Btn>}</PageHead>
      <p class="lead">Tabela de horários da página Academia. Clique em Editar para mudar dias, horas ou local.</p>
      {edit === 'new' && <div class="panel"><RowForm onSave={(d) => save(d)} onCancel={() => setEdit(null)} /></div>}
      {!rows ? <Spinner /> : !rows.length ? <Empty>Sem horários.</Empty> : (
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Escalão</th><th>Idade</th><th>Dias</th><th>Horário</th><th>Local</th><th>Treinador</th><th><span class="sr">Ações</span></th></tr></thead>
            <tbody>
              {rows.map((r, i) => edit === r.id ? (
                <tr key={r.id} class="editing"><td colSpan={7}><RowForm init={r} onSave={(d) => save(d, r.id)} onCancel={() => setEdit(null)} /></td></tr>
              ) : (
                <tr key={r.id} data-testid="academy-row">
                  <td data-l="Escalão"><b>{r.escalao}</b>{r.observacoes && <small class="obs">{r.observacoes}</small>}</td>
                  <td data-l="Idade">{r.idade || '—'}</td>
                  <td data-l="Dias" class={r.dias && r.dias.length ? '' : 'muted'}>{daysTxt(r.dias)}</td>
                  <td data-l="Horário" class={r.hora_inicio ? '' : 'muted'}>{r.hora_inicio ? t5(r.hora_inicio) + (r.hora_fim ? '–' + t5(r.hora_fim) : '') : 'A confirmar'}</td>
                  <td data-l="Local" class={r.local ? '' : 'muted'}>{r.local || '—'}</td>
                  <td data-l="Treinador" class={r.treinador ? '' : 'muted'}>{r.treinador || 'A confirmar'}</td>
                  <td class="acts">
                    <button class="iconbtn" aria-label="Subir" title="Subir" disabled={!i || busy} onClick={() => move(i, -1)}><Icon name="up" /></button>
                    <button class="iconbtn" aria-label="Descer" title="Descer" disabled={i === rows.length - 1 || busy} onClick={() => move(i, 1)}><Icon name="down" /></button>
                    <button class="btn ghost sm" onClick={() => setEdit(r.id)} aria-label={'Editar ' + r.escalao}><Icon name="edit" /><span>Editar</span></button>
                    <button class="iconbtn danger" aria-label={'Eliminar ' + r.escalao} title="Eliminar" onClick={() => del(r)}><Icon name="trash" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NoteEditor />
    </section>
  );
}
