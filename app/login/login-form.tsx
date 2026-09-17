'use client';

import { FormEvent, useState } from 'react';

export default function LoginForm() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: String(form.get('username') ?? ''),
          password: String(form.get('password') ?? ''),
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'No se pudo iniciar sesión.');
      window.location.assign('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.');
      setLoading(false);
    }
  }

  return <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_24px_70px_rgba(15,30,53,.18)]">
    <div className="mb-7 flex items-center gap-3">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#2388ff] font-bold text-white">AT</span>
      <div><h1 className="text-2xl font-bold text-[#172033]">Azure Time</h1><p className="text-sm text-slate-500">Ingresa para continuar</p></div>
    </div>
    <label className="mb-4 grid gap-2 text-sm font-bold text-slate-700">
      <span>Usuario</span>
      <input name="username" autoComplete="username" required autoFocus className="rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-[#2388ff] focus:ring-2 focus:ring-blue-100" />
    </label>
    <label className="mb-5 grid gap-2 text-sm font-bold text-slate-700">
      <span>Contraseña</span>
      <input name="password" type="password" autoComplete="current-password" required className="rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-[#2388ff] focus:ring-2 focus:ring-blue-100" />
    </label>
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
    <button disabled={loading} className="w-full rounded-xl bg-[#1676e8] px-5 py-3 font-bold text-white hover:bg-[#0f66ca] disabled:opacity-60">{loading ? 'Ingresando…' : 'Ingresar'}</button>
  </form>;
}
