export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function postJson<T>(
  url: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string>),
    },
    body: JSON.stringify(body),
    ...init,
  });

  if (!res.ok) {
    let msg = res.statusText || 'Request failed';
    try {
      const j = (await res.json()) as { message?: string; error?: string };
      if (j?.message) msg = String(j.message);
      else if (j?.error) msg = String(j.error);
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }

  return res.json() as Promise<T>;
}
