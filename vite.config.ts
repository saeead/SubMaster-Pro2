import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';


const readRequestBody = (req: import('http').IncomingMessage): Promise<string> => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => resolve(body));
  req.on('error', reject);
});

const normalizeOpenAICompatibleEndpoint = (baseUrl?: string, endpointUrl?: string): string => {
  const rawUrl = (endpointUrl || baseUrl || '').trim().replace(/\/+$/, '');
  if (!rawUrl) throw new Error('Missing endpointUrl');

  const targetUrl = rawUrl.endsWith('/chat/completions')
    ? rawUrl
    : `${rawUrl.endsWith('/v1') ? rawUrl : `${rawUrl}/v1`}/chat/completions`;
  const parsedUrl = new URL(targetUrl);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Only http and https endpoints are supported');
  return parsedUrl.toString();
};

const openAICompatibleProxy = (): Plugin => {
  const handler = async (req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    try {
      const rawBody = await readRequestBody(req);
      const { baseUrl, endpointUrl, apiKey, headers: incomingHeaders, body } = JSON.parse(rawBody || '{}') as {
        baseUrl?: string;
        endpointUrl?: string;
        apiKey?: string;
        headers?: Record<string, string>;
        body?: unknown;
      };
      const targetUrl = normalizeOpenAICompatibleEndpoint(baseUrl, endpointUrl);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(incomingHeaders || {})
      };
      if (apiKey?.trim() && !headers.Authorization) headers.Authorization = `Bearer ${apiKey.trim()}`;

      const upstreamResponse = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      const contentType = upstreamResponse.headers.get('content-type') || 'application/json';
      const responseText = await upstreamResponse.text();
      res.writeHead(upstreamResponse.status, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(responseText);
    } catch (error: any) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: error?.message || 'Proxy request failed' }));
    }
  };

  return {
    name: 'openai-compatible-proxy',
    configureServer(server) {
      server.middlewares.use('/api/openai-compatible/chat/completions', handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/openai-compatible/chat/completions', handler);
    }
  };
};

const geminiProxy = (): Plugin => {
  const handler = async (req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-client, x-goog-api-key'
      });
      res.end();
      return;
    }

    try {
      const incomingUrl = req.url || '';
      const subPath = incomingUrl.replace(/^\/?/, '');
      const targetUrl = `https://generativelanguage.googleapis.com/${subPath}`;

      const headers: Record<string, string> = {
        'Content-Type': (req.headers['content-type'] as string) || 'application/json',
      };
      if (req.headers['x-goog-api-client']) headers['x-goog-api-client'] = String(req.headers['x-goog-api-client']);
      if (req.headers['x-goog-api-key']) headers['x-goog-api-key'] = String(req.headers['x-goog-api-key']);

      let body: Buffer | undefined = undefined;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        body = Buffer.concat(chunks);
      }

      const upstreamResponse = await fetch(targetUrl, {
        method: req.method,
        headers,
        body
      });

      const contentType = upstreamResponse.headers.get('content-type') || 'application/json';
      const responseData = await upstreamResponse.arrayBuffer();

      res.writeHead(upstreamResponse.status, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(Buffer.from(responseData));
    } catch (err: any) {
      res.writeHead(502, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ error: { message: err?.message || 'Gemini proxy request failed' } }));
    }
  };

  return {
    name: 'gemini-proxy',
    configureServer(server) {
      server.middlewares.use('/api/gemini', handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/gemini', handler);
    }
  };
};


export default defineConfig(({ mode }) => {
    // Load env file based on `mode` in the current working directory.
    // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
    const env = loadEnv(mode, process.cwd(), '');
    
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: true,
      },
      preview: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: true,
      },
      plugins: [react(), openAICompatibleProxy(), geminiProxy()],
      define: {
        // This is crucial for exposing the key to the client side
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          // This points '@' to the 'src' directory
          '@': path.resolve(__dirname, './src'),
        }
      }
    };
});