// Testes de segurança e persistência contra o Supabase local (npx supabase start).
// Corre com: npm run test:db
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { ADMIN, OTHER, URL_, ANON, SERVICE, ensureUsers } from '../helpers.mjs';

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const anon = createClient(URL_, ANON, opts);
const service = createClient(URL_, SERVICE, opts);
let admin, other;

before(async () => {
  await ensureUsers(service);
  admin = createClient(URL_, ANON, opts);
  other = createClient(URL_, ANON, opts);
  assert.ifError((await admin.auth.signInWithPassword(ADMIN)).error);
  assert.ifError((await other.auth.signInWithPassword(OTHER)).error);
});

const body = (t) => [{ type: 'p', parts: [{ text: t }] }];
const slug = () => 'teste-' + Math.random().toString(36).slice(2, 8);

test('registo público de contas está desligado', async () => {
  const { error } = await anon.auth.signUp({ email: 'intruso@exemplo.pt', password: 'Intruso12345' });
  assert.ok(error, 'signUp devia falhar');
});

test('visitante só vê notícias publicadas', async () => {
  const s = slug();
  assert.ifError((await admin.from('news').insert({ slug: s, title: 'Rascunho secreto', body: body('x'), status: 'draft' })).error);
  const { data } = await anon.from('news').select('slug').eq('slug', s);
  assert.equal(data.length, 0);
  const { data: pub } = await anon.from('news').select('slug, status');
  assert.ok(pub.length >= 27 && pub.every((n) => n.status === 'published'));
  await admin.from('news').delete().eq('slug', s);
});

test('notícia com data futura só aparece no dia', async () => {
  const s = slug();
  assert.ifError((await admin.from('news').insert({ slug: s, title: 'Agendada', body: body('x'), status: 'published', published_at: '2099-01-01' })).error);
  assert.equal((await anon.from('news').select('slug').eq('slug', s)).data.length, 0);
  await admin.from('news').delete().eq('slug', s);
});

test('visitante não consegue alterar nada por pedidos diretos à API', async () => {
  const ins = await anon.from('news').insert({ slug: slug(), title: 'Hack', body: body('x'), status: 'published' });
  assert.ok(ins.error, 'insert anónimo devia falhar');
  const upd = await anon.from('news').update({ title: 'Hack' }).neq('slug', '').select();
  assert.ok(upd.error || upd.data.length === 0);
  const del = await anon.from('history_events').delete().gt('year', 0).select();
  assert.ok(del.error || del.data.length === 0);
  for (const t of ['board_members', 'academy_schedule', 'documents']) {
    const r = await anon.from(t).update({ sort: 999 }).gt('sort', -1).select();
    assert.ok(r.error || r.data.length === 0, t);
  }
  assert.equal((await service.from('news').select('id', { count: 'exact', head: true }).eq('title', 'Hack')).count, 0);
});

test('conta autenticada sem permissão de administrador é bloqueada', async () => {
  const ins = await other.from('history_events').insert({ year: 1999, description: 'Não autorizado' });
  assert.ok(ins.error);
  const upd = await other.from('academy_schedule').update({ treinador: 'Hack' }).gt('sort', -1).select();
  assert.ok(upd.error || upd.data.length === 0);
  const up = await other.storage.from('documentos').upload('hack.pdf', new Blob(['%PDF-1.4 x'], { type: 'application/pdf' }), { contentType: 'application/pdf' });
  assert.ok(up.error, 'upload sem permissão devia falhar');
  const { data: a } = await other.from('admins').select('*');
  assert.equal(a.length, 0);
  const { data: log } = await other.from('audit_log').select('*');
  assert.equal(log.length, 0);
});

test('texto com HTML ou links perigosos é recusado pela base de dados', async () => {
  const bad = [
    [{ type: 'p', parts: [{ text: 'x', href: 'javascript:alert(1)' }] }],
    [{ type: 'p', parts: [{ text: 'x', html: '<script>' }] }],
    [{ type: 'script', parts: [{ text: 'x' }] }],
    '<p>html</p>',
    []
  ];
  for (const b of bad) {
    const r = await admin.from('news').insert({ slug: slug(), title: 'Mau', body: b });
    assert.ok(r.error, 'devia recusar ' + JSON.stringify(b));
  }
  const ok = await admin.from('news').insert({ slug: slug(), title: 'Formatada', status: 'draft', body: [
    { type: 'p', parts: [{ text: 'Olá ' }, { text: 'negrito', bold: true }, { text: ' link', href: 'https://sfdamaiense.pt' }] },
    { type: 'ul', items: [[{ text: 'um' }], [{ text: 'dois' }]] }] }).select('id').single();
  assert.ifError(ok.error);
  await admin.from('news').delete().eq('id', ok.data.id);
});

test('cronologia evita duplicados e valida o ano', async () => {
  const d = 'Evento de teste ' + Date.now();
  assert.ifError((await admin.from('history_events').insert({ year: 1950, description: d })).error);
  const dup = await admin.from('history_events').insert({ year: 1950, description: '  ' + d.toUpperCase() + ' ' });
  assert.equal(dup.error?.code, '23505');
  assert.ok((await admin.from('history_events').insert({ year: 1800, description: 'Ano inválido' })).error);
  await admin.from('history_events').delete().eq('description', d);
});

test('armazenamento aceita só PDF / imagens e respeita limites', async () => {
  const pdf = await admin.storage.from('documentos').upload('teste-' + Date.now() + '.pdf', new Blob(['%PDF-1.4 teste'], { type: 'application/pdf' }), { contentType: 'application/pdf' });
  assert.ifError(pdf.error);
  const exe = await admin.storage.from('documentos').upload('virus.exe', new Blob(['MZ'], { type: 'application/x-msdownload' }), { contentType: 'application/x-msdownload' });
  assert.ok(exe.error, '.exe devia ser recusado');
  const html = await admin.storage.from('documentos').upload('pagina.pdf', new Blob(['<html>'], { type: 'text/html' }), { contentType: 'text/html' });
  assert.ok(html.error, 'text/html devia ser recusado');
  const svg = await admin.storage.from('noticias').upload('x.svg', new Blob(['<svg/>'], { type: 'image/svg+xml' }), { contentType: 'image/svg+xml' });
  assert.ok(svg.error, 'SVG devia ser recusado');
  const big = await admin.storage.from('documentos').upload('grande.pdf', new Blob([new Uint8Array(16 * 1024 * 1024)], { type: 'application/pdf' }), { contentType: 'application/pdf' });
  assert.ok(big.error, 'PDF > 15 MB devia ser recusado');
  await admin.storage.from('documentos').remove([pdf.data.path]);
});

test('alterações ficam registadas com o autor', async () => {
  const before = (await admin.from('audit_log').select('id', { count: 'exact', head: true })).count;
  const r = await admin.from('academy_schedule').update({ local: 'Campo de teste' }).eq('escalao', 'Petizes').select('id').single();
  assert.ifError(r.error);
  const { data: log } = await admin.from('audit_log').select('*').order('id', { ascending: false }).limit(1);
  assert.equal(log[0].table_name, 'academy_schedule');
  assert.equal(log[0].email, ADMIN.email);
  assert.ok((await admin.from('audit_log').select('id', { count: 'exact', head: true })).count > before);
  const tamper = await admin.from('audit_log').delete().gt('id', 0).select();
  assert.ok(tamper.error || tamper.data.length === 0, 'registo não pode ser apagado');
  await admin.from('academy_schedule').update({ local: null }).eq('escalao', 'Petizes');
});

test('campos de controlo não podem ser falsificados pelo cliente', async () => {
  const s = slug();
  const r = await admin.from('news').insert({ slug: s, title: 'Autor', body: body('x'), created_by: '00000000-0000-0000-0000-000000000000' }).select('created_by').single();
  assert.ifError(r.error);
  const { data: u } = await admin.auth.getUser();
  assert.equal(r.data.created_by, u.user.id);
  await admin.from('news').delete().eq('slug', s);
});

test('plantéis: leitura pública, escrita só administradores, validação', async () => {
  const { data: pub } = await anon.from('players').select('full_name, team');
  assert.ok(pub.length >= 57);
  const ins = await anon.from('players').insert({ team: 'a', full_name: 'Intruso' });
  assert.ok(ins.error, 'visitante não pode adicionar atletas');
  const upd = await other.from('players').update({ full_name: 'Hack' }).eq('team', 'a').select();
  assert.ok(upd.error || upd.data.length === 0, 'conta sem permissão não pode alterar');
  assert.ok((await admin.from('players').insert({ team: 'x', full_name: 'Equipa inválida' })).error);
  assert.ok((await admin.from('players').insert({ team: 'a', full_name: 'Número inválido', number: 120 })).error);
  assert.ok((await admin.from('players').insert({ team: 'a', full_name: 'Posição inválida', position: 'Treinador' })).error);
  const ok = await admin.from('players').insert({ team: 's15', full_name: 'Atleta Teste', number: 9, position: 'Avançado' }).select('id').single();
  assert.ifError(ok.error);
  await admin.from('players').delete().eq('id', ok.data.id);
  const up = await other.storage.from('plantel').upload('x.jpg', new Blob(['x'], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
  assert.ok(up.error, 'upload de fotografia sem permissão devia falhar');
});
