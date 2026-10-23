# SF Damaiense: website oficial e painel de gestão

Este repositório tem o site público do SF Damaiense e o painel privado em `/admin`. O painel serve para os responsáveis do clube atualizarem conteúdos sem programar.

O painel tem seis áreas: **Notícias**, **A Nossa História**, **Órgãos Sociais**, **Documentos**, **Academia** e **Plantéis** (atletas da Equipa A, Sub-19, Sub-17 e Sub-15: nome, número, posição, fotografia e destaque na página inicial). Jogos, resultados e torneios ficam fora daqui, porque pertencem à app do Torneio de Páscoa.

## Como está organizado

| Pasta | O que é |
|---|---|
| `site/` | O site publicado no Netlify. São as páginas públicas exportadas do protótipo, `assets/` (imagens e vídeos) e `js/`. |
| `site/js/sfd-content.js` | Lê da base de dados o que o painel publica e entrega esses dados às páginas. |
| `site/js/dc-runtime.js` | Motor das páginas. Desenha cada página e, quando algo muda, só atualiza o que mudou. |
| `admin/` | Código do painel (Preact + Vite). É compilado para `site/admin/`. |
| `supabase/migrations/` | Base de dados: tabelas, regras de segurança (RLS), armazenamento, registo de alterações e os conteúdos atuais. |
| `netlify/functions/youtube.mjs` | Damaiense TV automática: lê o canal @damaiensetv (feed público, sem chave) e devolve os 15 vídeos mais recentes em `/api/youtube`, com títulos limpos e etiqueta (Direto, Resumo, Golos, Entrevista, Short). O Netlify guarda a resposta 1 hora. |
| `scripts/` | `write-config.mjs` gera o `config.js` no Netlify. `criar-admin.mjs` dá ou retira acesso ao painel. |
| `tests/` | Testes de segurança da base de dados e testes de ponta a ponta (computador e telemóvel). |

## Como funciona

1. O administrador entra em `/admin` com email e palavra-passe (Supabase Auth). Não existe registo público de contas.
2. Cada alteração é validada no painel e depois outra vez na base de dados, com restrições e RLS. Mesmo que alguém esconda ou contorne o painel, a base de dados recusa escritas de quem não está na tabela `admins`.
3. As páginas públicas leem as notícias publicadas, a cronologia, os órgãos, os documentos e os horários sempre que são abertas. Se a base de dados não responder, mostram o conteúdo que já trazem escrito.
4. Cada alteração fica no `audit_log`, com quem a fez, quando e o quê. Esse registo não pode ser apagado a partir do site.

### Segurança

- No site só existe a chave pública (`anon`). A chave `service_role` nunca entra no site nem no Netlify. Só é usada no seu computador, para gerir administradores.
- O texto das notícias é guardado como JSON estruturado (parágrafos, negrito, listas e links), sem HTML. A base de dados recusa qualquer outra estrutura, e também links `javascript:`.
- Ficheiros:
  - Documentos: só PDF, até 15 MB. O painel confirma que o ficheiro começa por `%PDF-`.
  - Imagens de capa: só JPG, PNG ou WebP, até 5 MB. O painel reduz automaticamente as fotografias grandes.
  - Os executáveis, o HTML e o SVG são recusados pelo próprio armazenamento.
- Sessão:
  - Mantém-se ao recarregar a página e é renovada automaticamente.
  - É validada no servidor ao abrir o painel.
  - Termina ao fim de 8 horas sem atividade.
- O endereço `/admin` não aparece no site e não é indexado (`noindex`). Também não usa cache e tem uma política de conteúdo restrita (CSP). Ainda assim, o endereço escondido **não** é a proteção: quem protege são as regras da base de dados.

## Damaiense TV

Os vídeos novos do canal aparecem sozinhos no site, até 1 hora depois de saírem no YouTube, sem ninguém mexer no painel. Se o YouTube não responder, o site mostra a última lista que conhece.

## Pôr em produção (uma vez)

### 1. Supabase

1. Crie um projeto em supabase.com, na região Europa.
2. Ligue o projeto e aplique as migrações:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-do-projeto>
   npx supabase db push
   ```
   Isto cria as tabelas, as regras e os buckets `noticias` e `documentos`. Também importa os conteúdos atuais: 27 notícias, a cronologia (1938 e 2026), os cargos dos órgãos sociais e os horários da Academia.
3. Em **Authentication → Sign In / Providers**, deixe **Email** ligado e **Allow new users to sign up** desligado.
4. Em **Authentication → URL Configuration**:
   - Site URL: `https://sfdamaiense.pt`
   - Redirect URLs: `https://sfdamaiense.pt/admin/`
5. Em **Authentication → Emails → SMTP**, configure o envio de emails pelo domínio do clube. Os convites e a recuperação de palavra-passe dependem disto.

### 2. Netlify

1. Ligue este repositório ao Netlify. As definições estão em `netlify.toml`: publica a pasta `site` e compila o painel.
2. Em **Site settings → Environment variables**, crie:
   - `SUPABASE_URL`: o URL do projeto.
   - `SUPABASE_ANON_KEY`: a chave **anon / public**. Se for colada a `service_role` por engano, a compilação para.
3. Aponte o domínio `sfdamaiense.pt` para o Netlify. Mantenha os registos MX para o email não deixar de funcionar.

### 3. Dar acesso ao painel

Corra no seu computador, com a chave `service_role`:

```bash
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/criar-admin.mjs presidente@sfdamaiense.pt "Nome da Pessoa"
```

A pessoa recebe um email de convite e define a palavra-passe. A partir daí tem acesso ao painel.

Para retirar o acesso: `node scripts/criar-admin.mjs --remover email@...`

## Desenvolvimento e testes

Precisa de Docker e de Node 22.

```bash
npm install
npx supabase start          # base de dados local, já com os conteúdos
npm run site:local          # site + painel em http://127.0.0.1:8888 (painel em /admin/)
npm test                    # testes de segurança + testes de ponta a ponta
```

Os testes cobrem:

- Login e logout, palavra-passe errada, conta sem permissão, sessão persistente, expiração por inatividade e recuperação de palavra-passe.
- Notícias:
  - criar rascunho com imagem, negrito, lista e link;
  - publicar e ver no site;
  - editar e despublicar;
  - eliminar, incluindo a imagem.
- História:
  - adicionar e confirmar a ordem no site;
  - recusar duplicados;
  - editar e eliminar.
- Órgãos Sociais: editar o nome (aparece em `/clube/`), adicionar, reordenar e eliminar.
- Documentos:
  - carregar um PDF;
  - recusar um ficheiro falso;
  - substituir o ficheiro (o antigo deixa de existir);
  - eliminar.
- Academia: dias, horas, local e observações na tabela pública de `/academia/`, validação das horas, nota da tabela, adicionar e eliminar.
- API direta: um visitante ou uma conta sem permissão não consegue escrever, carregar ficheiros nem ler o registo de alterações.

## Onde os conteúdos aparecem

| Área do painel | Página pública |
|---|---|
| Notícias | Início (4 mais recentes), `/noticias/` e `/noticia/#<slug>` |
| A Nossa História | `/clube/`, secção "A nossa história" |
| Órgãos Sociais | `/clube/`, secção "Órgãos sociais" |
| Documentos | `/clube/`, secção "Documentos" (abre o PDF) |
| Academia | `/academia/`, tabela de horários e nota |
| Plantéis | `/futebol/` (Equipa A e formação) e página inicial ("Quem veste a camisola", atletas em destaque) |
