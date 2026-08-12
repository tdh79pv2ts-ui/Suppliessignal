import { supabase } from './auth';

const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
export class ApiRequestError extends Error { constructor(public code: string, message: string, public status: number) { super(message); } }
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  const response = await fetch(`${apiBase}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init?.headers } });
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as { data?: T; error?: { code?: string; message?: string } };
  if (!response.ok) throw new ApiRequestError(payload.error?.code ?? 'REQUEST_FAILED', payload.error?.message ?? 'Request failed', response.status);
  return payload.data as T;
}
