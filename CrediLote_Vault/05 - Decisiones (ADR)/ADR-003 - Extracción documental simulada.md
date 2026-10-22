---
title: "ADR-003: Extracción documental simulada"
tags:
  - adr
  - ingesta
  - ia
  - ocr
created: 2026-09-26
updated: 2026-09-26
status: reemplazado
replaced_by: ADR-010
decision: D3
---

# ADR-003 - Extracción documental simulada

| Campo | Valor |
| :--- | :--- |
| **Estado** | Reemplazado por [[ADR-010 - Extracción documental con Google Gemini API y conversión geodésica\|ADR-010]] (2026-09-27) |
| **Fecha** | 2026-09-26 |
| **Origen** | D3 en [[04.2 - Plan de Corrección de Documentación]] |

## Contexto
La documentación describía extracción con OCR e IA (Gemini), pero el código solo carga datos fijos de un contrato de ejemplo. Integrar un servicio externo implica enviar datos personales a terceros y proteger una clave de API.

## Decisión
Documentar explícitamente que la extracción es **simulada** en esta etapa. El motor real (OCR local o IA externa) se decidirá después; si se usa un servicio externo, será **siempre mediante un proxy propio**.

## Alternativas consideradas
- Integrar Gemini directamente desde el navegador: expone la clave de API y envía datos sin control.
- Integrar Tesseract.js ya: sin costo ni envío de datos, pero con menor precisión en escaneos de baja calidad.

## Consecuencias
- El flujo de pantalla dividida y validación se puede probar sin depender de un proveedor.
- El criterio de 60 s por contrato no se puede medir hasta tener extracción real.
- Las condiciones de privacidad para un servicio externo están en [[01.4 - Seguridad y Protección de Datos]].

---

Notas afectadas:
- [[02.1 - Ingesta y Procesamiento de Promesas de Venta]]
- [[03.2 - Reglas de Negocio y Cálculos]]
- Registro: [[05.0 - Registro de Decisiones]]
