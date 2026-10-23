import { useEffect, useState } from 'preact/hooks';
import { sb } from '../supabase.js';
import { Icon, SITE } from '../ui.jsx';

const CARDS = [
  { href: '#/noticias', icon: 'news', t: 'Notícias', d: 'Criar, editar e publicar' },
  { href: '#/historia', icon: 'clock', t: 'A Nossa História', d: 'Anos da cronologia' },
  { href: '#/orgaos', icon: 'people', t: 'Órgãos Sociais', d: 'Nomes, cargos e mandatos' },
  { href: '#/documentos', icon: 'doc', t: 'Documentos', d: 'PDF para o site' },
  { href: '#/academia', icon: 'ball', t: 'Academia', d: 'Horários dos treinos' },
  { href: '#/plantel', icon: 'shirt', t: 'Plantéis', d: 'Atletas, números e fotografias' }
];

async function count(table, f) {
  let q = sb.from(table).select('*', { count: 'exact', head: true });
  if (f) q = f(q);
  const { count: c } = await q;
  return c ?? null;
}

export function Dashboard({ me }) {
  const [n, setN] = useState({});
  useEffect(() => {
    Promise.all([
      count('news', (q) => q.eq('status', 'published')), count('news', (q) => q.eq('status', 'draft')),
      count('history_events'), count('board_members'), count('documents'), count('academy_schedule'), count('players')
    ]).then(([pub, dr, h, b, d, a, pl]) => setN({ pub, dr, h, b, d, a, pl }));
  }, []);
  const meta = {
    '#/noticias': n.pub == null ? '' : `${n.pub} publicadas${n.dr ? ` · ${n.dr} rascunho${n.dr > 1 ? 's' : ''}` : ''}`,
    '#/historia': n.h == null ? '' : `${n.h} ${n.h === 1 ? 'ano' : 'anos'}`,
    '#/orgaos': n.b == null ? '' : `${n.b} cargos`,
    '#/documentos': n.d == null ? '' : `${n.d} ${n.d === 1 ? 'documento' : 'documentos'}`,
    '#/academia': n.a == null ? '' : `${n.a} escalões`,
    '#/plantel': n.pl == null ? '' : `${n.pl} atletas`
  };
  const first = (me.full_name || '').split(' ')[0];
  return (
    <section>
      <header class="phead"><div><p class="eyebrow">{first ? `Olá, ${first}` : 'Bem-vindo'}</p><h1>O que quer atualizar?</h1></div></header>
      <div class="cards">
        {CARDS.map((c) => (
          <a class="card" href={c.href} key={c.href}>
            <span class="card-ic"><Icon name={c.icon} size={24} /></span>
            <span class="card-t">{c.t}</span>
            <span class="card-d">{c.d}</span>
            <span class="card-m">{meta[c.href] || ' '}</span>
          </a>
        ))}
        <a class="card ghost" href={SITE} target="_blank" rel="noopener">
          <span class="card-ic"><Icon name="ext" size={24} /></span>
          <span class="card-t">Ver o site</span>
          <span class="card-d">Abre o site público</span>
        </a>
      </div>
    </section>
  );
}
