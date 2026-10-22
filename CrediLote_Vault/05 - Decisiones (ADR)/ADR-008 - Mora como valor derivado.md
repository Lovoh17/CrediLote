---
title: "ADR-008: Mora como valor derivado"
tags:
  - adr
  - cobranza
  - datos
created: 2026-09-26
updated: 2026-09-26
status: aceptado
decision: Fase 2
---

# ADR-008 - Mora como valor derivado

| Campo | Valor |
| :--- | :--- |
| **Estado** | Aceptado |
| **Fecha** | 2026-09-26 |
| **Origen** | Fase 2 en [[04.2 - Plan de Corrección de Documentación]] |

## Contexto
El Modelo v1 guardaba `EN_MORA` como estado de la cuota. Ese valor depende de la fecha actual, así que guardarlo exige un proceso diario que lo mantenga al día.

## Decisión
"En mora" se **calcula al consultar** (fecha, vencimiento y días de gracia). Solo se guarda el recargo generado, y únicamente al aplicar un pago, con la fecha de ese pago.

## Alternativas consideradas
- Guardar `EN_MORA` y actualizarlo al abrir la aplicación: riesgo de estados desactualizados.

## Consecuencias
- `EstadoCuota` ya no incluye `EN_MORA`.
- Las pantallas muestran el recargo estimado a hoy sin guardarlo (RN-C2).

---

Notas afectadas:
- [[03.1 - Esquema de Base de Datos y Entidades]]
- [[03.2 - Reglas de Negocio y Cálculos]]
- Registro: [[05.0 - Registro de Decisiones]]
