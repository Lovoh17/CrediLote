---
title: "ADR-006: Reservado a Vendido al liquidar la prima"
tags:
  - adr
  - inventario
  - contratos
created: 2026-09-26
updated: 2026-09-26
status: aceptado
decision: D6
---

# ADR-006 - Reservado a Vendido al liquidar la prima

| Campo | Valor |
| :--- | :--- |
| **Estado** | Aceptado |
| **Fecha** | 2026-09-26 |
| **Origen** | D6 en [[04.2 - Plan de Corrección de Documentación]] |

## Contexto
La documentación decía que un lote pasa a Vendido al liquidar la prima, pero el código lo marca Vendido al registrar la promesa. No estaba definido si la prima admite abonos.

## Decisión
Registrar la promesa deja el contrato en `RESERVA` y el lote en `RESERVADO`. Pasan a `VIGENTE` / `VENDIDO` cuando **la prima está pagada por completo**. La prima se puede pagar en abonos (cuotas de tipo `PRIMA`) y la reserva tiene fecha límite.

## Alternativas consideradas
- Vendido al registrar la promesa: más simple, pero oculta las primas pendientes.
- Cambio de estado manual: flexible, pero propenso a inconsistencias.

## Consecuencias
- El estado del lote se deriva del contrato activo (invariante 5 de 03.1).
- Hace falta gestionar reservas vencidas (RN-L3).
- El código actual debe corregirse (tarea 6.6).

---

Notas afectadas:
- [[02.4 - Inventario y Gestión de Proyectos]]
- [[03.2 - Reglas de Negocio y Cálculos]]
- Registro: [[05.0 - Registro de Decisiones]]
