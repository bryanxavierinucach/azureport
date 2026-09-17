import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSession,
  credentialsConfigured,
  validCredentials,
} from '../../../auth';

export async function POST(request: NextRequest) {
  if (!credentialsConfigured()) {
    return NextResponse.json({ error: 'Falta configurar el usuario y la contraseña.' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as { username?: string; password?: string };
  if (!validCredentials(body.username?.trim() ?? '', body.password ?? '')) {
    return NextResponse.json({ error: 'Usuario o contraseña incorrectos.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, createSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
