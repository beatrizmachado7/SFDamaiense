// Testes de ponta a ponta: painel /admin + páginas públicas, contra o Supabase local.
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { ADMIN, OTHER, URL_, SERVICE, ensureUsers } from '../helpers.mjs';

const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const RUN = Date.now().toString(36);
test.describe.configure({ mode: 'serial' });

// PNG 1×1 e PDF mínimos gerados no teste
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const pdf = (t) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\n% ${t}\ntrailer<</Root 1 0 R>>\n%%EOF`);

async function login(page, who = ADMIN) {
  await page.goto('/admin/');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}
async function nav(page, name) {
  await page.locator('.shell').waitFor();
  const menu = page.getByRole('button', { name: 'Abrir menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'Áreas de gestão' }).getByRole('link', { name }).click();
}
async function logout(page) {
  await page.locator('.shell').waitFor();
  const menu = page.getByRole('button', { name: 'Abrir menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Terminar sessão' }).click();
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
}

test.beforeAll(async () => { await ensureUsers(service); });

test('login, sessão persistente, logout e bloqueios', async ({ page }) => {
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  // palavra-passe errada → mensagem genérica
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill('Errada123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Email ou palavra-passe incorretos.')).toBeVisible();
  // conta sem permissões → bloqueada
  await login(page, OTHER);
  await expect(page.getByRole('heading', { name: 'Sem acesso' })).toBeVisible();
  await page.getByRole('button', { name: 'Terminar sessão' }).click();
  // administrador → painel com 5 áreas
  await login(page);
  await expect(page.getByRole('heading', { name: 'O que quer atualizar?' })).toBeVisible();
  for (const t of ['Notícias', 'A Nossa História', 'Órgãos Sociais', 'Documentos', 'Academia']) await expect(page.locator('.card-t', { hasText: t })).toBeVisible();
  // a sessão mantém-se ao recarregar
  await page.reload();
  await expect(page.getByRole('heading', { name: 'O que quer atualizar?' })).toBeVisible();
  // sessão inativa há mais de 8 h → pede nova autenticação
  await page.evaluate(() => localStorage.setItem('sfd-admin-last', String(Date.now() - 9 * 3600 * 1000)));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await expect(page.getByText('A sessão expirou por inatividade')).toBeVisible();
  await login(page);
  await logout(page);
  // recuperação de palavra-passe (resposta genérica)
  await page.getByRole('button', { name: 'Esqueci-me da palavra-passe' }).click();
  await page.getByLabel('Email').fill('qualquer@exemplo.pt');
  await page.getByRole('button', { name: 'Enviar ligação' }).click();
  await expect(page.getByText('Se o email tiver acesso ao painel')).toBeVisible();
});

test('notícias: criar rascunho, publicar, editar, despublicar e eliminar', async ({ page }) => {
  const title = `Teste de notícia ${RUN}`;
  await login(page);
  await nav(page, 'Notícias');
  await expect(page.getByTestId('news-row').first()).toBeVisible();
  await page.getByRole('link', { name: 'Nova notícia' }).click();
  await page.getByLabel('Título').fill(title);
  await page.getByLabel('Ficheiro da imagem de capa').setInputFiles({ name: 'capa.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByAltText('Pré-visualização da capa')).toBeVisible();
  const ed = page.getByRole('textbox', { name: 'Texto da notícia' });
  await ed.click();
  await page.keyboard.type('Primeiro parágrafo com ');
  await page.getByRole('button', { name: 'Negrito' }).click();
  await page.keyboard.type('texto forte');
  await page.getByRole('button', { name: 'Negrito' }).click();
  await page.keyboard.type('.');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Lista com marcas' }).click();
  await page.keyboard.type('Ponto um');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Ponto dois');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Visite o site oficial');
  // seleciona "site oficial" e cria link
  await ed.evaluate((el) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let t;
    while (w.nextNode()) if (w.currentNode.nodeValue.includes('site oficial')) t = w.currentNode;
    const r = document.createRange();
    r.setStart(t, t.nodeValue.indexOf('site oficial')); r.setEnd(t, t.nodeValue.length);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await page.getByRole('button', { name: 'Inserir link' }).click();
  await page.getByLabel('Endereço do link').fill('https://sfdamaiense.pt');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await page.getByRole('button', { name: 'Guardar rascunho' }).click();
  await expect(page.getByText('Guardada como rascunho.')).toBeVisible();
  const { data: n } = await service.from('news').select('*').eq('title', title).single();
  expect(n.status).toBe('draft');
  expect(n.cover_url).toContain('/storage/v1/object/public/noticias/');
  expect(JSON.stringify(n.body)).toContain('"bold":true');
  expect(n.body.some((b) => b.type === 'ul' && b.items.length === 2)).toBe(true);
  expect(JSON.stringify(n.body)).toContain('"href":"https://sfdamaiense.pt"');

  // rascunho não aparece no site
  const pub = await page.context().newPage();
  await pub.goto('/noticias/');
  await expect(pub.getByText('Renovação · André Couto', { exact: false }).first()).toBeVisible();
  await expect(pub.getByText(title)).toHaveCount(0);

  // publicar
  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.getByText('Notícia publicada no site.')).toBeVisible();
  await pub.goto('/noticias/');
  await expect(pub.getByText(title).first()).toBeVisible();
  await pub.goto('/noticia/#' + n.slug);
  const art = pub.locator('article.body');
  await expect(art.locator('strong', { hasText: 'texto forte' })).toBeVisible();
  await expect(art.locator('ul.rt li')).toHaveCount(2);
  await expect(art.locator('a[href="https://sfdamaiense.pt"]')).toHaveText('site oficial');
  await expect(pub.locator(`img[src="${n.cover_url}"]`).first()).toBeAttached();

  // editar → site atualizado
  await page.getByLabel('Título').fill(title + ' (editada)');
  await page.getByRole('button', { name: 'Guardar alterações' }).click();
  await expect(page.getByText('Alterações publicadas.')).toBeVisible();
  await pub.goto('/noticias/');
  await expect(pub.getByText(title + ' (editada)').first()).toBeVisible();

  // despublicar na listagem → desaparece do site
  await nav(page, 'Notícias');
  const row = page.getByTestId('news-row').filter({ hasText: title });
  await row.getByRole('button', { name: 'Despublicar' }).click();
  await expect(page.getByText('Notícia despublicada.')).toBeVisible();
  await pub.goto('/noticias/');
  await expect(pub.getByText('Renovação · André Couto', { exact: false }).first()).toBeVisible();
  await expect(pub.getByText(title)).toHaveCount(0);

  // eliminar (com confirmação) → registo e imagem apagados
  await row.getByRole('button', { name: /^Eliminar/ }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText('Notícia eliminada.')).toBeVisible();
  expect((await service.from('news').select('id').eq('id', n.id)).data.length).toBe(0);
  const path = decodeURIComponent(n.cover_url.split('/public/noticias/')[1]);
  const { data: files } = await service.storage.from('noticias').list(path.split('/')[0]);
  expect(files.some((f) => path.endsWith(f.name))).toBe(false);
  await pub.close();
});

test('A Nossa História: adicionar, ordenar, evitar duplicado, editar e eliminar', async ({ page }) => {
  await login(page);
  await nav(page, 'A Nossa História');
  const desc = `Inauguração de teste ${RUN}`;
  await page.getByRole('button', { name: 'Adicionar acontecimento' }).click();
  await page.getByLabel('Ano').fill('1975');
  await page.getByLabel('Descrição').fill(desc);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Acontecimento adicionado à cronologia.')).toBeVisible();
  const years = await page.locator('.tl-year').allTextContents();
  expect(years).toEqual([...years].sort());
  // duplicado
  await page.getByRole('button', { name: 'Adicionar acontecimento' }).click();
  await page.getByLabel('Ano').fill('1975');
  await page.getByLabel('Descrição').fill(desc);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Este acontecimento já existe nesse ano.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  // site público: aparece entre 1938 e 2026
  const pub = await page.context().newPage();
  await pub.goto('/clube/');
  const tl = pub.locator('#historia [data-tl]');
  await expect(tl.filter({ hasText: desc })).toHaveCount(1);
  const pubYears = await pub.locator('#historia [data-tl]').evaluateAll((els) => els.map((e) => e.innerText.trim().split(/\s+/)[0]));
  expect(pubYears).toEqual(['1938', '1975', '2026']);
  // editar
  await page.getByRole('button', { name: 'Editar 1975' }).click();
  await page.getByLabel('Ano').fill('1976');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Acontecimento atualizado.')).toBeVisible();
  await pub.reload();
  await expect(pub.locator('#historia [data-tl]', { hasText: '1976' })).toHaveCount(1);
  // eliminar
  await page.getByRole('button', { name: 'Eliminar 1976' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText('Entrada eliminada.')).toBeVisible();
  await pub.reload();
  await expect(pub.locator('#historia [data-tl]', { hasText: desc })).toHaveCount(0);
  await pub.close();
});

test('Órgãos Sociais: editar nome e mandato reflete-se no site', async ({ page }) => {
  await login(page);
  await nav(page, 'Órgãos Sociais');
  const dir = page.getByTestId('body-direcao');
  await dir.getByRole('button', { name: 'Editar Presidente' }).click();
  const name = 'Nome Teste ' + RUN;
  await dir.getByLabel('Nome completo').fill(name);
  await dir.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Membro atualizado.')).toBeVisible();
  await expect(dir.getByText(name)).toBeVisible();
  const pub = await page.context().newPage();
  await pub.goto('/clube/');
  await expect(pub.locator('#orgaos').getByText(name)).toBeVisible();
  // adicionar e reordenar
  await dir.getByRole('button', { name: 'Adicionar membro' }).click();
  await dir.getByLabel('Cargo').fill('Vogal');
  await dir.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Membro adicionado.')).toBeVisible();
  await expect(dir.getByTestId('member-row').last()).toContainText('Vogal');
  await dir.getByTestId('member-row').last().getByRole('button', { name: 'Subir' }).click();
  await expect(dir.getByTestId('member-row').nth(3)).toContainText('Vogal');
  await dir.getByTestId('member-row').nth(3).getByRole('button', { name: 'Eliminar Vogal' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText('Membro eliminado.')).toBeVisible();
  // repor
  await dir.getByRole('button', { name: 'Editar Presidente' }).click();
  await dir.getByLabel('Nome completo').fill('');
  await dir.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Membro atualizado.')).toBeVisible();
  await pub.close();
});

test('Documentos: carregar PDF, recusar outro tipo, substituir e eliminar', async ({ page }) => {
  await login(page);
  await nav(page, 'Documentos');
  const title = 'Estatutos teste ' + RUN;
  await page.getByRole('button', { name: 'Adicionar documento' }).click();
  await page.getByLabel('Título').fill(title);
  // ficheiro que não é PDF
  await page.getByLabel('Ficheiro PDF', { exact: true }).setInputFiles({ name: 'falso.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<html>não é pdf</html>') });
  await expect(page.getByText('O ficheiro não é um PDF válido.')).toBeVisible();
  await page.getByLabel('Ficheiro PDF', { exact: true }).setInputFiles({ name: 'estatutos.pdf', mimeType: 'application/pdf', buffer: pdf('v1') });
  await page.getByRole('button', { name: 'Adicionar documento' }).last().click();
  await expect(page.getByText('Documento publicado no site.')).toBeVisible();
  const { data: d1 } = await service.from('documents').select('*').eq('title', title).single();
  const pub = await page.context().newPage();
  await pub.goto('/clube/');
  const link = pub.locator('#documentos a.doc', { hasText: title });
  await expect(link).toBeVisible();
  const href1 = await link.getAttribute('href');
  expect(href1).toContain('/storage/v1/object/public/documentos/' + d1.file_path);
  expect((await pub.request.get(href1)).status()).toBe(200);
  // substituir
  const row = page.getByTestId('doc-row').filter({ hasText: title });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), row.getByRole('button', { name: 'Substituir' }).click()]);
  await chooser.setFiles({ name: 'estatutos-v2.pdf', mimeType: 'application/pdf', buffer: pdf('v2') });
  await page.getByRole('alertdialog').getByRole('button', { name: 'Substituir' }).click();
  await expect(page.getByText('Ficheiro substituído.')).toBeVisible();
  const { data: d2 } = await service.from('documents').select('*').eq('id', d1.id).single();
  expect(d2.file_path).not.toBe(d1.file_path);
  await pub.reload();
  const href2 = await pub.locator('#documentos a.doc', { hasText: title }).getAttribute('href');
  expect(href2).toContain(d2.file_path);
  expect((await pub.request.get(href2)).status()).toBe(200);
  expect((await pub.request.get(href1)).status()).toBeGreaterThanOrEqual(400); // ficheiro antigo removido
  // eliminar
  await row.getByRole('button', { name: 'Eliminar ' + title }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText('Documento eliminado.')).toBeVisible();
  await pub.reload();
  await expect(pub.locator('#documentos a.doc', { hasText: title })).toHaveCount(0);
  expect((await pub.request.get(href2)).status()).toBeGreaterThanOrEqual(400);
  await pub.close();
});

test('Academia: alterar horário reflete-se na tabela pública', async ({ page }) => {
  await login(page);
  await nav(page, 'Academia');
  const row = page.getByTestId('academy-row').filter({ hasText: 'Benjamins' });
  await row.getByRole('button', { name: 'Editar Benjamins' }).click();
  const form = page.locator('tr.editing');
  await form.getByRole('button', { name: 'Ter', exact: true }).click();
  await form.getByRole('button', { name: 'Qui', exact: true }).click();
  await form.getByLabel('Hora de início').fill('18:30');
  await form.getByLabel('Hora de fim').fill('18:00');
  await form.getByRole('button', { name: 'Guardar alterações' }).click();
  await expect(form.getByText('O fim tem de ser depois do início.')).toBeVisible();
  await form.getByLabel('Hora de fim').fill('19:45');
  await form.getByLabel('Local de treino').fill('Campo Municipal ' + RUN);
  await form.getByLabel('Observações').fill('Trazer garrafa de água');
  await form.getByRole('button', { name: 'Guardar alterações' }).click();
  await expect(page.getByText('Horário atualizado no site.')).toBeVisible();
  await expect(row).toContainText('Ter · Qui');
  await expect(row).toContainText('18:30–19:45');
  const pub = await page.context().newPage();
  await pub.goto('/academia/');
  const tr = pub.locator('table.ht tbody tr', { hasText: 'Benjamins' });
  await expect(tr).toContainText('Ter · Qui');
  await expect(tr).toContainText('18h30–19h45');
  await expect(tr).toContainText('Campo Municipal ' + RUN);
  await expect(tr).toContainText('Trazer garrafa de água');
  await expect(pub.locator('table.ht thead')).toContainText('Local');
  // nota da tabela
  await page.getByLabel('Nota por baixo da tabela').fill('Nota de teste ' + RUN);
  await page.getByRole('button', { name: 'Guardar nota' }).click();
  await expect(page.getByText('Nota atualizada.')).toBeVisible();
  await pub.reload();
  await expect(pub.getByText('Nota de teste ' + RUN)).toBeVisible();
  // adicionar e eliminar linha
  await page.getByRole('button', { name: 'Adicionar horário' }).click();
  await page.locator('.panel').first().getByLabel('Escalão', { exact: true }).fill('Escalão Teste');
  await page.locator('.panel').first().getByRole('button', { name: 'Guardar alterações' }).click();
  await expect(page.getByText('Horário adicionado.')).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar Escalão Teste' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText('Linha eliminada.')).toBeVisible();
  // repor dados
  await service.from('academy_schedule').update({ dias: [], hora_inicio: null, hora_fim: null, local: null, observacoes: null }).eq('escalao', 'Benjamins');
  await service.from('site_texts').update({ value: 'Horários da época 2026/27 a confirmar com a coordenação. Competições ao fim de semana (sábado ou domingo).' }).eq('key', 'academia_nota');
  await pub.close();
});

test('site público mantém o funcionamento (menu e formulários)', async ({ page }) => {
  await page.goto('/contactos/');
  const input = page.locator('input, textarea').first();
  await input.fill('Texto escrito pelo visitante');
  await page.waitForTimeout(400);
  await expect(input).toHaveValue('Texto escrito pelo visitante');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  const burger = page.locator('.v2-burger');
  if (await burger.isVisible()) {
    await burger.click();
    await expect(page.getByRole('link', { name: /Notícias/ }).first()).toBeVisible();
  }
});
