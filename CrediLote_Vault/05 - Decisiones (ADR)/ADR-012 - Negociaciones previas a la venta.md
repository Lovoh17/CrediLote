---
title: "ADR-012: Negociaciones previas a la venta"
tags:
  - adr
  - negociaciones
  - gastos
created: 2026-09-28
updated: 2026-09-28
status: aceptado
decision: Plan 04.3 (fase 8.7)
---

# ADR-012 - Negociaciones previas a la venta

| Campo | Valor |
| :--- | :--- |
| **Estado** | Aceptado |
| **Fecha** | 2026-09-28 |
| **Origen** | Pedido del administrador y decisiones N1–N4 de [[04.3 - Plan Sucesión, Beneficiarios y Gastos de Venta]] |

## Contexto
Antes de firmar una promesa de venta hay una negociación con el interesado que ya genera gastos (gasolina, viáticos). Esos gastos no tenían dónde registrarse porque todavía no existe la venta, y no había forma de recordar que una negociación cerrada está esperando que se suba su promesa.

## Decisión
1. Nuevo módulo **Negociaciones** con cuatro estados: *En negociación* → *Esperando promesa* (al marcarla completada) → *Convertida en venta* (al subir la promesa), o *Cancelada*.
2. Los gastos se registran en la negociación. Al subir la promesa vinculada, **pasan a la venta** y la prima los reembolsa a su responsable, igual que los demás gastos de venta ([[ADR-011 - Reparto de cobros a beneficiarios y reembolso de gastos|ADR-011]]).
3. **N1 · Si se cancela**, el administrador decide quién asume los gastos: la **sucesión** (se reembolsan de la próxima prima cobrada en el proyecto) o **quien los hizo** (no se reembolsan).
4. **N2 · Lote opcional:** se puede elegir un lote existente o describir el terreno con texto libre.
5. **N3 · Reserva:** al marcarla completada, el lote elegido pasa a *Reservado* a nombre del interesado; al cancelar o reabrir, vuelve a *Disponible*.
6. **N4 · Aviso:** contador en la barra lateral y avisos en el módulo, el tablero y la ingesta mientras haya negociaciones esperando promesa.

## Alternativas consideradas
- **Crear un contrato "provisional":** mezclaría ventas reales con acuerdos no firmados.
- **Registrar los gastos de negociación después, al subir la promesa:** se pierden los detalles y las fechas reales.

## Consecuencias
- `GastoVenta` admite gastos sin venta (`loteId` y `contratoId` opcionales, `negociacionId`), y `aCargoDe` suma el valor `RESPONSABLE`.
- Como aún no se pueden crear lotes a mano, muchas negociaciones usarán la descripción libre del terreno; la reserva solo aplica a lotes existentes.

---

Notas afectadas:
- [[02.7 - Beneficiarios y Gastos de Venta]]
- [[03.2 - Reglas de Negocio y Cálculos]]
- [[03.1 - Esquema de Base de Datos y Entidades]]
- Registro: [[05.0 - Registro de Decisiones]]
