/**
 * Puerta de entrada: NUNCA monta un workspace sin identidad verificada.
 * Al cambiar de cuenta desmonta toda la memoria de los proyectos anteriores.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, BrainCircuit, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { request } from '../lib/api/client';
import { ensureSession, loadSession, signInWithPassword, signUpWithPassword, sendRecoveryEmail, updateRecoveredPassword, SESSION_CHANGED } from '../lib/api/session';

export interface AccountIdentity { id: string; email: string }

type GateState = { status: 'checking' | 'guest' | 'authenticated'; account?: AccountIdentity; error?: string };

export default function AccountGate({ children }: { children: (account: AccountIdentity) => ReactNode }) {
  const [gate, setGate] = useState<GateState>({ status: 'checking' });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    const verify = async () => {
      // Una recuperación iniciada desde correo tiene prioridad sobre cualquier sesión previa.
      if (new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type') === 'recovery') {
        if (alive) setGate({ status: 'guest' });
        return;
      }
      const stored = loadSession();
      if (!stored) { if (alive) setGate({ status: 'guest' }); return; }
      if (alive) setGate({ status: 'checking' });
      try {
        const current = await ensureSession(stored);
        // El backend verifica firma, issuer y audiencia del JWT.
        const account = await request<AccountIdentity>('/me/register', current.access_token, 'POST');
        if (alive && loadSession()?.access_token === current.access_token) {
          setGate({ status: 'authenticated', account });
        }
      } catch (cause) {
        // Un fallo de red no equivale a contraseña errónea: no borrar la sesión.
        if (alive) setGate({ status: 'guest', error: cause instanceof Error ? cause.message : 'No se pudo validar la cuenta.' });
      }
    };
    void verify();
    const changed = () => { if (alive) setRetry(value => value + 1); };
    window.addEventListener(SESSION_CHANGED, changed);
    return () => { alive = false; window.removeEventListener(SESSION_CHANGED, changed); };
  }, [retry]);

  if (gate.status === 'checking') return <div role="status" className="grid min-h-screen place-items-center bg-canvas text-ink">
    <div className="flex flex-col items-center gap-4"><LoaderCircle className="animate-spin text-primary-600" size={32}/><span className="text-sm font-semibold">Verificando tu sesión…</span></div>
  </div>;
  if (gate.status === 'authenticated' && gate.account) return <>{children(gate.account)}</>;
  return <AccountScreen externalError={gate.error} onRetry={() => setRetry(value => value + 1)}/>;
}

function AccountScreen({ externalError, onRetry }: { externalError?: string; onRetry: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset' | 'recovery'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryToken, setRecoveryToken] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  // Enlaces de confirmación de Supabase pueden traer tokens en el hash. No se
  // conservan en la URL ni se usan como credenciales de sesión del navegador.
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = fragment.get('access_token');
    if (!token) return;
    const recovering = fragment.get('type') === 'recovery';
    // Los JWT nunca deben permanecer visibles en la URL después de abrir el enlace.
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    if (recovering) { setRecoveryToken(token); setMode('recovery'); }
    else setConfirmation('Correo confirmado. Inicia sesión con tu contraseña.');
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setConfirmation(''); setWorking(true);
    try {
      if (mode === 'recovery') {
        if (!recoveryToken) throw new Error('El enlace ya no es válido. Solicita uno nuevo.');
        if (password !== confirmPassword) throw new Error('Las contraseñas no coinciden.');
        await updateRecoveredPassword(recoveryToken, password);
        setRecoveryToken(''); setMode('signin'); setPassword(''); setConfirmPassword('');
        setConfirmation('Contraseña actualizada. Ya puedes iniciar sesión.');
      } else if (mode === 'reset') {
        await sendRecoveryEmail(email.trim());
        setConfirmation('Si la cuenta existe, recibirás un correo para restablecer la contraseña.');
      } else if (mode === 'signup') {
        if (password !== confirmPassword) throw new Error('Las contraseñas no coinciden.');
        const result = await signUpWithPassword(email.trim(), password);
        if (result.confirmation_required) {
          setConfirmation('Si es posible completar el registro, recibirás un enlace de verificación por correo. Confirma tu dirección e inicia sesión.');
          setMode('signin'); setPassword(''); setConfirmPassword('');
        }
      } else {
        await signInWithPassword(email.trim(), password);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar el acceso.'); }
    finally { setWorking(false); }
  };

  return <div className="grid min-h-screen bg-canvas lg:grid-cols-[1fr_520px]">
    <section className="relative hidden overflow-hidden bg-[#101d36] px-12 py-16 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-500/20"><BrainCircuit size={28}/></div><div className="text-xl font-extrabold tracking-tight">NeuroLab <span className="font-medium text-blue-300">Enterprise</span></div></div>
      <div className="max-w-xl space-y-6"><span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold tracking-wide text-blue-200"><ShieldCheck size={15}/> Tu laboratorio, tu cuenta</span>
        <h1 className="text-5xl font-extrabold leading-tight tracking-tight">Diseña, entrena y evalúa redes neuronales.</h1>
        <p className="text-lg leading-8 text-slate-300">Entrenamiento real con TensorFlow.js en tu navegador. Tus proyectos y modelos se guardan en un espacio privado en la nube.</p>
      </div>
      <p className="text-xs text-slate-400">Proyecto académico · Entrenamiento en el dispositivo · Almacenamiento remoto</p>
    </section>
    <main className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 sm:p-10">
        <div className="mb-7 lg:hidden"><BrainCircuit size={31} className="text-primary-600"/><div className="mt-2 text-lg font-bold text-ink">NeuroLab Enterprise</div></div>
        <h2 className="text-2xl font-bold text-ink">{mode === 'signin' ? 'Iniciar sesión' : mode === 'signup' ? 'Crear cuenta' : mode === 'reset' ? 'Recuperar contraseña' : 'Elegir nueva contraseña'}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{mode === 'signin' ? 'Accede a tus proyectos personales.' : mode === 'signup' ? 'Crea tu laboratorio privado utilizando un correo válido.' : mode === 'reset' ? 'Te enviaremos un enlace para restablecer tu contraseña.' : 'Introduce una contraseña nueva para tu cuenta.'}</p>
        {externalError && <div role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{externalError} <button type="button" onClick={onRetry} className="font-bold underline">Reintentar</button></div>}
        {error && <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle size={18}/>{error}</div>}
        {confirmation && <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{confirmation}</div>}
        <form onSubmit={event => void submit(event)} className="mt-7 space-y-5">
          {mode !== 'recovery' && <div><label htmlFor="auth-email" className="field-label">Correo electrónico</label><div className="relative"><Mail size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input id="auth-email" type="email" autoComplete="email" required maxLength={320} value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" className="field w-full pl-10"/></div></div>}
          {mode !== 'reset' && <div><label htmlFor="auth-password" className="field-label">{mode === 'recovery' ? 'Nueva contraseña' : 'Contraseña'}</label><div className="relative"><LockKeyhole size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" className="field w-full pl-10 pr-12"/><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></div>}
          {(mode === 'signup' || mode === 'recovery') && <div><label htmlFor="auth-confirm" className="field-label">Confirmar contraseña</label><input id="auth-confirm" className="field w-full" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}/></div>}
          <button type="submit" disabled={working} className="btn-primary w-full justify-center py-3">{working ? <LoaderCircle className="animate-spin" size={18}/> : <ShieldCheck size={18}/>} {mode === 'signin' ? 'Entrar a mi laboratorio' : mode === 'signup' ? 'Crear cuenta' : mode === 'reset' ? 'Enviar enlace' : 'Actualizar contraseña'}</button>
        </form>
        <div className="mt-6 space-y-2 border-t border-slate-200 pt-5 text-center text-sm text-slate-500 dark:border-zinc-700">
          {mode === 'signin' && <p>¿Aún no tienes una cuenta? <button type="button" className="font-semibold text-primary-600 hover:underline" onClick={() => { setMode('signup'); setError(''); setConfirmation(''); }}>Registrarme</button></p>}
          {mode === 'signin' && <p><button type="button" className="font-semibold text-primary-600 hover:underline" onClick={() => { setMode('reset'); setError(''); setConfirmation(''); }}>Olvidé mi contraseña</button></p>}
          {mode !== 'signin' && <p><button type="button" className="font-semibold text-primary-600 hover:underline" onClick={() => { setMode('signin'); setError(''); setConfirmation(''); }}>Volver al inicio de sesión</button></p>}
        </div>
      </div>
    </main>
  </div>;
}
