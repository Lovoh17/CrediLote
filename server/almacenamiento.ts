/**
 * Almacenamiento de documentos (PDF e imágenes de promesas) en Neon Storage, compatible con S3 (ADR-013).
 * Las credenciales vienen de variables de entorno del servidor; nunca llegan al navegador.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

export interface ConfigAlmacenamiento {
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket: string;
}

export function crearAlmacenamiento(cfg: ConfigAlmacenamiento) {
  const configurado = Boolean(cfg.endpoint && cfg.accessKeyId && cfg.secretAccessKey);
  const s3 = configurado
    ? new S3Client({
        endpoint: cfg.endpoint,
        region: cfg.region || 'us-east-1',
        forcePathStyle: true,
        credentials: { accessKeyId: cfg.accessKeyId!, secretAccessKey: cfg.secretAccessKey! },
      })
    : null;

  return {
    configurado,

    async subir(clave: string, contenido: Buffer, mime: string) {
      if (!s3) throw new Error('El almacenamiento de documentos no está configurado.');
      await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: clave, Body: contenido, ContentType: mime }));
    },

    async descargar(clave: string): Promise<{ cuerpo: Uint8Array; mime?: string }> {
      if (!s3) throw new Error('El almacenamiento de documentos no está configurado.');
      const r = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: clave }));
      const cuerpo = await r.Body!.transformToByteArray();
      return { cuerpo, mime: r.ContentType };
    },
  };
}

export type Almacenamiento = ReturnType<typeof crearAlmacenamiento>;
