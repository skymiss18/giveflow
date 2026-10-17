export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const replacer = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, replacer), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const result = await fn();
    return result instanceof Response ? result : json(result);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    const detail = process.env.NODE_ENV === "production" ? "Internal server error" : String((e as Error)?.message ?? e);
    return json({ error: detail }, 500);
  }
}

export const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
export const UINT_RE = /^\d{1,18}$/;

export function requireParam(value: string | null | undefined, re: RegExp, name: string): string {
  if (!value || !re.test(value)) throw new HttpError(400, `Invalid ${name}`);
  return value;
}

export function optionalParam(value: string | null, re: RegExp, name: string): string | undefined {
  return value ? requireParam(value, re, name) : undefined;
}
