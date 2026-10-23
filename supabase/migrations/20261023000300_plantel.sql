-- SF Damaiense — Plantéis (jogadores por equipa) geridos no painel.

create table public.players (
  id         uuid primary key default gen_random_uuid(),
  team       text not null check (team in ('a', 's19', 's17', 's15')),
  full_name  text not null check (length(btrim(full_name)) between 2 and 80),
  number     smallint check (number between 1 and 99),
  position   text check (position in ('Guarda-redes', 'Defesa', 'Médio', 'Avançado')),
  photo_url  text check (photo_url is null or photo_url ~ '^(/|https://|http://(127\.0\.0\.1|localhost)(:[0-9]+)?/)[^\s<>"]*$'),
  featured   boolean not null default false,
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null
);
create index players_team_idx on public.players (team, number);

create trigger players_touch before insert or update on public.players for each row execute function public.sfd_touch();
create trigger players_audit after insert or update or delete on public.players for each row execute function public.sfd_audit();

alter table public.players enable row level security;
create policy players_read on public.players for select to anon, authenticated using (true);
create policy players_ins on public.players for insert to authenticated with check (public.is_admin());
create policy players_upd on public.players for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy players_del on public.players for delete to authenticated using (public.is_admin());
grant select on public.players to anon, authenticated;
grant insert, update, delete on public.players to authenticated;

-- Fotografias dos atletas
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('plantel', 'plantel', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists sfd_storage_admin_insert on storage.objects;
drop policy if exists sfd_storage_admin_update on storage.objects;
drop policy if exists sfd_storage_admin_delete on storage.objects;
drop policy if exists sfd_storage_admin_select on storage.objects;
create policy sfd_storage_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('noticias', 'documentos', 'plantel') and public.is_admin()
    and (bucket_id <> 'documentos' or lower(name) ~ '\.pdf$')
    and (bucket_id = 'documentos' or lower(name) ~ '\.(jpe?g|png|webp)$'));
create policy sfd_storage_admin_update on storage.objects for update to authenticated
  using (bucket_id in ('noticias', 'documentos', 'plantel') and public.is_admin())
  with check (bucket_id in ('noticias', 'documentos', 'plantel') and public.is_admin());
create policy sfd_storage_admin_delete on storage.objects for delete to authenticated
  using (bucket_id in ('noticias', 'documentos', 'plantel') and public.is_admin());
create policy sfd_storage_admin_select on storage.objects for select to authenticated
  using (bucket_id in ('noticias', 'documentos', 'plantel') and public.is_admin());

-- Plantéis atuais (Equipa A, Sub-19, Sub-17; Sub-15 por publicar). Sem posição = "a confirmar".
insert into public.players (team, full_name, number, position, photo_url, featured, sort) values
  ('a','Ricardo Silva',1,'Guarda-redes','/assets/d95533ddef9fe89abd724eafc36ed742.jpg',true,10),
  ('a','Gabriel Nascimento',2,'Defesa','/assets/81517935cb61df24ddc00ad41c937ae4.jpg',true,20),
  ('a','João Felício',4,null,'/assets/de3701c4651b03564fc31962977e1881.jpg',false,30),
  ('a','Miguel Ivo',6,null,'/assets/03e1c4568bd5e905fe2521a660e18248.jpg',false,40),
  ('a','Gerson Horta',7,'Avançado','/assets/0924e6811e5ba26ac7799eb4f57b0dde.jpg',true,50),
  ('a','Tiago Fernandes',8,null,'/assets/0ff6210668661ac64f6847cc3f5b6b52.jpg',false,60),
  ('a','Rodrigo Conde',9,null,'/assets/72e8ca12479397479ba65f229e1550f2.jpg',false,70),
  ('a','Rodrigo Castro',10,null,'/assets/17c3e558eaf920969b425f9db131e728.jpg',false,80),
  ('a','Bruno Mané',11,'Avançado','/assets/edf45eed6646285cdcf41497e47c1014.jpg',true,90),
  ('a','André Anciães',12,'Guarda-redes','/assets/4b39531ba62f66541f113c77d6414bc7.jpg',false,100),
  ('a','Francisco Moreira',13,'Defesa','/assets/9bb05d87a09b062961e0281a4b404aaa.jpg',true,110),
  ('a','Gonçalo Costa',14,'Médio','/assets/34b5c56d9010015b2c5931e4878d3462.jpg',true,120),
  ('a','Walson Bastos',15,null,'/assets/a6759c9dba112d3a7f7ef4b8aa75d26d.jpg',false,130),
  ('a','Bruno Mendes',17,'Avançado','/assets/be41e4d6e2dacd5f47a0a9e1689d3d44.jpg',true,140),
  ('a','Gonçalo Silva',18,null,'/assets/8d48d90cba14bc2d029439f3318b2952.jpg',false,150),
  ('a','Zidane',19,null,'/assets/da9e68f6e6d67b2096ab9aad133dbca8.jpg',false,160),
  ('a','Tiago Santos',20,null,'/assets/7b56ccdbfb0bd91f80641b52fe2fab67.jpg',false,170),
  ('a','Pedro Albino',21,'Médio','/assets/2134bdeec210c458cd148a33e0475739.jpg',true,180),
  ('a','Rúben Silva',23,'Defesa','/assets/d6d408f584ff44119fef8fbaec743145.jpg',false,190),
  ('a','Tiago Oliveira',25,null,'/assets/b51a9845812c60443536b1f629d31b77.jpg',false,200),
  ('a','Tomás Silva',26,null,'/assets/82dd2c6d4e7ba5796a449e68abeae857.jpg',false,210),
  ('a','Francisco Valério',27,null,'/assets/e0ac3573bb77ba9bb3ac45e525c040af.jpg',false,220),
  ('a','Rafael Marques',30,null,'/assets/2dc9dd312ffd1c7c788dbd8fe3b9c45a.jpg',false,230),
  ('a','José Lourenço',31,'Avançado','/assets/886bf95f98b216ed4a25742011e07b1b.jpg',false,240),
  ('a','Lauro Moniz',33,'Defesa','/assets/6aa9cac587b3c0ddaca8753ecded8721.jpg',false,250),
  ('a','Rodrigo Urbano',34,'Defesa','/assets/c35284fc08b5aa05275ac3c10e20cf89.jpg',false,260),
  ('a','Gonçalo Ferreira',null,null,'/assets/86054a1f6088cf91827b0ca7f8e9cc16.jpg',false,270),
  ('a','Rafael Ribeiro',null,null,'/assets/ef3359fa35db0191df14d30d0d764617.jpg',false,280),
  ('s19','Seco Cassamá',5,'Defesa','/assets/dfbdf46b9d9f7c7aed85aa140ad772b8.jpg',false,10),
  ('s19','Luís Gomes',6,'Médio','/assets/bcf21025fd0131e494d0a050747ac6a1.jpg',false,20),
  ('s19','Dinis Ladeira',6,'Médio','/assets/aab68bbfdb3ea76abb7d253f70ca9ffc.jpg',false,30),
  ('s19','António Morais',7,'Avançado','/assets/b7a3a7bc8835d62cacd5ebf26f406cb8.jpg',false,40),
  ('s19','Artur Santos',8,'Médio','/assets/7d93b130884e03c8bba3cc9e35b1b47f.jpg',false,50),
  ('s19','André Delgado',9,'Avançado','/assets/28678834cfdb6ea3d6125a7db0db5ffa.jpg',false,60),
  ('s19','Gustavo Gomes',10,'Avançado','/assets/279c4e6f08a78dd21a0931d2c0978c2f.jpg',false,70),
  ('s19','João Lopes',12,'Guarda-redes','/assets/ff6e9c68f91e09f366ef4f2a000d35bc.jpg',false,80),
  ('s19','Rafael Calvino',22,'Defesa','/assets/2fefed3a2ef044bcecbaa8a945ee472b.jpg',false,90),
  ('s19','Hassan Baldé',22,'Médio','/assets/2af8d2786c133380787b3b0978bf8f6b.jpg',false,100),
  ('s19','Tomás Magalhães',26,'Médio','/assets/a29170a008478bffb7562f30e6a78f12.jpg',false,110),
  ('s19','Diogo Marques',27,'Defesa','/assets/e29e4c72bd66e59b2f21036ea5a5499d.jpg',false,120),
  ('s19','Diogo Martinho',28,'Guarda-redes','/assets/96fcce76a2cb2d5830bde0ccaf00e56d.jpg',false,130),
  ('s19','Gonçalo Madruga',30,'Avançado','/assets/e59a967b93df1b93442294fa4bd7c335.jpg',false,140),
  ('s19','Amílcar Napoco',99,'Avançado',null,false,150),
  ('s19','André Ferreira',null,'Avançado','/assets/9cdee8de6465893c2a711f90950c6448.jpg',false,160),
  ('s17','Rodrigo Pinto',4,'Defesa','/assets/8a9a7280863c5a39c267a908fb0e80ba.jpg',false,10),
  ('s17','Martim Sá Cruz',6,'Médio','/assets/6e88a69aef307fb7e432cb86bb1d3e25.jpg',false,20),
  ('s17','Eduardo Santos',11,'Avançado','/assets/f9040b16d28bf8917ca9af23ce2b07d5.jpg',false,30),
  ('s17','Rodrigo Teixeira',66,'Defesa','/assets/d10c2a9006292c4a7e68dfe64ff761cf.jpg',false,40),
  ('s17','Simão Carvalheiro',72,'Defesa','/assets/4bc385972f24838e13d261cd14454fd0.jpg',false,50),
  ('s17','Gabriel Reis C',77,'Avançado','/assets/550e5480450c510684b5082747e3ff5e.jpg',false,60),
  ('s17','Rodrigo Antunes',null,'Guarda-redes','/assets/a952bc3af19b706565299cd033c2281c.jpg',false,70),
  ('s17','Mauro Coimbra',null,'Defesa','/assets/2dd78415f291e1f67967d2b18cea00aa.jpg',false,80),
  ('s17','Rafael Rosário',null,'Defesa','/assets/f40f3fff50e2791e2013c8c1200bef71.jpg',false,90),
  ('s17','Caetano',null,'Defesa',null,false,100),
  ('s17','Gabriel Amaral',null,'Médio','/assets/7faf418b5fbca773e41d02428ceba03f.jpg',false,110),
  ('s17','Diego Fernandes',null,'Avançado','/assets/11cc8c04ef930999a136bd2440f92d62.jpg',false,120),
  ('s17','Janilson Moura',null,'Avançado','/assets/cb676ac59ab3719d6b55ae5bd4824bce.jpg',false,130);
delete from public.audit_log where table_name = 'players';
