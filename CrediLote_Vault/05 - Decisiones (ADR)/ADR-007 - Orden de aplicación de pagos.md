---
title: "ADR-007: Orden de aplicación de pagos"
tags:
  - adr
  - cobranza
  - finanzas
created: 2026-09-26
updated: 2026-09-26
status: aceptado
decision: D7
---

# ADR-007 - Orden de aplicación de pagos

| Campo | Valor |
| :--- | :--- |
| **Estado** | Aceptado |
| **Fecha** | 2026-09-26 |
| **Origen** | D7 en [[04.2 - Plan de Corrección de Documentación]] |

## Contexto
El código marca una cuota como pagada sin importar el monto recibido. La especificación pide pagos parciales, excedentes y desglose en el recibo.

## Decisión
Cada pago cubre primero las cuotas más antiguas y, dentro de cada cuota, **recargo → interés → capital**. El excedente va a la siguiente cuota o como abono a capital, según elija el administrador.

## Alternativas consideradas
- Capital primero: favorece al comprador, pero es poco habitual y reduce el control de la mora.
- Cuota completa sin desglose: impide representar pagos parciales con precisión.

## Consecuencias
- Se necesitan las entidades `Pago` y `AplicacionPago` (Modelo v2).
- Algoritmo y ejemplo en RN-C1 de [[03.2 - Reglas de Negocio y Cálculos]].

---

Notas afectadas:
- [[02.5 - Clientes, Cobranza y Recibos]]
- [[03.2 - Reglas de Negocio y Cálculos]]
- Registro: [[05.0 - Registro de Decisiones]]
