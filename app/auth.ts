import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const AUTH_COOKIE = 'azure_time_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function unwrap(value: string | undefined) {
  const trimmed = value?.trim() ?? '';
  const match = trimmed.match(/^(['"])(.*)\1$/);
  return match?.[2] ?? trimmed;
}

function authConfig() {
  const username = unwrap(process.env.APP_AUTH_USER);
  const password = unwrap(process.env.APP_AUTH_PASSWORD);
  return username && password ? { username, password } : null;
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function signature(payload: string, password: string) {
  return createHmac('sha256', password).update(payload).digest('base64url');
}

export function credentialsConfigured() {
  return Boolean(authConfig());
}

export function validCredentials(username: string, password: string) {
  const configured = authConfig();
  if (!configured) return false;
  return safeEqual(username, configured.username) && safeEqual(password, configured.password);
}

export function createSession() {
  const configured = authConfig();
  if (!configured) throw new Error('Login no configurado');
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `${configured.username}.${expiresAt}`;
  return `${payload}.${signature(payload, configured.password)}`;
}

export async function isAuthenticated() {
  const configured = authConfig();
  if (!configured) return false;
  const value = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!value) return false;

  const separator = value.lastIndexOf('.');
  if (separator < 1) return false;
  const payload = value.slice(0, separator);
  const suppliedSignature = value.slice(separator + 1);
  const expirySeparator = payload.lastIndexOf('.');
  if (expirySeparator < 1) return false;
  const username = payload.slice(0, expirySeparator);
  const expiresAt = Number(payload.slice(expirySeparator + 1));
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;

  return safeEqual(username, configured.username)
    && safeEqual(suppliedSignature, signature(payload, configured.password));
}
