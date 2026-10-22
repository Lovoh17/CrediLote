---
title: Índice General - CrediLote
tags:
  - moc
  - arquitectura
  - documentacion
  - credilote
created: 2026-09-26
updated: 2026-09-26
status: activo
---

# CrediLote - Mapa de Contenido (MOC)

Documentación y especificación técnica de **CrediLote**, plataforma integral de gestión territorial, documental y financiera para administradores y desarrolladores de lotificaciones y venta de terrenos.

```mermaid
graph TD
    MOC[CrediLote Vault] --> V[01 - Visión y Arquitectura]
    MOC --> M[02 - Módulos del Sistema]
    MOC --> D[03 - Modelo de Datos]
    MOC --> R[04 - Roadmap y Fases]
    MOC --> A[05 - Decisiones ADR]
    MOC --> G[00.1 - Glosario]

    V --> V1[01.1 - Visión y Objetivos]
    V --> V2[01.2 - Arquitectura y Stack Tecnológico]
    V --> V3[01.3 - Sistema de Diseño y UI]
    V --> V4[01.4 - Seguridad y Protección de Datos]

    M --> M1[02.1 - Ingesta y Procesamiento de Promesas de Venta]
    M --> M2[02.2 - Módulo Geoespacial y Cartografía]
    M --> M3[02.3 - Motor Financiero y Amortización]
    M --> M4[02.4 - Inventario y Gestión de Proyectos]
    M --> M5[02.5 - Clientes, Cobranza y Recibos]
    M --> M6[02.6 - Dashboard y Analítica Administrativa]
    M --> M7[02.7 - Beneficiarios y Gastos de Venta]

    D --> D1[03.1 - Esquema de Base de Datos y Entidades]
    D --> D2[03.2 - Reglas de Negocio y Cálculos]
    R --> R1[04.1 - Fases de Implementación]
    R --> R2[04.2 - Plan de Corrección de Documentación]
    R --> R3[04.3 - Plan Sucesión, Beneficiarios y Gastos de Venta]
    R --> R4[04.4 - Indicaciones para Gemini (Frontend)]
    A --> A0[05.0 - Registro de Decisiones]

    class G,V1,V2,V3,V4,M1,M2,M3,M4,M5,M6,M7,D1,D2,R1,R2,R3,R4,A0 internal-link;
```

> [!TIP] Navegación
> Los nodos del diagrama son clicables en Obsidian (clase `internal-link`).

---

## Convención de Estados de las Notas

El campo `status` del frontmatter indica la relación entre la nota y el código:

| `status` | Significado |
| :--- | :--- |
| `activo` | Nota de navegación o planificación que se mantiene viva. |
| `especificado` | Solo especificación; aún no hay código. |
| `en-desarrollo` | Parcialmente implementado; la nota marca qué falta. |
| `implementado` | El código cumple toda la especificación de la nota. |

El campo `updated` registra la fecha de la última revisión.

---

## Estructura de Documentación

- **[[00.1 - Glosario]]**: Términos de negocio, finanzas, marco legal salvadoreño, cartografía y conceptos técnicos.

### [[01 - Visión y Arquitectura/01.1 - Visión y Objetivos|01. Visión y Arquitectura]]
- **[[01.1 - Visión y Objetivos]]**: Problema raíz, propuesta de valor, alcance operativo para el administrador y objetivos del sistema.
- **[[01.2 - Arquitectura y Stack Tecnológico]]**: Stack implementado y objetivo (React, Tailwind, Leaflet, persistencia y extracción documental), estructura del código y capas.
- **[[01.3 - Sistema de Diseño y UI]]**: Componentes propios con Tailwind inspirados en patrones Saas UI (AppShell, DataGrid, PropertyList), colores de estado y deuda técnica de tokens.
- **[[01.4 - Seguridad y Protección de Datos]]**: Situación real de seguridad, riesgos aceptados, uso de servicios externos, claves de API y respaldo.

---

### [[02 - Módulos del Sistema/02.1 - Ingesta y Procesamiento de Promesas de Venta|02. Módulos del Sistema]]
1. **[[02.1 - Ingesta y Procesamiento de Promesas de Venta]]**:
   - Carga de contratos en formato PDF e imagen (Dropzone interactivo).
   - Extracción estructurada con IA Multimodal (Google Gemini) adaptada a escrituras notariales salvadoreñas.
   - Visor documental dual en vivo y formulario de ratificación humana.
2. **[[02.2 - Módulo Geoespacial y Cartografía]]**:
   - Georreferenciación de vértices, conversión oficial Lambert El Salvador (CNR) y cálculo de rumbos y distancias.
   - Auto-encuadre dinámico (`fitBounds`) y etiquetado con titularidad.
   - Código de estados (Disponible, Reservado, Vendido, Finiquitado).
   - Edición y ajuste manual de coordenadas en mapa satelital.
3. **[[02.3 - Motor Financiero y Amortización]]**:
   - Gestión de primas, plazos y saldos financiados.
   - Algoritmos de amortización: Francés (cuota fija), Alemán y Crédito Directo sin intereses.
   - Control de abonos extraordinarios y cálculo de moras.
4. **[[02.4 - Inventario y Gestión de Proyectos]]**:
   - Estructura jerárquica: Proyecto / Lotificación -> Bloque/Manzana -> Lote.
   - Ciclo de vida del lote y características topográficas.
5. **[[02.5 - Clientes, Cobranza y Recibos]]**:
   - Ficha de control de compradores.
   - Registro de transacciones con desglose capital/interés.
   - Emisión de recibos imprimibles.
6. **[[02.6 - Dashboard y Analítica Administrativa]]**:
   - Indicadores de inventario, tasa de colocación, cartera por cobrar, eficiencia de cobranza y morosidad.

7. **[[02.7 - Beneficiarios y Gastos de Venta]]**:
   - Proyectos de sucesión con beneficiarios y porcentajes.
   - Gastos de venta amarrados a cada lote y reembolsados desde la prima a su responsable.
   - Reparto de cada cobro, saldos por persona y entregas con comprobante.
   - Negociaciones previas a la venta con sus gastos y aviso para subir la promesa.

---

### [[03 - Modelo de Datos/03.1 - Esquema de Base de Datos y Entidades|03. Modelo de Datos]]
- **[[03.1 - Esquema de Base de Datos y Entidades]]**: Diagrama entidad-relación, tipos en TypeScript y modelo v2 (Proyecto, Bloque, Lote, Cliente, Vendedor, ContratoPromesa, Cuota, Pago, AplicacionPago, ReciboPago, etc.) y esquema Dexie.
- **[[03.2 - Reglas de Negocio y Cálculos]]**: Reglas RN-xx con ejemplos numéricos: amortización y redondeo, aplicación de pagos, mora, folios, ciclo de vida del contrato, rumbos y distancias, validaciones de ingesta.

---

### [[04 - Roadmap y Fases/04.1 - Fases de Implementación|04. Roadmap y Fases]]
- **[[04.1 - Fases de Implementación]]**: Plan de desarrollo modular por fases y avance real de cada una.
- **[[04.2 - Plan de Corrección de Documentación]]**: Plan de trabajo para corregir inconsistencias del vault y alinearlo con el código.
- **[[04.4 - Indicaciones para Gemini (Frontend)]]**: Reparto del trabajo entre agentes y tareas de interfaz pendientes.
- **[[04.3 - Plan Sucesión, Beneficiarios y Gastos de Venta]]**: Plan en revisión para el proyecto de la sucesión, reparto a 7 beneficiarios y módulo de gastos de venta.

---

### [[05 - Decisiones (ADR)/05.0 - Registro de Decisiones|05. Decisiones (ADR)]]
- **[[05.0 - Registro de Decisiones]]**: Índice y plantilla de los registros de decisiones (ADR-001 a ADR-013): UI, persistencia, extracción Gemini, país, folios, estados, pagos, mora, riesgos de seguridad y georreferenciación Lambert.
