import { defineConfig, loadEnv, Plugin, ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { crearMiddlewareApi } from './server/api';

/**
 * Proxy local hacia la API de Gemini (ver 01.4 - Seguridad y Protección de Datos).
 * La clave se lee de GEMINI_API_KEY (sin prefijo VITE_) y el servidor de Vite la agrega
 * en la cabecera x-goog-api-key: nunca llega al navegador ni al build de producción.
 * Solo funciona con `npm run dev` o `npm run preview`.
 */
const GEMINI_PREFIX = '/api/gemini';

function geminiProxy(apiKey: string | undefined): Record<string, ProxyOptions> {
  if (!apiKey) return {};
  return {
    [GEMINI_PREFIX]: {
      target: 'https://generativelanguage.googleapis.com',
      changeOrigin: true,
      rewrite: (p) => p.replace(GEMINI_PREFIX, ''),
      headers: { 'x-goog-api-key': apiKey },
    },
  };
}

/** Si falta la clave, responde un error claro en lugar de dejar que la solicitud falle. */
function geminiSinClave(apiKey: string | undefined): Plugin {
  const middleware = (req: any, res: any, next: () => void) => {
    if (apiKey || !req.url?.startsWith(GEMINI_PREFIX)) return next();
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { message: 'GEMINI_API_KEY no está configurada en .env.local' } }));
  };
  return {
    name: 'credilote-gemini-sin-clave',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

/**
 * API local de CrediLote: estado en Neon Postgres y documentos en Neon Storage (server/api.ts, ADR-013).
 * DATABASE_URL y AWS_* se leen de .env.local en el servidor; nunca llegan al navegador.
 */
function crediloteApi(env: Record<string, string>): Plugin {
  const middleware = crearMiddlewareApi({
    databaseUrl: env.DATABASE_URL,
    almacenamiento: {
      endpoint: env.AWS_ENDPOINT_URL_S3 || env.AWS_ENDPOINT_URL,
      region: env.AWS_REGION,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      bucket: env.NEON_STORAGE_BUCKET || 'assets',
    },
    permitirRed: env.CREDILOTE_API_PERMITIR_RED === '1',
  });
  const usar = (server: { middlewares: { use: (fn: typeof middleware) => void } }) => void server.middlewares.use(middleware);
  return { name: 'credilote-api', configureServer: usar, configurePreviewServer: usar };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.GEMINI_API_KEY;

  return {
    plugins: [react(), geminiSinClave(apiKey), crediloteApi(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      open: false,
      proxy: geminiProxy(apiKey),
    },
    preview: {
      proxy: geminiProxy(apiKey),
    },
  };
});
