---
title: "ADR-013: Persistencia en Neon Postgres y Neon Storage"
tags:
  - adr
  - persistencia
  - neon
  - seguridad
created: 2026-10-01
updated: 2026-10-01
status: aceptado
replaces: ADR-002
---

# ADR-013 - Persistencia en Neon Postgres y Neon Storage

| Campo | Valor |
| :--- | :--- |
| **Estado** | Aceptado |
| **Fecha** | 2026-10-01 |
| **Reemplaza a** | [[ADR-002 - Persistencia en IndexedDB con Dexie]] |

## Contexto
Los datos (ventas, cobros, repartos) vivían solo en el navegador: si se borraban sus datos se perdía todo, no había respaldo y no se podía trabajar desde otro equipo. El administrador creó un proyecto en **Neon** con una base Postgres y un bucket de almacenamiento compatible con S3.

## Decisión
1. **Servidor intermedio obligatorio:** la cadena de conexión (`DATABASE_URL`) y las credenciales del bucket (`AWS_*`) viven solo en `.env.local` y las usa una API local (`server/api.ts`) montada en el servidor de Vite. El navegador nunca recibe credenciales.
2. **Fase 1, documento JSONB:** el estado completo de la app se guarda en la tabla `credilote_estado` con **número de versión** (control de concurrencia) y cada guardado se copia en `credilote_estado_historial` (últimas 300 versiones). Así no cambia la lógica de negocio ni las pantallas: `storage.ts` sigue trabajando en memoria y sincroniza en segundo plano.
3. **Copia local:** `localStorage` queda como caché. Si no hay conexión, la app trabaja en local y sube los cambios cuando vuelve la conexión. Ante un conflicto (otro equipo guardó antes) gana la nube y la copia local se respalda en el navegador.
4. **Documentos:** los PDF e imágenes de las promesas se guardan en el bucket (`contratos/{contratoId}/…`) y su registro en la tabla `credilote_documentos`.
   - **Al subir una promesa a la app (2026-10-03)** el archivo se guarda de inmediato en el bucket (`documentos/{uuid}-{nombre}`), en paralelo con la lectura de Gemini y aunque la promesa todavía no se registre o se rechace; queda con `contrato_id` vacío. **Al registrarla**, se vincula a su contrato (`POST /api/documentos/{id}/vincular?contratoId=`); si la subida inicial había fallado, se repite ya con el contrato. Antes no se guardaba nada y el bucket estaba vacío.
   - **Sin duplicados:** cada documento guarda su huella SHA-256 (`credilote_documentos.sha256`); subir otra vez el mismo archivo devuelve el documento ya guardado. `GET /api/documentos?sinContrato=1` lista los documentos subidos que no pertenecen a ningún contrato.
   - **Versión limpia del escaneo (2026-10-03, `server/limpiezaDocumento.ts`, `server/documentosLimpios.ts`):** cada página se pasa a gris, se divide entre su propio fondo desenfocado (quita sombras y el gris del papel), se estira el contraste y se enfoca. Es la **misma imagen** del documento, no una transcripción: firmas, huellas y sellos se conservan, y el original no se toca. Se genera justo después de subir el documento (sin hacer esperar) o la primera vez que se pide; se guarda como `{clave}.limpio.pdf` y se anota en `credilote_documentos.clave_limpia`. Ruta: `GET /api/documentos/{id}/limpio` (422 si el documento no es un escaneo que se pueda limpiar, p. ej. un PDF de texto). Usa `sharp` y `pdf-lib`. Con las promesas reales tarda 10–15 s por documento y pesa 2–3.5 MB.
5. **Tablas de consulta (fase 1b, 2026-10-01):** en cada guardado se regeneran, en una sola transacción, tablas relacionales normales (`proyectos`, `lotes`, `clientes`, `contratos`, `cuotas`, `recibos`, `recibo_aplicaciones`, `beneficiarios`, `gastos_venta`, `repartos`, `reparto_partes`, `reparto_reembolsos`, `entregas`, `negociaciones`) y las vistas `v_estado_contratos`, `v_saldos_beneficiarios` y `v_saldos_beneficiarios_por_lote` (esta última desde 2026-10-03) (`server/proyeccion.ts`). Son de solo lectura: sirven para consultar con SQL desde la consola de Neon; si fallan, el guardado principal no se pierde.
   - **`lotes` (2026-10-03):** además de `linderos` y `vertices`, tiene `tramos` (rumbos y distancias), `referencia_partida`, `punto_partida_lambert`, `origen` y `ubicado_por`. Un lote cuya escritura no trae coordenadas tiene `vertices = []` pero sí `tramos`: no es un error de guardado, solo falta ubicarlo. Las columnas se agregan con `alter table … add column if not exists`.
6. **Acceso:** la API solo atiende peticiones desde el propio equipo (127.0.0.1) y rechaza peticiones de otros sitios (cabecera `Origin`).

## Alternativas consideradas
- **IndexedDB con Dexie (ADR-002):** resolvía el límite de espacio, pero no el respaldo ni el uso desde varios equipos.
- **Conectar Postgres directamente desde el navegador:** expondría la contraseña de la base a cualquiera.
- **Tablas relacionales desde ya (Modelo v2):** es el destino, pero exigía reescribir la lógica completa; se deja para una fase 2.

## Consecuencias
- Respaldo automático con historial de versiones (cubre la tarea 6.7 de respaldo, salvo la exportación a archivo).
- La API solo existe con `npm run dev` o `npm run preview`. Para publicar la app en internet hará falta desplegar la API como funciones *serverless* y agregar inicio de sesión (Neon Auth u otro).
- "Limpiar Datos" también vacía el estado en la nube; las versiones anteriores siguen en el historial.
- La fase 2 (tablas relacionales con migraciones) permitirá consultas y reportes directos en SQL.

---

Notas afectadas:
- [[01.2 - Arquitectura y Stack Tecnológico]]
- [[01.4 - Seguridad y Protección de Datos]]
- [[04.4 - Indicaciones para Gemini (Frontend)]]
- Registro: [[05.0 - Registro de Decisiones]]
