// Dá acesso ao painel a uma pessoa. Corre no seu computador (NUNCA no site):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/criar-admin.mjs email@exemplo.pt "Nome"
// Envia um convite por email (a pessoa define a palavra-passe) e regista-a como administradora.
// Para retirar o acesso: node scripts/criar-admin.mjs --remover email@exemplo.pt
import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });
const args = process.argv.slice(2);
const remove = args[0] === '--remover'; if (remove) args.shift();
const [email, name] = args;
if (!email || !/^\S+@\S+\.\S+$/.test(email)) { console.error('Indique um email válido.'); process.exit(1); }
const site = process.env.SITE_URL || 'https://sfdamaiense.pt';

async function findUser(e) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => (x.email || '').toLowerCase() === e.toLowerCase());
    if (u) return u; if (data.users.length < 200) return null;
  }
  return null;
}
const user = await findUser(email);
if (remove) {
  if (!user) { console.log('Conta não encontrada.'); process.exit(0); }
  const { error } = await sb.from('admins').update({ active: false }).eq('user_id', user.id);
  if (error) throw error;
  await sb.auth.admin.signOut?.(user.id).catch(() => {});
  console.log('Acesso retirado a', email); process.exit(0);
}
let u = user;
if (!u) {
  const { data, error } = await sb.auth.admin.inviteUserByEmail(email, { redirectTo: site + '/admin/' });
  if (error) throw error; u = data.user; console.log('Convite enviado para', email);
}
const { error } = await sb.from('admins').upsert({ user_id: u.id, email, full_name: name || null, active: true });
if (error) throw error;
console.log('Acesso ao painel ativo para', email);
