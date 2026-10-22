---
title: "ADR-011: Reparto de cobros a beneficiarios y reembolso de gastos"
tags:
  - adr
  - sucesion
  - beneficiarios
  - gastos
created: 2026-09-27
updated: 2026-09-27
status: aceptado
decision: Plan 04.3 (B1–B10)
---

# ADR-011 - Reparto de cobros a beneficiarios y reembolso de gastos

| Campo | Valor |
| :--- | :--- |
| **Estado** | Aceptado |
| **Fecha** | 2026-09-27 |
| **Origen** | Decisiones B1–B10 de [[04.3 - Plan Sucesión, Beneficiarios y Gastos de Venta]] |

## Contexto
Los terrenos de un proyecto pertenecen a una sucesión con 7 beneficiarios que reciben parte de las ventas. Cada venta tiene gastos (gestión, abogados, trámites) que alguien adelanta y que deben devolvérsele. El sistema no tenía forma de registrar gastos ni de repartir lo cobrado.

## Decisión
1. Se reparte **lo efectivamente cobrado** (prima y cada cuota), no el precio de venta.
2. Los gastos **a cargo de la sucesión** se reembolsan **primero, desde la prima**, a su **responsable** (un beneficiario u otra persona). Si la prima no alcanza, el saldo se cubre con las cuotas siguientes. Los gastos **a cargo del comprador** solo se registran como control.
3. El neto se reparte según **porcentajes editables** que deben sumar 100 % (partes iguales por defecto con precisión completa). Los centavos sobrantes se asignan **en rotación**.
4. Se lleva un registro de **entregas** (liquidaciones) y el **saldo pendiente** por persona.
5. Se implementa sobre el almacenamiento actual (`localStorage`, modelo v1); la migración a Dexie incluirá estas entidades.

## Alternativas consideradas
- **Repartir el precio de venta al firmar:** reparte dinero que aún no se cobró.
- **Porcentajes redondeados a 4 decimales (6 × 14.2857 + 14.2858):** favorecía levemente al último beneficiario; se descartó por precisión completa.
- **Esperar a la migración a Dexie:** bloqueaba una necesidad inmediata.

## Consecuencias
- La prima pasa a ser un cobro con reparto propio (antes se daba por pagada sin registro).
- Los cobros registrados antes de configurar beneficiarios quedan en "Cobros sin repartir" hasta que se reparten manualmente.
- Anular un cobro no anula su reparto todavía (el modelo v1 no tiene anulación de pagos).

---

Notas afectadas:
- [[02.7 - Beneficiarios y Gastos de Venta]]
- [[03.2 - Reglas de Negocio y Cálculos]]
- [[03.1 - Esquema de Base de Datos y Entidades]]
- Registro: [[05.0 - Registro de Decisiones]]
