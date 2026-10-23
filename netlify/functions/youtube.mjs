// Damaiense TV: devolve os vídeos mais recentes do canal oficial no YouTube.
// Lê o feed RSS público (sem chave de API). O Netlify guarda a resposta 1 hora,
// por isso um vídeo novo aparece no site até 1 hora depois de ser publicado.
const CHANNEL_ID = 'UCZRUv9n-cSqHtcLlMo5kiUA'; // @damaiensetv
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

const decode = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n));
const pick = (xml, tag) => { const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return m ? decode(m[1]).trim() : ''; };

async function isShort(id) {
  try {
    const r = await fetch(`https://www.youtube.com/shorts/${id}`, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(2500) });
    return r.status === 200;
  } catch { return false; }
}

// Mesmas etiquetas que o site já usa: Direto, Resumo, Golos, Entrevista, Short.
function tagFor(raw, short) {
  if (short) return 'Short';
  const t = raw.normalize('NFKC').toLowerCase();
  if (/^\W*direto\b|\bem direto\b|\blive\b/.test(t)) return 'Direto';
  if (/^\W*golos\b/.test(t)) return 'Golos';
  if (/^\W*(highlights|resumo)\b/.test(t)) return 'Resumo';
  if (/entrevista|interview|«|"/.test(t)) return 'Entrevista';
  if (/\bvs\.?\b/.test(t)) return 'Direto';
  if (/\d+\s*[-–x]\s*\d+/.test(t)) return 'Resumo';
  return 'Vídeo';
}

// Limpa o título do YouTube: tira emojis, hashtags finais, letras "decorativas" e o prefixo da etiqueta.
const KEEP = new Set(['AFL', 'AF', 'GS', 'CD', 'AC', 'UDR', 'URD', 'GD', 'GIMD', 'MVP', 'SF', 'II', 'III', 'IV', 'FC', 'SC', 'UD', 'CF', 'S17', 'S19', 'S15']);
function cleanTitle(raw) {
  let t = raw.replace(/ª/g, '\uE001').replace(/º/g, '\uE002').normalize('NFKC').replace(/\uE001/g, 'ª').replace(/\uE002/g, 'º')
    .replace(/[\u{1F1E6}-\u{1F1FF}\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, '')
    .replace(/#(?=[\p{L}\p{N}])/gu, '')
    .replace(/^\s*(direto|golos|highlights|resumo)\s*[:|\-–]\s*/i, '')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/:\s*"/g, ': «').replace(/"\s*$/, '»').replace(/"/g, '»')
    .replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/[\p{Lu}]{3,}(?![\p{Ll}])/gu, (w) => KEEP.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase());
  return t.replace(/[\s·:!,-]+$/u, (m) => (m.trim() === '!' ? '!' : '')).trim() || raw;
}

export default async () => {
  try {
    const res = await fetch(FEED, { headers: { 'User-Agent': 'sfdamaiense.pt' }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error('feed ' + res.status);
    const xml = await res.text();
    const entries = xml.split('<entry>').slice(1).map((e) => ({ id: pick(e, 'yt:videoId'), title: pick(e, 'title'), date: pick(e, 'published').slice(0, 10) }))
      .filter((v) => /^[\w-]{11}$/.test(v.id) && v.title).slice(0, 15);
    const shorts = await Promise.all(entries.map((v) => isShort(v.id)));
    const videos = entries.map((v, i) => [v.id, cleanTitle(v.title), v.date, tagFor(v.title, shorts[i])]);
    return new Response(JSON.stringify({ updated: new Date().toISOString(), videos }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
      }
    });
  } catch (e) {
    // Sem resposta do YouTube: o site continua a mostrar a lista que já tem.
    return new Response(JSON.stringify({ error: 'indisponível', videos: [] }), { status: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
};

export const config = { path: '/api/youtube' };
