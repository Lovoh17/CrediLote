---
title: "ADR-009: Riesgos de seguridad aceptados en la fase actual"
tags:
  - adr
  - seguridad
created: 2026-09-26
updated: 2026-09-27
status: aceptado
decision: Fase 4
---

# ADR-009 - Riesgos de seguridad aceptados en la fase actual

| Campo | Valor |
| :--- | :--- |
| **Estado** | Aceptado |
| **Fecha** | 2026-09-26 |
| **Origen** | Fase 4 en [[04.2 - Plan de Corrección de Documentación]] |

> [!WARNING] Revisión requerida (2026-09-27)
> [[ADR-010 - Extracción documental con Google Gemini API y conversión geodésica|ADR-010]] empezó a enviar contratos a un servicio externo, que era una de las condiciones que terminan esta aceptación. Mientras se completan las condiciones de privacidad de [[01.4 - Seguridad y Protección de Datos]] §2 (tarea 7.11), el riesgo se mantiene aceptado **solo** con estas medidas: clave fuera del cliente mediante el proxy de Vite, plan de Gemini que no use los datos para entrenamiento y uso exclusivo del administrador en su equipo.

## Contexto
Los datos se guardan sin cifrar en el navegador y no hay inicio de sesión. Implementar autenticación real exige un backend.

## Decisión
Se **acepta** el almacenamiento local sin cifrado y la ausencia de inicio de sesión mientras haya **un solo administrador en su propio equipo** y ningún servicio externo de procesamiento, con medidas compensatorias obligatorias (cifrado de disco, bloqueo de sesión, perfil de navegador dedicado y respaldos).

## Alternativas consideradas
- PIN local en la aplicación: da una falsa sensación de seguridad, porque los datos siguen legibles en IndexedDB.
- Backend con autenticación desde ya: correcto a futuro, desproporcionado para un solo usuario.

## Consecuencias
- La decisión se revisa si hay varios usuarios, equipos compartidos, portal de clientes o envío a servicios externos.
- Detalle en [[01.4 - Seguridad y Protección de Datos]].

---

Notas afectadas:
- [[01.4 - Seguridad y Protección de Datos]]
- Registro: [[05.0 - Registro de Decisiones]]
