---
title: "ADR-010: Extracción documental con Google Gemini API y conversión geodésica"
tags:
  - adr
  - ingesta
  - ia
  - gemini
  - geoespacial
created: 2026-09-27
updated: 2026-09-27
status: aceptado
replaces: ADR-003
---

# ADR-010 - Extracción documental con Google Gemini API y conversión geodésica

| Campo | Valor |
| :--- | :--- |
| **Estado** | Aceptado |
| **Fecha** | 2026-09-27 |
| **Reemplaza a** | [[ADR-003 - Extracción documental simulada]] |
| **Origen** | Fase 4 del Roadmap e Ingesta de Documentos Reales Salvadoreños |

## Contexto
Las escrituras de promesa de venta en El Salvador presentan solemnidad notarial con números, DUIs, plazos y montos expresados enteramente en palabras (ej. *"cero cuatro cinco uno dos tres siete ocho - ocho"*, *"VEINTE MIL DÓLARES"*; ejemplos ficticios). Además, las descripciones técnicas catastrales emplean el sistema de coordenadas oficial en metros (Lambert El Salvador / CNR) y secuencias de linderos por rumbos y distancias. Los sistemas OCR convencionales son incapaces de estructurar este lenguaje legal complejo.

## Decisión
1. Adoptar **Google Gemini Multimodal API** (`gemini-3.5-flash`, con fallback automático a `gemini-3.6-flash`, `gemini-3.8-flash`, `gemini-flash-latest` y `gemini-3-flash-preview`; cada modelo saturado se reintenta una vez antes de pasar al siguiente, actualizado el 2026-10-01) para el procesamiento directo de PDFs e imágenes notariales.
2. Llamar a Gemini a través de un **proxy local del servidor de Vite** (`/api/gemini`). La clave se guarda en `.env.local` como `GEMINI_API_KEY` (sin prefijo `VITE_`) y el servidor la agrega en la cabecera `x-goog-api-key`.
3. Incorporar en el cliente el módulo geodésico `geoElSalvador.ts` para transformar las coordenadas Lambert a WGS84 y computar poligonales de linderos con control de cierre y área (RN-G2, RN-G3).

## Alternativas consideradas
- **Mantener simulación:** Impedía procesar escrituras reales de clientes.
- **Tesseract.js local:** No comprende semántica jurídica notarial ni extrae con precisión números expresados en palabras.
- **Clave en una variable `VITE_*`** (primera versión, 2026-09-27): descartada. Vite copia esas variables al JavaScript del cliente; se comprobó que la clave quedaba dentro de `dist/assets/*.js`. `.gitignore` solo evita subir `.env.local` al repositorio, no protege la clave del build.
- **Backend propio completo:** se pospone para la fase multiusuario; el proxy de Vite basta para un solo administrador en su equipo.

## Consecuencias
- **Objetivo** (no medido aún): mediana de digitalización ≤ 60 s por contrato (criterio de [[01.1 - Visión y Objetivos]]).
- Los contratos se envían a un tercero (Google): deja de cumplirse la condición de [[ADR-009 - Riesgos de seguridad aceptados en la fase actual|ADR-009]] y aplican las condiciones de privacidad de [[01.4 - Seguridad y Protección de Datos]] §2 (tarea 7.11 pendiente).
- El proxy solo existe con `npm run dev` o `npm run preview`; un despliegue estático necesitaría un backend.
- La conversión Lambert supone el datum SIRGAS-ES2007; escrituras antiguas pueden quedar desplazadas.
- Requiere conexión a Internet y una clave activa de Google AI Studio.

---

Notas afectadas:
- [[02.1 - Ingesta y Procesamiento de Promesas de Venta]]
- [[02.2 - Módulo Geoespacial y Cartografía]]
- [[03.2 - Reglas de Negocio y Cálculos]]
- [[01.4 - Seguridad y Protección de Datos]]
- Registro: [[05.0 - Registro de Decisiones]]
