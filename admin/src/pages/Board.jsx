import { useEffect, useState } from 'preact/hooks';
import { sb, must, errMsg } from '../supabase.js';
import { Btn, Field, Icon, PageHead, Spinner, toast, confirmDialog } from '../ui.jsx';

const MANDATE = /^[0-9]{4}(\/[0-9]{2,4})?$|^[0-9]{4}[-–][0-9]{4}$/;

export async function swapSort(table, a, b) {
  // troca a ordem de dois registos
  await must(sb.from(table).update({ sort: b.sort }).eq('id', a.id).select('id').single());
  await must(sb.from(table).update({ sort: a.sort }).eq('id', b.id).select('id').single());
}

function MemberForm({ init, defMandate, onSave, onCancel }) {
  const [role, setRole] = useState(init ? init.role : '');
  const [name, setName] = useState(init ? init.full_name || '' : '');
  const [mandate, setMandate] = useState(init ? init.mandate || '' : defMandate || '');
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); const er = {};
    if (role.trim().length < 2) er.role = 'Indique o cargo.';
    if (name.trim() && name.trim().length < 2) er.name = 'Nome demasiado curto.';
    if (mandate.trim() && !MANDATE.test(mandate.trim())) er.mandate = 'Formato: 2026/27 ou 2026-2030.';
    setErrs(er); if (Object.keys(er).length) return;
    setBusy(true);
    await onSave({ role: role.trim(), full_name: name.trim() || null, mandate: mandate.trim() || null });
    setBusy(false);
  }
  return (
    <form class="inline-form" onSubmit={submit} noValidate>
      <div class="grid3">
        <Field label="Cargo" error={errs.role}><input value={role} maxLength={80} onInput={(e) => setRole(e.currentTarget.value)} autoFocus placeholder="Presidente" /></Field>
        <Field label="Nome completo" error={errs.name} hint="Vazio = aparece “A designar”."><input value={name} maxLength={120} onInput={(e) => setName(e.currentTarget.value)} /></Field>
        <Field label="Mandato" error={errs.mandate}><input value={mandate} maxLength={9} onInput={(e) => setMandate(e.currentTarget.value)} placeholder="2026/27" /></Field>
      </div>
      <div class="row end">
        <button type="button" class="btn ghost" onClick={onCancel}>Cancelar</button>
        <Btn busy={busy} type="submit" icon="check">Guardar</Btn>
      </div>
    </form>
  );
}

export function Board() {
  const [bodies, setBodies] = useState(null);
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null); // id | 'new:<body>'
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const [b, m] = await Promise.all([must(sb.from('board_bodies').select('*').order('sort')), must(sb.from('board_members').select('*').order('sort').order('created_at'))]);
      setBodies(b); setRows(m);
    } catch (e) { toast.err(errMsg(e)); setBodies([]); }
  };
  useEffect(() => { load(); }, []);
  const defMandate = (() => { const c = {}; rows.forEach((r) => r.mandate && (c[r.mandate] = (c[r.mandate] || 0) + 1)); return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || ''; })();

  async function save(data, id, body) {
    try {
      if (id) await must(sb.from('board_members').update(data).eq('id', id).select('id').single());
      else {
        const max = Math.max(0, ...rows.filter((r) => r.body_id === body).map((r) => r.sort));
        await must(sb.from('board_members').insert({ ...data, body_id: body, sort: max + 10 }).select('id').single());
      }
      toast.ok(id ? 'Membro atualizado.' : 'Membro adicionado.'); setEdit(null); await load();
    } catch (e) { toast.err(errMsg(e)); }
  }
  async function del(r) {
    if (!(await confirmDialog({ title: 'Eliminar membro?', text: `${r.role}${r.full_name ? ' — ' + r.full_name : ''} deixa de aparecer no site.`, ok: 'Eliminar', danger: true }))) return;
    try { await must(sb.from('board_members').delete().eq('id', r.id).select('id').single()); toast.ok('Membro eliminado.'); await load(); }
    catch (e) { toast.err(errMsg(e)); }
  }
  async function move(list, i, d) {
    if (busy || !list[i + d]) return;
    setBusy(true);
    try { await swapSort('board_members', list[i], list[i + d]); await load(); } catch (e) { toast.err(errMsg(e)); }
    setBusy(false);
  }

  if (!bodies) return <Spinner />;
  return (
    <section class="narrow">
      <PageHead title="Órgãos Sociais" />
      <p class="lead">Os órgãos seguem a estrutura oficial do clube. Altere nomes, cargos, mandatos e a ordem.</p>
      {bodies.map((b) => {
        const list = rows.filter((r) => r.body_id === b.id);
        return (
          <div class="panel" key={b.id} data-testid={'body-' + b.id}>
            <div class="panel-h"><h2>{b.name}</h2>{edit !== 'new:' + b.id && <Btn kind="ghost sm" icon="plus" onClick={() => setEdit('new:' + b.id)}>Adicionar membro</Btn>}</div>
            {edit === 'new:' + b.id && <MemberForm defMandate={defMandate} onSave={(d) => save(d, null, b.id)} onCancel={() => setEdit(null)} />}
            {!list.length && edit !== 'new:' + b.id && <p class="muted">Sem membros.</p>}
            <ul class="rows">
              {list.map((r, i) => (
                <li key={r.id} data-testid="member-row">
                  {edit === r.id ? <MemberForm init={r} onSave={(d) => save(d, r.id)} onCancel={() => setEdit(null)} /> : (
                    <div class="mrow">
                      <span class="m-role">{r.role}</span>
                      <span class={'m-name' + (r.full_name ? '' : ' muted')}>{r.full_name || 'A designar'}</span>
                      <span class="m-mand">{r.mandate || '—'}</span>
                      <div class="item-a">
                        <button class="iconbtn" aria-label="Subir" title="Subir" disabled={!i || busy} onClick={() => move(list, i, -1)}><Icon name="up" /></button>
                        <button class="iconbtn" aria-label="Descer" title="Descer" disabled={i === list.length - 1 || busy} onClick={() => move(list, i, 1)}><Icon name="down" /></button>
                        <button class="iconbtn" aria-label={'Editar ' + r.role} title="Editar" onClick={() => setEdit(r.id)}><Icon name="edit" /></button>
                        <button class="iconbtn danger" aria-label={'Eliminar ' + r.role} title="Eliminar" onClick={() => del(r)}><Icon name="trash" /></button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
