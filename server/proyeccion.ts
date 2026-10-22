/**
 * Tablas relacionales de consulta en Neon (ADR-013, fase 1b).
 *
 * El estado de la app sigue guardándose como documento JSONB versionado (credilote_estado). Cada vez que se
 * guarda, este módulo regenera tablas normales (proyectos, lotes, contratos, cuotas, recibos, beneficiarios…)
 * en una sola transacción, para consultarlas con SQL desde la consola de Neon o herramientas de reportes.
 * Son de solo lectura: cualquier cambio manual se pierde en el siguiente guardado.
 */
import type { NeonQueryFunction } from '@neondatabase/serverless';
// Tipos mínimos del estado guardado. No se importan de src/ para mantener separados los proyectos de TypeScript
// del servidor y del navegador; la forma de los datos está definida en src/shared/types/index.ts.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Registro = Record<string, any>;
type ResponsableGasto = { tipo: 'BENEFICIARIO'; beneficiarioId: string } | { tipo: 'EXTERNO'; nombre: string };
type Proyecto = Registro;
type Lote = Registro;
type Cliente = Registro;
type ContratoPromesa = Registro;
type Cuota = Registro;
type ReciboPago = Registro;
type Beneficiario = Registro;
type GastoVenta = Registro;
type DistribucionCobro = Registro;
type Liquidacion = Registro;
type Negociacion = Registro;

type Sql = NeonQueryFunction<false, false>;

interface Estado {
  proyectos?: Proyecto[];
  lotes?: Lote[];
  clientes?: Cliente[];
  contratos?: ContratoPromesa[];
  cuotas?: Cuota[];
  recibos?: ReciboPago[];
  beneficiarios?: Beneficiario[];
  gastos?: GastoVenta[];
  distribuciones?: DistribucionCobro[];
  liquidaciones?: Liquidacion[];
  negociaciones?: Negociacion[];
}

/** Tablas en orden de creación; se borran en orden inverso. */
const TABLAS = [
  'proyectos',
  'lotes',
  'clientes',
  'contratos',
  'cuotas',
  'recibos',
  'recibo_aplicaciones',
  'beneficiarios',
  'gastos_venta',
  'repartos',
  'reparto_reembolsos',
  'reparto_partes',
  'entregas',
  'negociaciones',
] as const;

const COMENTARIO = 'Tabla de consulta generada automáticamente por CrediLote desde credilote_estado (ADR-013). No editar: se regenera en cada guardado.';

export async function crearTablasProyeccion(sql: Sql) {
  await sql`create table if not exists proyectos (
    id text primary key, nombre text not null, descripcion text, ubicacion text,
    centro_lat double precision, centro_lng double precision, zoom_default integer, moneda text,
    tipo_propietario text, representante text, prefijo_folio text, created_at timestamptz)`;
  await sql`create table if not exists lotes (
    id text primary key, proyecto_id text, codigo_lote text, bloque_manzana text, area_m2 numeric(14,2),
    precio_lista numeric(14,2), estado text, comprador_id text, nombre_comprador text,
    linderos jsonb, vertices jsonb, notas text,
    tramos jsonb, referencia_partida text, punto_partida_lambert jsonb, origen jsonb, ubicado_por text)`;
  // Descripción técnica (2026-10-03): columnas agregadas a la tabla que ya existía
  await sql`alter table lotes
    add column if not exists tramos jsonb, add column if not exists referencia_partida text,
    add column if not exists punto_partida_lambert jsonb, add column if not exists origen jsonb,
    add column if not exists ubicado_por text`;
  await sql`create table if not exists clientes (
    id text primary key, nombre_completo text, dui text, telefono text, whatsapp text, email text,
    direccion text, created_at timestamptz)`;
  await sql`create table if not exists contratos (
    id text primary key, lote_id text, comprador_id text, vendedor_nombre text, fecha_firma date,
    precio_pactado numeric(14,2), prima_entregada numeric(14,2), saldo_financiado numeric(14,2),
    plazo_meses integer, tasa_interes_anual numeric(8,4), sistema_amortizacion text, dia_corte_pago integer,
    nombre_archivo_original text, created_at timestamptz)`;
  await sql`create table if not exists cuotas (
    id text primary key, contrato_id text, numero_cuota integer, fecha_vencimiento date,
    monto_cuota numeric(14,2), abono_capital numeric(14,2), abono_interes numeric(14,2), saldo_insoluto numeric(14,2),
    estado text, monto_pagado numeric(14,2), fecha_pago_real date, recibo_id text)`;
  await sql`create table if not exists recibos (
    id text primary key, folio text, concepto text, contrato_id text, cliente_id text, cuota_id text,
    monto_pagado numeric(14,2), metodo_pago text, referencia_bancaria text, fecha_pago date,
    saldo_pendiente_despues numeric(14,2), notas text, anulado boolean, motivo_anulacion text, fecha_anulacion date)`;
  await sql`create table if not exists recibo_aplicaciones (
    recibo_id text, cuota_id text, monto numeric(14,2), interes numeric(14,2), capital numeric(14,2), quedo_pagada boolean)`;
  await sql`create table if not exists beneficiarios (
    id text primary key, proyecto_id text, nombre_completo text, dui text, telefono text, cuenta_bancaria text,
    porcentaje numeric(14,10), activo boolean, orden integer, created_at timestamptz)`;
  await sql`create table if not exists gastos_venta (
    id text primary key, proyecto_id text, lote_id text, contrato_id text, negociacion_id text, categoria text,
    descripcion text, monto numeric(14,2), fecha date, a_cargo_de text, responsable_tipo text,
    responsable_beneficiario_id text, responsable_nombre text, referencia text, created_at timestamptz)`;
  await sql`create table if not exists repartos (
    id text primary key, proyecto_id text, contrato_id text, lote_id text, origen text, recibo_id text, fecha date,
    monto_cobrado numeric(14,2), neto numeric(14,2), anulado boolean, created_at timestamptz)`;
  await sql`create table if not exists reparto_reembolsos (reparto_id text, gasto_id text, monto numeric(14,2))`;
  await sql`create table if not exists reparto_partes (reparto_id text, beneficiario_id text, monto numeric(14,2))`;
  await sql`create table if not exists entregas (
    id text primary key, folio text, proyecto_id text, destinatario_tipo text, destinatario_beneficiario_id text,
    destinatario_nombre text, monto numeric(14,2), fecha date, metodo text, referencia text, notas text, created_at timestamptz,
    contrato_id text, lote_id text)`;
  // Saldos por lote vendido (2026-10-03): cada entrega sale de una venta
  await sql`alter table entregas add column if not exists contrato_id text, add column if not exists lote_id text`;
  await sql`create table if not exists negociaciones (
    id text primary key, proyecto_id text, interesado_nombre text, interesado_telefono text, lote_id text,
    lote_referencia text, responsable_tipo text, responsable_beneficiario_id text, responsable_nombre text, estado text,
    fecha_inicio date, fecha_completada date, fecha_cierre date, precio_acordado numeric(14,2), prima_acordada numeric(14,2),
    notas text, contrato_id text, gastos_asumidos_por text, motivo_cancelacion text, created_at timestamptz)`;

  for (const t of TABLAS) {
    await sql.query(`comment on table ${t} is '${COMENTARIO}'`);
  }

  // Vistas de consulta frecuente
  await sql`create or replace view v_estado_contratos as
    select c.id as contrato_id, p.nombre as proyecto, l.codigo_lote, cl.nombre_completo as comprador, cl.dui,
           c.fecha_firma, c.precio_pactado, c.prima_entregada, c.saldo_financiado, c.plazo_meses,
           count(q.*) filter (where q.estado = 'PAGADO') as cuotas_pagadas,
           coalesce(sum(q.monto_cuota - coalesce(q.monto_pagado, case when q.estado = 'PAGADO' then q.monto_cuota else 0 end)), 0) as saldo_pendiente,
           min(q.fecha_vencimiento) filter (where q.estado <> 'PAGADO') as proximo_vencimiento
      from contratos c
      left join lotes l on l.id = c.lote_id
      left join proyectos p on p.id = l.proyecto_id
      left join clientes cl on cl.id = c.comprador_id
      left join cuotas q on q.contrato_id = c.id
     group by c.id, p.nombre, l.codigo_lote, cl.nombre_completo, cl.dui`;
  await sql`create or replace view v_saldos_beneficiarios as
    select b.proyecto_id, b.id as beneficiario_id, b.nombre_completo, b.porcentaje,
           coalesce((select sum(rp.monto) from reparto_partes rp join repartos r on r.id = rp.reparto_id
                      where rp.beneficiario_id = b.id and not coalesce(r.anulado, false)), 0) as repartido,
           coalesce((select sum(rr.monto) from reparto_reembolsos rr join repartos r on r.id = rr.reparto_id
                       join gastos_venta g on g.id = rr.gasto_id
                      where g.responsable_beneficiario_id = b.id and not coalesce(r.anulado, false)), 0) as reembolsos,
           coalesce((select sum(e.monto) from entregas e where e.destinatario_beneficiario_id = b.id), 0) as entregado
      from beneficiarios b`;
  // Saldos de cada beneficiario por lote vendido (las entregas registradas sin venta no aparecen aquí)
  await sql`create or replace view v_saldos_beneficiarios_por_lote as
    select r.proyecto_id, r.contrato_id, l.codigo_lote, b.id as beneficiario_id, b.nombre_completo,
           coalesce(sum(rp.monto), 0) as repartido,
           coalesce((select sum(rr.monto) from reparto_reembolsos rr join repartos r2 on r2.id = rr.reparto_id
                       join gastos_venta g on g.id = rr.gasto_id
                      where r2.contrato_id = r.contrato_id and g.responsable_beneficiario_id = b.id
                        and not coalesce(r2.anulado, false)), 0) as reembolsos,
           coalesce((select sum(e.monto) from entregas e
                      where e.contrato_id = r.contrato_id and e.destinatario_beneficiario_id = b.id), 0) as entregado
      from repartos r
      join reparto_partes rp on rp.reparto_id = r.id
      join beneficiarios b on b.id = rp.beneficiario_id
      left join lotes l on l.id = r.lote_id
     where not coalesce(r.anulado, false)
     group by r.proyecto_id, r.contrato_id, l.codigo_lote, b.id, b.nombre_completo`;
}

/** Regenera todas las tablas de consulta a partir del estado, en una sola transacción. */
export async function proyectarEstado(sql: Sql, datos: Estado): Promise<Record<string, number>> {
  const filas = construirFilas(datos);
  const consultas = [
    ...[...TABLAS].reverse().map((t) => sql.query(`delete from ${t}`)),
    ...TABLAS.map((t) => sql.query(`insert into ${t} select * from jsonb_populate_recordset(null::${t}, $1::jsonb)`, [JSON.stringify(filas[t])])),
  ];
  await sql.transaction(consultas);
  return Object.fromEntries(TABLAS.map((t) => [t, filas[t].length]));
}

// ---------------------------------------------------------------------------
// Conversión del estado (camelCase, anidado) a filas (snake_case, planas)
// ---------------------------------------------------------------------------

/** Fechas vacías o mal formadas se guardan como NULL para no romper la transacción. */
const fecha = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v : null);
const responsable = (prefijo: string, r?: ResponsableGasto) => ({
  [`${prefijo}_tipo`]: r?.tipo ?? null,
  [`${prefijo}_beneficiario_id`]: r?.tipo === 'BENEFICIARIO' ? r.beneficiarioId : null,
  [`${prefijo}_nombre`]: r?.tipo === 'EXTERNO' ? r.nombre : null,
});

function construirFilas(d: Estado): Record<(typeof TABLAS)[number], Record<string, unknown>[]> {
  const recibos = d.recibos ?? [];
  const repartos = d.distribuciones ?? [];
  return {
    proyectos: (d.proyectos ?? []).map((p) => ({
      id: p.id, nombre: p.nombre, descripcion: p.descripcion, ubicacion: p.ubicacion,
      centro_lat: p.centroMapa?.lat, centro_lng: p.centroMapa?.lng, zoom_default: p.zoomDefault, moneda: p.moneda,
      tipo_propietario: p.tipoPropietario ?? 'PROPIO', representante: p.representante, prefijo_folio: p.prefijoFolio,
      created_at: fecha(p.createdAt),
    })),
    lotes: (d.lotes ?? []).map((l) => ({
      id: l.id, proyecto_id: l.proyectoId, codigo_lote: l.codigoLote, bloque_manzana: l.bloqueManzana, area_m2: l.areaM2,
      precio_lista: l.precioLista, estado: l.estado, comprador_id: l.compradorId, nombre_comprador: l.nombreCompradorLabel,
      linderos: l.linderos ?? null, vertices: l.verticesPoligono ?? [], notas: l.notas,
      // Rumbos y distancias: se guardan aunque el lote todavía no tenga ubicación (vertices vacío)
      tramos: l.descripcionTecnica?.tramos ?? null, referencia_partida: l.descripcionTecnica?.referenciaPartida,
      punto_partida_lambert: l.descripcionTecnica?.puntoPartida ?? null, origen: l.descripcionTecnica?.origen ?? null,
      ubicado_por: l.descripcionTecnica?.ubicadoPor,
    })),
    clientes: (d.clientes ?? []).map((c) => ({
      id: c.id, nombre_completo: c.nombreCompleto, dui: c.dniIdentificacion, telefono: c.telefono, whatsapp: c.whatsapp,
      email: c.email, direccion: c.direccion, created_at: fecha(c.createdAt),
    })),
    contratos: (d.contratos ?? []).map((c) => ({
      id: c.id, lote_id: c.loteId, comprador_id: c.compradorId, vendedor_nombre: c.vendedorNombre, fecha_firma: fecha(c.fechaFirma),
      precio_pactado: c.precioPactado, prima_entregada: c.primaEntregada, saldo_financiado: c.saldoFinanciado,
      plazo_meses: c.plazoMeses, tasa_interes_anual: c.tasaInteresAnual, sistema_amortizacion: c.sistemaAmortizacion,
      dia_corte_pago: c.diaCortePago, nombre_archivo_original: c.nombreArchivoOriginal, created_at: fecha(c.createdAt),
    })),
    cuotas: (d.cuotas ?? []).map((q) => ({
      id: q.id, contrato_id: q.contratoId, numero_cuota: q.numeroCuota, fecha_vencimiento: fecha(q.fechaVencimiento),
      monto_cuota: q.montoCuota, abono_capital: q.abonoCapital, abono_interes: q.abonoInteres, saldo_insoluto: q.saldoInsoluto,
      estado: q.estado, monto_pagado: q.montoPagado ?? (q.estado === 'PAGADO' ? q.montoCuota : 0),
      fecha_pago_real: fecha(q.fechaPagoReal), recibo_id: q.reciboId,
    })),
    recibos: recibos.map((r) => ({
      id: r.id, folio: r.folio, concepto: r.concepto ?? 'CUOTA', contrato_id: r.contratoId, cliente_id: r.clienteId,
      cuota_id: r.cuotaId, monto_pagado: r.montoPagado, metodo_pago: r.metodoPago, referencia_bancaria: r.referenciaBancaria,
      fecha_pago: fecha(r.fechaPago), saldo_pendiente_despues: r.saldoPendienteDespues, notas: r.notas,
      anulado: r.anulado ?? false, motivo_anulacion: r.motivoAnulacion, fecha_anulacion: fecha(r.fechaAnulacion),
    })),
    recibo_aplicaciones: recibos.flatMap((r) =>
      (r.aplicaciones ?? []).map((a: Registro) => ({
        recibo_id: r.id, cuota_id: a.cuotaId, monto: a.monto, interes: a.interes, capital: a.capital, quedo_pagada: a.quedoPagada,
      }))
    ),
    beneficiarios: (d.beneficiarios ?? []).map((b) => ({
      id: b.id, proyecto_id: b.proyectoId, nombre_completo: b.nombreCompleto, dui: b.dui, telefono: b.telefono,
      cuenta_bancaria: b.cuentaBancaria, porcentaje: b.porcentaje, activo: b.activo, orden: b.orden, created_at: fecha(b.createdAt),
    })),
    gastos_venta: (d.gastos ?? []).map((g) => ({
      id: g.id, proyecto_id: g.proyectoId, lote_id: g.loteId, contrato_id: g.contratoId, negociacion_id: g.negociacionId,
      categoria: g.categoria, descripcion: g.descripcion, monto: g.monto, fecha: fecha(g.fecha), a_cargo_de: g.aCargoDe,
      ...responsable('responsable', g.responsable), referencia: g.referencia, created_at: fecha(g.createdAt),
    })),
    repartos: repartos.map((r) => ({
      id: r.id, proyecto_id: r.proyectoId, contrato_id: r.contratoId, lote_id: r.loteId, origen: r.origen, recibo_id: r.reciboId,
      fecha: fecha(r.fecha), monto_cobrado: r.montoCobrado, neto: r.neto, anulado: r.anulada ?? false, created_at: fecha(r.createdAt),
    })),
    reparto_reembolsos: repartos.flatMap((r) => (r.reembolsos ?? []).map((x: Registro) => ({ reparto_id: r.id, gasto_id: x.gastoId, monto: x.monto }))),
    reparto_partes: repartos.flatMap((r) => (r.partes ?? []).map((x: Registro) => ({ reparto_id: r.id, beneficiario_id: x.beneficiarioId, monto: x.monto }))),
    entregas: (d.liquidaciones ?? []).map((l) => ({
      id: l.id, folio: l.folio, proyecto_id: l.proyectoId, ...responsable('destinatario', l.destinatario), monto: l.monto,
      fecha: fecha(l.fecha), metodo: l.metodo, referencia: l.referencia, notas: l.notas, created_at: fecha(l.createdAt),
      contrato_id: l.contratoId, lote_id: l.loteId,
    })),
    negociaciones: (d.negociaciones ?? []).map((n) => ({
      id: n.id, proyecto_id: n.proyectoId, interesado_nombre: n.interesadoNombre, interesado_telefono: n.interesadoTelefono,
      lote_id: n.loteId, lote_referencia: n.loteReferencia, ...responsable('responsable', n.responsable), estado: n.estado,
      fecha_inicio: fecha(n.fechaInicio), fecha_completada: fecha(n.fechaCompletada), fecha_cierre: fecha(n.fechaCierre),
      precio_acordado: n.precioAcordado, prima_acordada: n.primaAcordada, notas: n.notas, contrato_id: n.contratoId,
      gastos_asumidos_por: n.gastosAsumidosPor, motivo_cancelacion: n.motivoCancelacion, created_at: fecha(n.createdAt),
    })),
  };
}
