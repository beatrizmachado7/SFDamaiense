// Gera site/config.js a partir das variáveis de ambiente do Netlify.
// Só valores públicos: o URL do projeto e a chave anon (protegida por RLS).
import { writeFileSync } from 'node:fs';
let url = process.env.SUPABASE_URL || '';
let key = process.env.SUPABASE_ANON_KEY || '';
if (process.argv.includes('--local')) { // Supabase local (npx supabase start), só para desenvolvimento/testes
  const h = await import('../tests/helpers.mjs'); url = h.URL_; key = h.ANON;
}
if (/^sb_secret_/.test(key) || /service_role/.test(Buffer.from((key.split('.')[1] || ''), 'base64').toString())) {
  console.error('ERRO: SUPABASE_ANON_KEY contém a chave service_role. Use a chave anon/public.');
  process.exit(1);
}
if (!url || !key) console.warn('Aviso: SUPABASE_URL / SUPABASE_ANON_KEY não definidas — o site usa os conteúdos de origem e o painel fica por configurar.');
writeFileSync(new URL('../site/config.js', import.meta.url),
  `window.SFD_CONFIG = ${JSON.stringify({ supabaseUrl: url, anonKey: key })};\n`);
console.log('site/config.js gerado.');
