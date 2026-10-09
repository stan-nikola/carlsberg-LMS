/**
 * Запит до власного API з браузера: JSON туди й назад, помилка — виняток із
 * текстом від сервера ({ error }) або «HTTP <код>». Для дій, де важливий
 * лише успіх/текст помилки; особливі коди (409 з пропозицією, 404 як «нема»)
 * обробляйте звичайним fetch.
 */
export async function api<T = Record<string, any>>(path: string, { method = "GET", body }: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}
