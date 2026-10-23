-- SF Damaiense — Painel de gestão do website
-- Tabelas de conteúdo, administradores, auditoria, RLS e armazenamento.
-- A segurança está toda aqui (base de dados), não no frontend.

-- ───────────────────────── Administradores ─────────────────────────
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.admins is 'Contas com acesso ao painel. Só se gerem por SQL / service_role (sem registo público).';

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid() and a.active);
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ───────────────────────── Texto formatado (seguro) ─────────────────────────
-- O texto das notícias é guardado como JSON estruturado (sem HTML):
-- [{"type":"p","parts":[{"text":"...","bold":true,"href":"https://..."}]},
--  {"type":"ul","items":[[{"text":"..."}], ...]}, {"type":"ol","items":[...]}]
create or replace function public.sfd_valid_parts(p jsonb)
returns boolean language plpgsql immutable as $$
declare part jsonb; k text;
begin
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 300 then return false; end if;
  for part in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(part) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(part) loop
      if k not in ('text', 'bold', 'href') then return false; end if;
    end loop;
    if jsonb_typeof(part->'text') is distinct from 'string' then return false; end if;
    if length(part->>'text') > 20000 then return false; end if;
    if part ? 'bold' and jsonb_typeof(part->'bold') <> 'boolean' then return false; end if;
    if part ? 'href' and (jsonb_typeof(part->'href') <> 'string'
        or (part->>'href') !~* '^(https?://[^\s<>"]+|mailto:[^\s<>"]+)$'
        or length(part->>'href') > 2000) then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.sfd_valid_rich(b jsonb)
returns boolean language plpgsql immutable as $$
declare blk jsonb; it jsonb; k text;
begin
  if jsonb_typeof(b) <> 'array' or jsonb_array_length(b) = 0 or jsonb_array_length(b) > 400 then return false; end if;
  for blk in select * from jsonb_array_elements(b) loop
    if jsonb_typeof(blk) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(blk) loop
      if k not in ('type', 'parts', 'items') then return false; end if;
    end loop;
    if blk->>'type' = 'p' then
      if blk ? 'items' or not public.sfd_valid_parts(blk->'parts') then return false; end if;
    elsif blk->>'type' in ('ul', 'ol') then
      if blk ? 'parts' or jsonb_typeof(blk->'items') <> 'array' or jsonb_array_length(blk->'items') > 200 then return false; end if;
      for it in select * from jsonb_array_elements(blk->'items') loop
        if not public.sfd_valid_parts(it) then return false; end if;
      end loop;
    else
      return false;
    end if;
  end loop;
  return true;
end $$;

-- ───────────────────────── Conteúdos ─────────────────────────
create table public.news (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 120),
  title        text not null check (length(btrim(title)) between 3 and 200),
  category     text not null default 'Clube' check (category in ('Clube', 'Futebol', 'Formação')),
  cover_url    text check (cover_url is null or cover_url ~ '^(/|https://|http://(127\.0\.0\.1|localhost)(:[0-9]+)?/)[^\s<>"]*$'),
  published_at date not null default current_date,
  body         jsonb not null check (public.sfd_valid_rich(body)),
  status       text not null default 'draft' check (status in ('draft', 'published')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null
);
create index news_public_idx on public.news (status, published_at desc);

create table public.history_events (
  id          uuid primary key default gen_random_uuid(),
  year        integer not null check (year between 1900 and 2100),
  description text not null check (length(btrim(description)) between 3 and 1200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  updated_by  uuid references auth.users (id) on delete set null
);
-- Evita entradas duplicadas por erro (mesmo ano + mesma descrição).
create unique index history_events_dedupe on public.history_events (year, lower(btrim(description)));

-- Estrutura oficial dos órgãos (fixa: o painel não cria órgãos novos).
create table public.board_bodies (
  id   text primary key,
  name text not null unique,
  sort smallint not null
);

create table public.board_members (
  id         uuid primary key default gen_random_uuid(),
  body_id    text not null references public.board_bodies (id),
  role       text not null check (length(btrim(role)) between 2 and 80),
  full_name  text check (full_name is null or length(btrim(full_name)) between 2 and 120),
  mandate    text check (mandate is null or mandate ~ '^[0-9]{4}(/[0-9]{2,4})?$|^[0-9]{4}[-–][0-9]{4}$'),
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null
);
create index board_members_order on public.board_members (body_id, sort);

create table public.documents (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(btrim(title)) between 2 and 160),
  category   text not null check (category in ('Estatutos e regulamentos', 'Relatórios e contas', 'Assembleia Geral', 'Outros')),
  file_path  text not null check (file_path ~ '^[a-z0-9][a-z0-9/_.-]*\.pdf$'),
  file_size  integer check (file_size between 1 and 15728640),
  doc_date   date,
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null
);

create table public.academy_schedule (
  id          uuid primary key default gen_random_uuid(),
  escalao     text not null check (length(btrim(escalao)) between 2 and 60),
  idade       text check (idade is null or length(btrim(idade)) between 1 and 40),
  dias        smallint[] not null default '{}' check (dias <@ array[1,2,3,4,5,6,7]::smallint[]),
  hora_inicio time,
  hora_fim    time,
  local       text check (local is null or length(btrim(local)) between 2 and 120),
  treinador   text check (treinador is null or length(btrim(treinador)) between 2 and 120),
  observacoes text check (observacoes is null or length(btrim(observacoes)) between 1 and 300),
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  updated_by  uuid references auth.users (id) on delete set null,
  check (hora_fim is null or hora_inicio is null or hora_fim > hora_inicio)
);

-- Textos soltos editáveis (ex.: nota por baixo da tabela da Academia).
create table public.site_texts (
  key        text primary key check (key in ('academia_nota')),
  value      text not null check (length(value) <= 600),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- ───────────────────────── Auditoria ─────────────────────────
create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  email      text,
  table_name text not null,
  action     text not null,
  record_id  text,
  summary    text
);

create or replace function public.sfd_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

create or replace function public.sfd_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb; o jsonb; s text;
begin
  if tg_op = 'DELETE' then r := to_jsonb(old); else r := to_jsonb(new); end if;
  if tg_op = 'UPDATE' then o := to_jsonb(old); end if;
  s := left(coalesce(r->>'title', r->>'full_name', r->>'escalao', r->>'role', r->>'key', r->>'year'), 200);
  if o is not null and (o->>'status') is distinct from (r->>'status') then
    s := s || ' → ' || (r->>'status');
  end if;
  insert into public.audit_log (user_id, email, table_name, action, record_id, summary)
  values (auth.uid(), (select email from public.admins where user_id = auth.uid()),
          tg_table_name, lower(tg_op), coalesce(r->>'id', r->>'key'), s);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['news', 'history_events', 'board_members', 'documents', 'academy_schedule'] loop
    execute format('create trigger %1$s_touch before insert or update on public.%1$s for each row execute function public.sfd_touch()', t);
  end loop;
  foreach t in array array['news', 'history_events', 'board_members', 'documents', 'academy_schedule', 'site_texts'] loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function public.sfd_audit()', t);
  end loop;
end $$;

create or replace function public.sfd_touch_text()
returns trigger language plpgsql security definer set search_path = public as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
create trigger site_texts_touch before insert or update on public.site_texts for each row execute function public.sfd_touch_text();

-- ───────────────────────── RLS ─────────────────────────
alter table public.admins           enable row level security;
alter table public.news             enable row level security;
alter table public.history_events   enable row level security;
alter table public.board_bodies     enable row level security;
alter table public.board_members    enable row level security;
alter table public.documents        enable row level security;
alter table public.academy_schedule enable row level security;
alter table public.site_texts       enable row level security;
alter table public.audit_log        enable row level security;

-- Cada pessoa só vê o próprio registo (para o painel saber se tem acesso).
create policy admins_self on public.admins for select to authenticated using (user_id = auth.uid());

-- Notícias: público só vê as publicadas com data já atingida; administradores veem e gerem tudo.
create policy news_public on public.news for select to anon, authenticated
  using (status = 'published' and published_at <= current_date);
create policy news_admin_read on public.news for select to authenticated using (public.is_admin());
create policy news_admin_ins  on public.news for insert to authenticated with check (public.is_admin());
create policy news_admin_upd  on public.news for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy news_admin_del  on public.news for delete to authenticated using (public.is_admin());

-- Restantes conteúdos: leitura pública, escrita só administradores.
do $$
declare t text;
begin
  foreach t in array array['history_events', 'board_members', 'documents', 'academy_schedule', 'site_texts'] loop
    execute format('create policy %1$s_read on public.%1$s for select to anon, authenticated using (true)', t);
    execute format('create policy %1$s_ins on public.%1$s for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy %1$s_upd on public.%1$s for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy %1$s_del on public.%1$s for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;
create policy board_bodies_read on public.board_bodies for select to anon, authenticated using (true);
create policy audit_admin_read on public.audit_log for select to authenticated using (public.is_admin());

-- Privilégios mínimos (o RLS decide o resto).
revoke all on all tables in schema public from anon, authenticated;
grant select on public.news, public.history_events, public.board_bodies, public.board_members,
  public.documents, public.academy_schedule, public.site_texts to anon, authenticated;
grant insert, update, delete on public.news, public.history_events, public.board_members,
  public.documents, public.academy_schedule to authenticated;
grant insert, update on public.site_texts to authenticated;
grant select on public.admins, public.audit_log to authenticated;
-- Colunas de controlo nunca vêm do cliente (os triggers preenchem-nas).

-- ───────────────────────── Armazenamento ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('noticias',   'noticias',   true, 5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('documentos', 'documentos', true, 15728640, array['application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy sfd_storage_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('noticias', 'documentos') and public.is_admin()
    and (bucket_id <> 'documentos' or lower(name) ~ '\.pdf$')
    and (bucket_id <> 'noticias' or lower(name) ~ '\.(jpe?g|png|webp)$'));
create policy sfd_storage_admin_update on storage.objects for update to authenticated
  using (bucket_id in ('noticias', 'documentos') and public.is_admin())
  with check (bucket_id in ('noticias', 'documentos') and public.is_admin());
create policy sfd_storage_admin_delete on storage.objects for delete to authenticated
  using (bucket_id in ('noticias', 'documentos') and public.is_admin());
create policy sfd_storage_admin_select on storage.objects for select to authenticated
  using (bucket_id in ('noticias', 'documentos') and public.is_admin());
