/**
 * Persistencia en Neon Postgres (ADR-013). Solo se ejecuta en el servidor: la cadena de conexión
 * (DATABASE_URL) nunca llega al navegador.
 *
 * Fase actual: el estado completo de la aplicación se guarda como un documento JSONB con número de versión
 * (control de concurrencia optimista) y un historial de versiones para respaldo y restauración.
 */
import { neon } from '@neondatabase/serverless';
import { crearTablasProyeccion, proyectarEstado } from './proyeccion';

export const ESTADO_PRINCIPAL = 'principal';
/** Versiones del historial que se conservan por estado. */
const HISTORIAL_MAXIMO = 300;

export interface EstadoGuardado {
  version: number;
  datos: unknown;
  actualizadoEn: string;
}

export type ResultadoGuardado =
  | { ok: true; version: number }
  | { ok: false; conflicto: true; versionActual: number };

export function crearDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  let esquemaListo: Promise<void> | null = null;

  /** Crea las tablas si no existen (idempotente). */
  const asegurarEsquema = () =>
    (esquemaListo ??= (async () => {
      await sql`
        create table if not exists credilote_estado (
          id text primary key,
          version integer not null,
          datos jsonb not null,
          actualizado_en timestamptz not null default now()
        )`;
      await sql`
        create table if not exists credilote_estado_historial (
          id bigserial primary key,
          estado_id text not null,
          version integer not null,
          datos jsonb not null,
          guardado_en timestamptz not null default now()
        )`;
      await sql`
        create index if not exists credilote_estado_historial_idx
          on credilote_estado_historial (estado_id, version desc)`;
      await sql`
        create table if not exists credilote_documentos (
          id uuid primary key default gen_random_uuid(),
          contrato_id text not null,
          clave text not null unique,
          nombre text not null,
          mime text not null,
          tamano integer not null,
          creado_en timestamptz not null default now()
        )`;
      await sql`create index if not exists credilote_documentos_contrato_idx on credilote_documentos (contrato_id)`;
      // Versión limpia del escaneo (2026-10-03): se genera una vez y se guarda junto al original
      await sql`alter table credilote_documentos add column if not exists clave_limpia text`;
      // El documento se guarda al subirlo, antes de registrar la promesa (2026-10-03): el contrato se vincula después.
      // La huella SHA-256 evita guardar dos veces el mismo archivo.
      await sql`alter table credilote_documentos alter column contrato_id drop not null`;
      await sql`alter table credilote_documentos add column if not exists sha256 text`;
      await sql`create index if not exists credilote_documentos_sha256_idx on credilote_documentos (sha256)`;
      await crearTablasProyeccion(sql);
    })().catch((e) => {
      esquemaListo = null; // reintentar en la próxima llamada
      throw e;
    }));

  return {
    asegurarEsquema,

    async leerEstado(id = ESTADO_PRINCIPAL): Promise<EstadoGuardado | null> {
      await asegurarEsquema();
      const filas = await sql`select version, datos, actualizado_en from credilote_estado where id = ${id}`;
      if (filas.length === 0) return null;
      return { version: filas[0].version, datos: filas[0].datos, actualizadoEn: new Date(filas[0].actualizado_en).toISOString() };
    },

    /**
     * Guarda el estado si la versión en la base sigue siendo `versionEsperada` (0 = todavía no existe).
     * Si otro dispositivo guardó antes, devuelve conflicto con la versión actual.
     */
    async guardarEstado(versionEsperada: number, datos: unknown, id = ESTADO_PRINCIPAL): Promise<ResultadoGuardado> {
      await asegurarEsquema();
      const json = JSON.stringify(datos);
      const filas = await sql`
        with actualizado as (
          update credilote_estado
             set version = version + 1, datos = ${json}::jsonb, actualizado_en = now()
           where id = ${id} and version = ${versionEsperada}
          returning version
        ), insertado as (
          insert into credilote_estado (id, version, datos)
          select ${id}, 1, ${json}::jsonb
           where ${versionEsperada}::int = 0 and not exists (select 1 from credilote_estado where id = ${id})
          on conflict (id) do nothing
          returning version
        )
        select version from actualizado
        union all
        select version from insertado`;

      if (filas.length === 0) {
        const actual = await sql`select version from credilote_estado where id = ${id}`;
        return { ok: false, conflicto: true, versionActual: actual[0]?.version ?? 0 };
      }

      const version: number = filas[0].version;
      await sql`insert into credilote_estado_historial (estado_id, version, datos) values (${id}, ${version}, ${json}::jsonb)`;
      await sql`
        delete from credilote_estado_historial
         where estado_id = ${id}
           and version <= ${version - HISTORIAL_MAXIMO}`;
      // Tablas de consulta (proyectos, lotes, cuotas…): si fallan, el guardado principal ya quedó hecho
      try {
        await proyectarEstado(sql, datos as Parameters<typeof proyectarEstado>[1]);
      } catch (e) {
        console.error('[CrediLote API] No se pudieron regenerar las tablas de consulta:', e instanceof Error ? e.message : e);
      }
      return { ok: true, version };
    },

    /** Regenera las tablas de consulta desde el estado actual (p. ej. tras crearlas por primera vez). */
    async regenerarProyeccion(id = ESTADO_PRINCIPAL) {
      await asegurarEsquema();
      const filas = await sql`select datos from credilote_estado where id = ${id}`;
      if (filas.length === 0) return null;
      return proyectarEstado(sql, filas[0].datos);
    },

    async listarHistorial(limite = 50, id = ESTADO_PRINCIPAL) {
      await asegurarEsquema();
      const filas = await sql`
        select version, guardado_en, octet_length(datos::text) as bytes
          from credilote_estado_historial
         where estado_id = ${id}
         order by version desc
         limit ${limite}`;
      return filas.map((f) => ({ version: f.version, guardadoEn: new Date(f.guardado_en).toISOString(), bytes: Number(f.bytes) }));
    },

    async leerVersionHistorial(version: number, id = ESTADO_PRINCIPAL) {
      await asegurarEsquema();
      const filas = await sql`select datos from credilote_estado_historial where estado_id = ${id} and version = ${version}`;
      return filas[0]?.datos ?? null;
    },

    async registrarDocumento(doc: { contratoId: string | null; clave: string; nombre: string; mime: string; tamano: number; sha256: string }) {
      await asegurarEsquema();
      const filas = await sql`
        insert into credilote_documentos (contrato_id, clave, nombre, mime, tamano, sha256)
        values (${doc.contratoId}, ${doc.clave}, ${doc.nombre}, ${doc.mime}, ${doc.tamano}, ${doc.sha256})
        returning id, creado_en`;
      return { id: filas[0].id as string, creadoEn: new Date(filas[0].creado_en).toISOString() };
    },

    /** Documento ya guardado con el mismo contenido (misma huella SHA-256), si existe. */
    async buscarDocumentoPorHash(sha256: string) {
      await asegurarEsquema();
      const filas = await sql`
        select id, contrato_id, nombre, mime, tamano, creado_en from credilote_documentos
         where sha256 = ${sha256} order by creado_en limit 1`;
      const f = filas[0];
      return f
        ? {
            id: f.id as string,
            contratoId: (f.contrato_id as string | null) ?? null,
            nombre: f.nombre as string,
            mime: f.mime as string,
            tamano: Number(f.tamano),
            creadoEn: new Date(f.creado_en).toISOString(),
          }
        : null;
    },

    /** Vincula a un contrato un documento subido antes de registrar la promesa. */
    async vincularDocumento(id: string, contratoId: string): Promise<'ok' | 'no-existe' | 'otro-contrato'> {
      await asegurarEsquema();
      const filas = await sql`
        update credilote_documentos set contrato_id = ${contratoId}
         where id = ${id}::uuid and (contrato_id is null or contrato_id = ${contratoId})
        returning id`;
      if (filas.length > 0) return 'ok';
      const existe = await sql`select 1 from credilote_documentos where id = ${id}::uuid`;
      return existe.length > 0 ? 'otro-contrato' : 'no-existe';
    },

    /** Documentos subidos que todavía no pertenecen a ningún contrato (promesa sin registrar o rechazada). */
    async listarDocumentosSinContrato() {
      await asegurarEsquema();
      const filas = await sql`
        select id, nombre, mime, tamano, creado_en, clave_limpia from credilote_documentos
         where contrato_id is null order by creado_en desc`;
      return filas.map((f) => ({
        id: f.id as string,
        nombre: f.nombre as string,
        mime: f.mime as string,
        tamano: Number(f.tamano),
        creadoEn: new Date(f.creado_en).toISOString(),
        tieneVersionLimpia: !!f.clave_limpia,
      }));
    },

    async listarDocumentos(contratoId: string) {
      await asegurarEsquema();
      const filas = await sql`
        select id, nombre, mime, tamano, creado_en, clave_limpia from credilote_documentos
         where contrato_id = ${contratoId} order by creado_en`;
      return filas.map((f) => ({
        id: f.id as string,
        nombre: f.nombre as string,
        mime: f.mime as string,
        tamano: Number(f.tamano),
        creadoEn: new Date(f.creado_en).toISOString(),
        tieneVersionLimpia: !!f.clave_limpia,
      }));
    },

    async obtenerDocumento(id: string) {
      await asegurarEsquema();
      const filas = await sql`select clave, nombre, mime, clave_limpia from credilote_documentos where id = ${id}::uuid`;
      if (!filas[0]) return null;
      const f = filas[0];
      return { clave: f.clave as string, nombre: f.nombre as string, mime: f.mime as string, claveLimpia: (f.clave_limpia as string | null) ?? null };
    },

    async guardarClaveLimpia(id: string, claveLimpia: string) {
      await asegurarEsquema();
      await sql`update credilote_documentos set clave_limpia = ${claveLimpia} where id = ${id}::uuid`;
    },
  };
}

export type Db = ReturnType<typeof crearDb>;
