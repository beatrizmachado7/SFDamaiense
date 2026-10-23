import { useState } from 'preact/hooks';
import { sb } from '../supabase.js';
import { Btn, Field, Icon, toast, SITE } from '../ui.jsx';

function Frame({ title, children }) {
  return (
    <main class="auth">
      <div class="auth-card">
        <img class="auth-crest" src="/assets/admin/escudo.png" alt="Emblema do SF Damaiense" width="72" height="72" />
        <p class="eyebrow">Gestão do site</p>
        <h1>{title}</h1>
        {children}
        <a class="auth-back" href={SITE}><Icon name="left" size={16} />Voltar ao site</a>
      </div>
    </main>
  );
}

export function Login() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);

  async function login(e) {
    e.preventDefault(); setErr('');
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErr('Indique um email válido.'); return; }
    if (!pw) { setErr('Indique a palavra-passe.'); return; }
    setBusy(true);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    // mensagem genérica: não revela se o email existe
    if (error) setErr(/rate|too many/i.test(error.message) ? 'Demasiadas tentativas. Aguarde uns minutos.' : 'Email ou palavra-passe incorretos.');
  }

  async function recover(e) {
    e.preventDefault(); setErr('');
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErr('Indique um email válido.'); return; }
    setBusy(true);
    await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + '/admin/' });
    setBusy(false); setSent(true);
  }

  if (mode === 'recover') return (
    <Frame title="Recuperar acesso">
      {sent ? (
        <div class="note ok" role="status">Se o email tiver acesso ao painel, vai receber uma ligação para definir uma nova palavra-passe.</div>
      ) : (
        <form onSubmit={recover} noValidate>
          <Field label="Email" error={err}><input type="email" autocomplete="username" value={email} onInput={(e) => setEmail(e.currentTarget.value)} required autoFocus /></Field>
          <Btn busy={busy} type="submit" class="btn primary wide">Enviar ligação</Btn>
        </form>
      )}
      <button class="linkbtn" onClick={() => { setMode('login'); setSent(false); setErr(''); }}>Voltar a entrar</button>
    </Frame>
  );

  return (
    <Frame title="Entrar">
      <form onSubmit={login} noValidate>
        <Field label="Email"><input type="email" name="email" autocomplete="username" value={email} onInput={(e) => setEmail(e.currentTarget.value)} required autoFocus /></Field>
        <Field label="Palavra-passe" error={err}>
          <div class="pw">
            <input type={show ? 'text' : 'password'} name="password" autocomplete="current-password" value={pw} onInput={(e) => setPw(e.currentTarget.value)} required />
            <button type="button" class="iconbtn" aria-label={show ? 'Esconder palavra-passe' : 'Mostrar palavra-passe'} onClick={() => setShow(!show)}><Icon name={show ? 'eyeoff' : 'eye'} /></button>
          </div>
        </Field>
        <Btn busy={busy} type="submit" class="btn primary wide">Entrar</Btn>
      </form>
      <button class="linkbtn" onClick={() => { setMode('recover'); setErr(''); }}>Esqueci-me da palavra-passe</button>
    </Frame>
  );
}

export function NewPassword({ onDone }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save(e) {
    e.preventDefault(); setErr('');
    if (pw.length < 10 || !/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) { setErr('Use pelo menos 10 caracteres, com maiúsculas, minúsculas e números.'); return; }
    if (pw !== pw2) { setErr('As palavras-passe não coincidem.'); return; }
    setBusy(true);
    const { error } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setErr(/same|different/i.test(error.message) ? 'Escolha uma palavra-passe diferente da anterior.' : 'Não foi possível guardar. Peça uma nova ligação.'); return; }
    toast.ok('Palavra-passe atualizada.');
    onDone();
  }
  return (
    <Frame title="Nova palavra-passe">
      <form onSubmit={save} noValidate>
        <Field label="Nova palavra-passe" hint="Mínimo 10 caracteres, com maiúsculas, minúsculas e números."><input type="password" autocomplete="new-password" value={pw} onInput={(e) => setPw(e.currentTarget.value)} autoFocus /></Field>
        <Field label="Repetir palavra-passe" error={err}><input type="password" autocomplete="new-password" value={pw2} onInput={(e) => setPw2(e.currentTarget.value)} /></Field>
        <Btn busy={busy} type="submit" class="btn primary wide">Guardar</Btn>
      </form>
    </Frame>
  );
}
