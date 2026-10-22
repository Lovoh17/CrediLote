---
title: "ADR-005: Folios por proyecto y año"
tags:
  - adr
  - cobranza
  - recibos
created: 2026-09-26
updated: 2026-09-26
status: aceptado
decision: D5
---

# ADR-005 - Folios por proyecto y año

| Campo | Valor |
| :--- | :--- |
| **Estado** | Aceptado |
| **Fecha** | 2026-09-26 |
| **Origen** | D5 en [[04.2 - Plan de Corrección de Documentación]] |

## Contexto
El código genera folios `REC-2026-` + cantidad de recibos: el año está fijo y el número se repite si se borra un recibo.

## Decisión
Formato **`PREFIJO-AAAA-NNNN`** por proyecto. El contador reinicia cada año, se guarda en `ContadorFolio` y se incrementa en la misma transacción que el recibo. Los folios anulados no se reutilizan.

## Alternativas consideradas
- Folio global continuo: más simple, pero no distingue proyectos.
- Folio global por año: compartido entre proyectos.

## Consecuencias
- Cada proyecto necesita un `prefijoFolio` único que no cambia después del primer recibo.
- Regla detallada en RN-C3 de [[03.2 - Reglas de Negocio y Cálculos]].

---

Notas afectadas:
- [[02.5 - Clientes, Cobranza y Recibos]]
- [[03.2 - Reglas de Negocio y Cálculos]]
- Registro: [[05.0 - Registro de Decisiones]]
