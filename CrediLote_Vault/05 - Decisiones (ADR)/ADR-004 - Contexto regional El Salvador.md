---
title: "ADR-004: Contexto regional El Salvador"
tags:
  - adr
  - regional
  - legal
created: 2026-09-26
updated: 2026-09-26
status: aceptado
decision: D4
---

# ADR-004 - Contexto regional El Salvador

| Campo | Valor |
| :--- | :--- |
| **Estado** | Aceptado |
| **Fecha** | 2026-09-26 |
| **Origen** | D4 en [[04.2 - Plan de Corrección de Documentación]] |

## Contexto
Los ejemplos de la documentación y del código usaban formatos de Honduras (HNL, DNI, +504, coordenadas de Tegucigalpa) sin que el país objetivo estuviera definido.

## Decisión
El país objetivo es **El Salvador**: moneda USD, DUI para personas, NIT para empresas, teléfono +503, varas cuadradas como unidad tradicional y división departamento → municipio → distrito.

## Alternativas consideradas
- Honduras: coincidía con los ejemplos existentes, pero no es el mercado objetivo.
- Multipaís configurable: más flexible, pero multiplica validaciones y formatos sin necesidad actual.

## Consecuencias
- El modelo usa `dui` y `nit` en lugar de `dniIdentificacion`.
- Hay que reemplazar ejemplos y valores por defecto en el código (tarea D4.5).
- Varias reglas dependen de normativa salvadoreña pendiente de validación legal (ver sección 5 de [[01.1 - Visión y Objetivos]]).

---

Notas afectadas:
- [[01.1 - Visión y Objetivos]]
- [[03.1 - Esquema de Base de Datos y Entidades]]
- Registro: [[05.0 - Registro de Decisiones]]
