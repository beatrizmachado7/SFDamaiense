import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import './style.css';
import { sb, configured } from './supabase.js';
import { Toasts, ConfirmHost, Spinner, Icon, toast, SITE } from './ui.jsx';
import { Login, NewPassword } from './pages/Login.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { NewsList, NewsForm } from './pages/News.jsx';
import { History } from './pages/History.jsx';
import { Board } from './pages/Board.jsx';
import { Documents } from './pages/Documents.jsx';
import { Academy } from './pages/Academy.jsx';
import { Players } from './pages/Players.jsx';

const IDLE_MAX = 8 * 60 * 60 * 1000; // sessão termina após 8 h sem atividade
const LAST = 'sfd-admin-last';

export const NAV = [
  { href: '#/', label: 'Painel', icon: 'home' },
  { href: '#/noticias', label: 'Notícias', icon: 'news' },
  { href: '#/historia', label: 'A Nossa História', icon: 'clock' },
  { href: '#/orgaos', label: 'Órgãos Sociais', icon: 'people' },
  { href: '#/documentos', label: 'Documentos', icon: 'doc' },
  { href: '#/academia', label: 'Academia', icon: 'ball' },
  { href: '#/plantel', label: 'Plantéis', icon: 'shirt' }
];

function useRoute() {
  const get = () => {
    const h = location.hash || '#/';
    return /access_token|error_description|type=recovery/.test(h) ? '#/' : h;
  };
  const [r, setR] = useState(get());
  useEffect(() => { const f = () => { setR(get()); window.scrollTo(0, 0); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return r;
}

function touch() { try { localStorage.setItem(LAST, String(Date.now())); } catch (e) {} }
function idleExpired() { try { const t = +localStorage.getItem(LAST); return t && Date.now() - t > IDLE_MAX; } catch (e) { return false; } }

async function checkAdmin(user) {
  const { data, error } = await sb.from('admins').select('user_id, full_name, email, active').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data && data.active ? data : null;
}

function App() {
  const [st, setSt] = useState(configured ? 'loading' : 'nocfg');
  const [me, setMe] = useState(null);
  const route = useRoute();

  async function evaluate(session, evt) {
    if (evt === 'PASSWORD_RECOVERY') { setSt('recovery'); return; }
    if (!session) { setMe(null); setSt('login'); return; }
    if (evt === 'INITIAL_SESSION' && idleExpired()) {
      await sb.auth.signOut(); setSt('login'); toast.err('A sessão expirou por inatividade. Entre novamente.'); return;
    }
    try {
      // valida o token junto do servidor (um token revogado termina a sessão)
      const { data: u, error } = await sb.auth.getUser();
      if (error || !u.user) { await sb.auth.signOut(); setSt('login'); return; }
      const a = await checkAdmin(u.user);
      if (!a) { setMe({ email: u.user.email }); setSt('denied'); return; }
      touch(); setMe({ ...a, email: u.user.email }); setSt('ok');
    } catch (e) { setSt('login'); toast.err('Não foi possível validar a sessão.'); }
  }

  useEffect(() => {
    if (!configured) return;
    let recovering = false;
    const { data: sub } = sb.auth.onAuthStateChange((evt, session) => {
      if (evt === 'PASSWORD_RECOVERY') recovering = true;
      if (recovering && evt !== 'SIGNED_OUT' && evt !== 'USER_UPDATED') { setSt('recovery'); return; }
      if (evt === 'USER_UPDATED') recovering = false;
      if (evt === 'TOKEN_REFRESHED') return;
      setTimeout(() => evaluate(session, evt), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // atividade do utilizador → adia o fim de sessão por inatividade
  useEffect(() => {
    if (st !== 'ok') return;
    let t = 0;
    const act = () => { if (Date.now() - t > 30000) { t = Date.now(); touch(); } };
    const chk = setInterval(async () => { if (idleExpired()) { await sb.auth.signOut(); toast.err('A sessão expirou por inatividade.'); } }, 60000);
    ['click', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, act, { passive: true }));
    return () => { clearInterval(chk); ['click', 'keydown', 'touchstart'].forEach((e) => window.removeEventListener(e, act)); };
  }, [st]);

  if (st === 'nocfg') return <Center><h1>Painel por configurar</h1><p>Falta o ficheiro <code>config.js</code> com o endereço do Supabase.</p></Center>;
  if (st === 'loading') return <Center><Spinner /></Center>;
  if (st === 'login') return <Login />;
  if (st === 'recovery') return <NewPassword onDone={() => setSt('loading')} />;
  if (st === 'denied') return (
    <Center>
      <img src="/assets/admin/escudo.png" alt="" width="64" />
      <h1>Sem acesso</h1>
      <p>A conta <b>{me && me.email}</b> não tem permissão para gerir o site.</p>
      <button class="btn primary" onClick={() => sb.auth.signOut()}>Terminar sessão</button>
    </Center>
  );
  return <Shell me={me} route={route} />;
}

function Center({ children }) { return <main class="center"><div class="center-box">{children}</div></main>; }

function Shell({ me, route }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route]);
  const seg = route.replace(/^#\//, '').split('/');
  let page;
  switch (seg[0]) {
    case 'noticias': page = seg[1] ? <NewsForm id={seg[1] === 'nova' ? null : seg[1]} /> : <NewsList />; break;
    case 'historia': page = <History />; break;
    case 'orgaos': page = <Board />; break;
    case 'documentos': page = <Documents />; break;
    case 'academia': page = <Academy />; break;
    case 'plantel': page = <Players />; break;
    default: page = <Dashboard me={me} />;
  }
  const active = (href) => (href === '#/' ? seg[0] === '' : route.startsWith(href));
  const logout = async () => { await sb.auth.signOut(); try { localStorage.removeItem(LAST); } catch (e) {} };
  return (
    <div class="shell">
      <header class="topbar">
        <a class="brand" href="#/"><img src="/assets/admin/escudo.png" alt="" /><span><b>SF Damaiense</b><small>Gestão do site</small></span></a>
        <button class="iconbtn" aria-label={open ? 'Fechar menu' : 'Abrir menu'} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? 'x' : 'menu'} size={22} /></button>
      </header>
      <aside class={'side' + (open ? ' open' : '')}>
        <a class="brand" href="#/"><img src="/assets/admin/escudo.png" alt="" /><span><b>SF Damaiense</b><small>Gestão do site</small></span></a>
        <nav aria-label="Áreas de gestão">
          {NAV.map((n) => <a key={n.href} href={n.href} class={active(n.href) ? 'on' : ''} aria-current={active(n.href) ? 'page' : undefined}><Icon name={n.icon} />{n.label}</a>)}
        </nav>
        <div class="side-foot">
          <a href={SITE} target="_blank" rel="noopener"><Icon name="ext" />Ver o site</a>
          <button onClick={logout}><Icon name="out" />Terminar sessão</button>
          <span class="who" title={me.email}>{me.full_name || me.email}</span>
        </div>
      </aside>
      {open && <div class="scrim" onClick={() => setOpen(false)} />}
      <main class="main">{page}</main>
    </div>
  );
}

render(<><App /><Toasts /><ConfirmHost /></>, document.getElementById('app'));
