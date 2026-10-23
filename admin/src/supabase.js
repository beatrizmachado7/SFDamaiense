import { createClient } from '@supabase/supabase-js';

const cfg = window.SFD_CONFIG || {};
export const configured = !!(cfg.supabaseUrl && cfg.anonKey);

// Só a chave pública (anon). As permissões são verificadas na base de dados (RLS).
export const sb = configured
  ? createClient(cfg.supabaseUrl, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: 'sfd-admin-auth' }
    })
  : null;

export const BUCKET_NEWS = 'noticias';
export const BUCKET_DOCS = 'documentos';

export function publicUrl(bucket, path) {
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Converte erros da base de dados em mensagens simples. */
export function errMsg(e) {
  if (!e) return 'Ocorreu um erro.';
  const code = e.code || e.statusCode || '';
  const msg = String(e.message || e.error || e);
  if (code === '23505') return 'Já existe um registo igual.';
  if (code === '23514' || code === '22P02' || code === '22007' || code === '22008') return 'Há um valor inválido. Verifique os campos.';
  if (code === '42501' || /row-level security|permission denied|not authorized|Unauthorized/i.test(msg)) return 'Não tem permissão para esta operação.';
  if (/JWT expired|invalid jwt|session/i.test(msg)) return 'A sessão expirou. Entre novamente.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sem ligação. Verifique a internet e tente de novo.';
  if (/mime type|invalid_mime_type/i.test(msg)) return 'Tipo de ficheiro não permitido.';
  if (/exceeded the maximum allowed size|Payload too large|413/i.test(msg)) return 'O ficheiro é demasiado grande.';
  return msg.length < 160 ? msg : 'Ocorreu um erro.';
}

export async function must(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}
