import { useEffect, useState } from 'preact/hooks';

// ───────── Avisos (toasts) ─────────
let pushToast = () => {};
export const toast = {
  ok: (m) => pushToast({ kind: 'ok', m }),
  err: (m) => pushToast({ kind: 'err', m })
};
export function Toasts() {
  const [list, setList] = useState([]);
  useEffect(() => {
    pushToast = (t) => {
      const id = Math.random().toString(36).slice(2);
      setList((l) => [...l.slice(-2), { ...t, id }]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), t.kind === 'err' ? 6000 : 3200);
    };
  }, []);
  return (
    <div class="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} class={'toast ' + t.kind} role={t.kind === 'err' ? 'alert' : 'status'}>
          <Icon name={t.kind === 'ok' ? 'check' : 'alert'} /> <span>{t.m}</span>
        </div>
      ))}
    </div>
  );
}

// ───────── Confirmação ─────────
let openConfirm = () => {};
export function confirmDialog(opts) { return new Promise((res) => openConfirm({ ...opts, res })); }
export function ConfirmHost() {
  const [c, setC] = useState(null);
  useEffect(() => { openConfirm = setC; }, []);
  useEffect(() => {
    if (!c) return;
    const k = (e) => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [c]);
  if (!c) return null;
  const close = (v) => { c.res(v); setC(null); };
  return (
    <div class="modal-bg" onClick={(e) => e.target === e.currentTarget && close(false)}>
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="cf-t">
        <h3 id="cf-t">{c.title}</h3>
        {c.text && <p>{c.text}</p>}
        <div class="row end">
          <button class="btn ghost" onClick={() => close(false)}>Cancelar</button>
          <button class={'btn ' + (c.danger ? 'danger' : 'primary')} onClick={() => close(true)} autoFocus>{c.ok || 'Confirmar'}</button>
        </div>
      </div>
    </div>
  );
}

// ───────── Peças ─────────
export function Spinner({ label = 'A carregar…' }) {
  return <div class="loading" role="status"><span class="spin" aria-hidden="true" />{label}</div>;
}
export function Empty({ children }) { return <div class="empty">{children}</div>; }

export function Btn({ busy, children, kind = 'primary', icon, ...rest }) {
  return (
    <button class={'btn ' + kind} disabled={busy || rest.disabled} aria-busy={busy ? 'true' : undefined} {...rest}>
      {busy ? <span class="spin sm" aria-hidden="true" /> : icon ? <Icon name={icon} /> : null}
      <span>{children}</span>
    </button>
  );
}

// group: campos com vários controlos (editor, imagem, dias) — não usam <label> para não "roubar" cliques.
export function Field({ label, hint, error, children, id, group }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag class={'field' + (error ? ' has-err' : '')} for={group ? undefined : id}>
      <span class="lbl">{label}</span>
      {children}
      {error ? <span class="err" role="alert">{error}</span> : hint ? <span class="hint">{hint}</span> : null}
    </Tag>
  );
}

export function PageHead({ title, children, back }) {
  return (
    <header class="phead">
      <div>
        {back && <a class="back" href={back}><Icon name="left" /> Voltar</a>}
        <h1>{title}</h1>
      </div>
      <div class="row">{children}</div>
    </header>
  );
}

const P = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  news: 'M4 5h13v14H5a1 1 0 0 1-1-1zM17 8h3v10a1 1 0 0 1-1 1h-2M7 9h7M7 13h7M7 17h4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
  doc: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6',
  ball: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7l4 3-1.5 5h-5L8 10z',
  shirt: 'M8 3l-5 3 2 4 3-1v12h8V9l3 1 2-4-5-3a4 4 0 0 1-8 0z',
  out: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3',
  ext: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  check: 'M5 12l5 5 9-10',
  alert: 'M12 8v5M12 16.5v.5M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  left: 'M15 5l-7 7 7 7',
  menu: 'M4 7h16M4 12h16M4 17h16',
  x: 'M6 6l12 12M18 6L6 18',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeoff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  bold: 'M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  olist: 'M10 6h10M10 12h10M10 18h10M4 5l1.5-1V9M3.5 14.5a1.5 1.5 0 1 1 2.6 1L3.5 19H7',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  unlink: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7M4 4l16 16',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4'
};
export function Icon({ name, size = 18 }) {
  return (
    <svg class="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={P[name] || ''} />
    </svg>
  );
}

export const fmtDate = (iso) => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
export const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const SITE = (window.SFD_CONFIG && window.SFD_CONFIG.siteUrl) || '/';
