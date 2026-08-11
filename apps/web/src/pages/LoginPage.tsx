import { useState, type FormEvent } from 'react';
import { Activity, ArrowRight, LockKeyhole } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { authConfigured, supabase } from '../lib/auth';

export function LoginPage({ authenticated }: { authenticated: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  if (authenticated) return <Navigate to="/dashboard" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setSubmitting(true); setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
    setSubmitting(false);
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-400/15"><Activity className="h-5 w-5 text-emerald-300" /></span><span className="font-semibold">SupplySignal</span></div><div className="max-w-lg"><p className="text-sm font-medium text-emerald-300">Evidence-first intelligence</p><h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight">Know what changed—and why it matters to your supply chain.</h1><p className="mt-5 leading-7 text-white/55">Customer-specific exposure, source traceability, and human-reviewed actions in one operational workspace.</p></div><p className="text-xs text-white/35">SupplySignal V1 · Secure foundation</p></section>
      <section className="flex items-center justify-center bg-white p-6"><div className="w-full max-w-sm"><div className="mb-8 lg:hidden"><Activity className="h-7 w-7 text-signal" /></div><div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-canvas"><LockKeyhole className="h-4 w-4 text-signal" /></div><h2 className="mt-5 text-2xl font-semibold tracking-tight">Sign in to your workspace</h2><p className="mt-2 text-sm leading-6 text-muted">Use your authorized SupplySignal account.</p>
        {!authConfigured ? <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><span className="font-medium">Authentication is not configured.</span><br />Add the Supabase browser variables from <code>.env.example</code>. Sign-in remains disabled until then.</div> : null}
        <form className="mt-7 space-y-4" onSubmit={(event) => void submit(event)}><label className="block text-sm font-medium">Email<input className="focus-ring mt-2 w-full rounded-lg border px-3 py-2.5 font-normal" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label className="block text-sm font-medium">Password<input className="focus-ring mt-2 w-full rounded-lg border px-3 py-2.5 font-normal" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{message ? <p role="alert" className="text-sm text-red-700">{message}</p> : null}<button disabled={!authConfigured || submitting} className="focus-ring flex w-full items-center justify-center gap-2 rounded-lg bg-signal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">{submitting ? 'Signing in…' : 'Sign in'}<ArrowRight className="h-4 w-4" /></button></form>
      </div></section>
    </main>
  );
}
