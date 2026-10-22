/**
 * Servidor de producción de CrediLote.
 * Sirve el build estático de Vite y monta la API (Neon Postgres + S3).
 *
 * Variables de entorno requeridas:
 *   DATABASE_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION,
 *   NEON_STORAGE_BUCKET, AWS_ENDPOINT_URL_S3 (opcional)
 */
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { crearMiddlewareApi } from './api';

const PORT = Number(process.env.PORT) || 3000;
// __dirname se inyecta por el banner de esbuild en producción; en dev lo resuelve Node
const dir = typeof __dirname !== 'undefined' ? __dirname : new URL('.', import.meta.url).pathname;
const DIST = join(dir, '..', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.map': 'application/json',
};

const apiMiddleware = crearMiddlewareApi({
  databaseUrl: process.env.DATABASE_URL,
  almacenamiento: {
    endpoint: process.env.AWS_ENDPOINT_URL_S3 || process.env.AWS_ENDPOINT_URL,
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucket: process.env.NEON_STORAGE_BUCKET || 'assets',
  },
  permitirRed: true, // En producción, permitir acceso desde la red
});

async function servirArchivo(res: ServerResponse, ruta: string): Promise<boolean> {
  try {
    const archivo = join(DIST, ruta);
    // Evitar path traversal
    if (!archivo.startsWith(DIST)) { res.statusCode = 403; res.end(); return true; }
    const info = await stat(archivo);
    if (!info.isFile()) return false;
    const contenido = await readFile(archivo);
    const ext = extname(ruta).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    if (ext !== '.html') {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    res.statusCode = 200;
    res.end(contenido);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // API routes
  if (url.pathname.startsWith('/api/')) {
    return apiMiddleware(req, res, () => {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Ruta no encontrada.' }));
    });
  }

  // Intentar servir archivo estático
  if (await servirArchivo(res, url.pathname === '/' ? 'index.html' : url.pathname.slice(1))) return;

  // SPA fallback: servir index.html para rutas del frontend
  await servirArchivo(res, 'index.html');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 CrediLote producción en http://0.0.0.0:${PORT}`);
});
