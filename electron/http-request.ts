export interface HttpRequestArgs {
  method: string
  url: string
  headers: Record<string, string>
  body: unknown
}

export interface HttpResponse {
  ok: boolean
  status: number
  body: unknown
  text: string
}

const TIMEOUT_MS = 300_000

async function doFetch(args: HttpRequestArgs): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const hasBody =
    args.body !== undefined && args.body !== null
  const headers = { ...args.headers }
  if (hasBody) {
    const hasContentType = Object.keys(headers).some(
      (k) => k.toLowerCase() === 'content-type',
    )
    if (!hasContentType) headers['Content-Type'] = 'application/json'
  }
  try {
    return await fetch(args.url, {
      method: args.method,
      headers,
      body: hasBody ? JSON.stringify(args.body) : undefined,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function httpRequest(args: HttpRequestArgs): Promise<HttpResponse> {
  try {
    const resp = await doFetch(args)
    const text = await resp.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = null
    }
    return {
      ok: resp.ok,
      status: resp.status,
      body,
      text,
    }
  } catch (e) {
    throw new Error(`Request failed: ${(e as Error).message}`)
  }
}
