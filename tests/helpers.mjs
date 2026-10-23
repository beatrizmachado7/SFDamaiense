// Valores do Supabase LOCAL (npx supabase start). Não são segredos de produção.
export const URL_ = process.env.TEST_SUPABASE_URL || 'http://127.0.0.1:54321';
export const ANON = process.env.TEST_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
export const SERVICE = process.env.TEST_SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
export const ADMIN = { email: 'admin.teste@sfdamaiense.test', password: 'TesteAdmin2026' };
export const OTHER = { email: 'sem.acesso@sfdamaiense.test', password: 'TesteOutro2026' };

export async function ensureUsers(service) {
  for (const u of [ADMIN, OTHER]) {
    const { data } = await service.auth.admin.listUsers({ perPage: 200 });
    let user = data.users.find((x) => x.email === u.email);
    if (!user) {
      const r = await service.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true });
      if (r.error) throw r.error; user = r.data.user;
    }
    if (u === ADMIN) {
      const r = await service.from('admins').upsert({ user_id: user.id, email: u.email, full_name: 'Teste Administrador', active: true });
      if (r.error) throw r.error;
    }
  }
}
