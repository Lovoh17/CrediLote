---
title: "ADR-001: Librería de UI Tailwind y componentes propios"
tags:
  - adr
  - ui
  - frontend
created: 2026-09-26
updated: 2026-09-26
status: aceptado
decision: D1
---

# ADR-001 - Librería de UI Tailwind y componentes propios

| Campo | Valor |
| :--- | :--- |
| **Estado** | Aceptado |
| **Fecha** | 2026-09-26 |
| **Origen** | D1 en [[04.2 - Plan de Corrección de Documentación]] |

## Contexto
La documentación especificaba Saas UI sobre Chakra UI, pero el código ya estaba construido con Tailwind CSS y componentes propios que imitan sus patrones (AppShell, DataGrid, PropertyList). Mantener ambas bibliotecas genera colisiones de especificidad CSS y duplica dependencias.

## Decisión
Usar **Tailwind CSS con componentes propios** en `src/shared/components/ui/`, inspirados en los patrones de Saas UI, sin depender de Saas UI ni de Chakra UI.

## Alternativas consideradas
- Migrar a Saas UI + Chakra UI: más componentes listos (CommandBar, StepForm), pero exige reescribir la interfaz existente.
- Usar ambas bibliotecas: conflictos de estilos y bundle más pesado.

## Consecuencias
- Componentes avanzados (formulario por pasos, barra de comandos, dropzone) deben construirse a mano.
- Control total del diseño y bundle más liviano.
- Los colores de estado deben centralizarse (deuda registrada en [[01.3 - Sistema de Diseño y UI]]).

---

Notas afectadas:
- [[01.2 - Arquitectura y Stack Tecnológico]]
- [[01.3 - Sistema de Diseño y UI]]
- Registro: [[05.0 - Registro de Decisiones]]
