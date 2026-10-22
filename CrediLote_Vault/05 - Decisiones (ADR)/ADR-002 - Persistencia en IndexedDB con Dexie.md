---
title: "ADR-002: Persistencia en IndexedDB con Dexie"
tags:
  - adr
  - persistencia
  - datos
created: 2026-09-26
updated: 2026-09-26
status: reemplazado
replaced_by: ADR-013
decision: D2
---

# ADR-002 - Persistencia en IndexedDB con Dexie

| Campo | Valor |
| :--- | :--- |
| **Estado** | Reemplazado por [[ADR-013 - Persistencia en Neon Postgres y Neon Storage\|ADR-013]] (2026-10-01) |
| **Fecha** | 2026-09-26 |
| **Origen** | D2 en [[04.2 - Plan de Corrección de Documentación]] |

## Contexto
El código guarda todo en `localStorage`, que tiene un límite aproximado de 5 MB, solo admite texto y no tiene índices. La especificación pide adjuntar contratos en PDF.

## Decisión
Migrar la persistencia a **IndexedDB mediante Dexie.js**, con el esquema versionado definido en [[03.1 - Esquema de Base de Datos y Entidades]].

## Alternativas consideradas
- Mantener `localStorage`: no admite PDFs ni crecimiento de la cartera.
- Backend con base de datos en servidor: necesario a futuro para varios usuarios, pero excesivo para un solo administrador en la fase actual.

## Consecuencias
- Se pueden guardar documentos como `Blob` y consultar por índices.
- Los datos siguen viviendo solo en el navegador: el respaldo JSON es obligatorio (ver [[01.4 - Seguridad y Protección de Datos]]).
- Hace falta migrar los datos existentes de la clave `credilote_skeleton_v1`.

---

Notas afectadas:
- [[01.2 - Arquitectura y Stack Tecnológico]]
- [[03.1 - Esquema de Base de Datos y Entidades]]
- Registro: [[05.0 - Registro de Decisiones]]
