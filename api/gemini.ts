export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-client, x-goog-api-key',
      },
    });
  }

  try {
    const url = new URL(req.url);
    // Strip leading /api/gemini or /api/gemini/
    let subpath = url.pathname.replace(/^\/api\/gemini\/?/, '');
    if (!subpath.startsWith('v1beta') && !subpath.startsWith('v1')) {
      subpath = `v1beta/${subpath}`;
    }

    const searchParams = new URLSearchParams(url.search);
    // If the client didn't supply an API key in query, use the server-side environment variable if available
    if (!searchParams.get('key') && process.env.GEMINI_API_KEY) {
      searchParams.set('key', process.env.GEMINI_API_KEY);
    }

    const targetUrl = `https://generativelanguage.googleapis.com/${subpath}?${searchParams.toString()}`;

    const headers: Record<string, string> = {
      'Content-Type': req.headers.get('content-type') || 'application/json',
    };
    const googClient = req.headers.get('x-goog-api-client');
    if (googClient) headers['x-goog-api-client'] = googClient;
    const googKey = req.headers.get('x-goog-api-key');
    if (googKey) headers['x-goog-api-key'] = googKey;

    const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined;

    const upstreamResponse = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    const responseBody = await upstreamResponse.arrayBuffer();
    return new Response(responseBody, {
      status: upstreamResponse.status,
      headers: {
        'Content-Type': upstreamResponse.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: { message: err?.message || 'Gemini edge proxy error' } }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
