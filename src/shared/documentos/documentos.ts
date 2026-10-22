/**
 * Contenido de los documentos imprimibles con formato de recibo (plan 04.3, fase 8.8).
 * Funciones puras: reciben los datos y devuelven la estructura del documento. La presentación vive en
 * `src/shared/components/documentos/DocumentoRecibo.tsx`; el diseño visual puede cambiar sin tocar este contenido.
 */
import {
  Beneficiario,
  Cliente,
  ContratoPromesa,
  Cuota,
  DistribucionCobro,
  GastoVenta,
  Liquidacion,
  Lote,
  MetodoPago,
  Proyecto,
  ReciboPago,
  ResponsableGasto,
} from '@/shared/types';
import { montoEnLetras } from './numeroALetras';
import { calcularSaldos, calcularSaldosPorVenta, clavePersona, SaldosDeVenta } from '@/modules/beneficiarios/engine/reparto';

export interface DocumentoRecibo {
  tipo: 'RECIBO_PRIMA' | 'RECIBO_CUOTA' | 'COMPROBANTE_ENTREGA';
  titulo: string;
  folio: string;
  anulado?: { motivo?: string; fecha?: string };
  emisor: { nombre: string; lineas: string[] };
  lugarYFecha: string;
  cantidad: number;
  cantidadEnLetras: string;
  /** Texto principal del recibo ("Recibí de … la cantidad de … en concepto de …"). */
  cuerpo: { recibiDe: string; identificacion?: string; concepto: string };
  detalle: { etiqueta: string; valor: string; destacado?: boolean }[];
  tabla?: { titulo: string; columnas: string[]; filas: string[][]; alineacionDerecha?: number[] };
  notas: string[];
  firmas: { etiqueta: string; nombre?: string; identificacion?: string }[];
}

// ---------------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------------

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-09-30" → "30 de septiembre de 2026" (sin conversión de zona horaria). */
export function fechaLarga(fechaISO?: string): string {
  const m = fechaISO && /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaISO);
  if (!m) return fechaISO ?? '';
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

export function dinero(monto: number): string {
  return `$ ${Number(monto || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const METODOS: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia bancaria',
  DEPOSITO: 'Depósito bancario',
  CHEQUE: 'Cheque',
};

const formaDePago = (metodo?: MetodoPago, referencia?: string) =>
  metodo ? `${METODOS[metodo]}${referencia ? ` (ref. ${referencia})` : ''}` : referencia ? `Ref. ${referencia}` : 'No especificada';

function emisorDe(proyecto: Proyecto): DocumentoRecibo['emisor'] {
  const lineas: string[] = [];
  if (proyecto.tipoPropietario === 'SUCESION' && proyecto.representante) lineas.push(`Representante: ${proyecto.representante}`);
  if (proyecto.ubicacion && proyecto.ubicacion !== 'Ubicación no especificada') lineas.push(proyecto.ubicacion);
  return { nombre: proyecto.nombre, lineas };
}

const lugar = (proyecto: Proyecto) =>
  proyecto.ubicacion && proyecto.ubicacion !== 'Ubicación no especificada' ? `${proyecto.ubicacion}, ` : '';

const NOTA_INTERNA =
  'Comprobante interno de pago. No sustituye al documento tributario electrónico (DTE) cuando este sea exigible.';

/** Lista legible de números: [3] → "3"; [3, 4] → "3 y 4"; [3, 4, 5] → "3, 4 y 5". */
function listaNumeros(nums: number[]): string {
  if (nums.length <= 1) return nums.join('');
  return `${nums.slice(0, -1).join(', ')} y ${nums[nums.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Recibo de prima y de cuotas
// ---------------------------------------------------------------------------

export interface DatosReciboPago {
  recibo: ReciboPago;
  contrato: ContratoPromesa;
  cliente?: Cliente;
  lote?: Lote;
  proyecto: Proyecto;
  /** Todas las cuotas del contrato (para numeración y total de cuotas). */
  cuotas: Cuota[];
}

export function construirReciboDePago({ recibo, contrato, cliente, lote, proyecto, cuotas }: DatosReciboPago): DocumentoRecibo {
  const esPrima = recibo.concepto === 'PRIMA';
  const total = cuotas.length;
  const porId = new Map(cuotas.map((c) => [c.id, c]));
  const aplicaciones =
    recibo.aplicaciones ?? (recibo.cuotaId ? [{ cuotaId: recibo.cuotaId, monto: recibo.montoPagado }] : []);
  const inmueble = `${lote ? `lote ${lote.codigoLote}${lote.bloqueManzana ? `, ${lote.bloqueManzana}` : ''}` : 'inmueble'} del proyecto ${proyecto.nombre}`;

  let concepto: string;
  if (esPrima) {
    concepto = `prima (anticipo) de la promesa de venta del ${inmueble}, firmada el ${fechaLarga(contrato.fechaFirma)}`;
  } else {
    const numeros = aplicaciones.map((a) => porId.get(a.cuotaId)?.numeroCuota).filter((n): n is number => !!n);
    const completas = aplicaciones.every((a) => a.quedoPagada !== false);
    const plural = numeros.length > 1;
    concepto = `${completas ? 'pago' : 'abono'} ${plural ? 'de las cuotas' : 'a la cuota'} ${listaNumeros(numeros)} de ${total} del ${inmueble}`;
  }

  const detalle: DocumentoRecibo['detalle'] = [
    { etiqueta: 'Forma de pago', valor: formaDePago(recibo.metodoPago, recibo.referenciaBancaria) },
    { etiqueta: 'Precio pactado', valor: dinero(contrato.precioPactado) },
  ];
  if (esPrima) {
    detalle.push({ etiqueta: 'Saldo financiado', valor: `${dinero(contrato.saldoFinanciado)} en ${contrato.plazoMeses} cuotas` });
  } else {
    const interes = aplicaciones.reduce((a, x) => a + (x.interes ?? 0), 0);
    const capital = aplicaciones.reduce((a, x) => a + (x.capital ?? x.monto), 0);
    if (interes > 0) detalle.push({ etiqueta: 'Aplicado a intereses', valor: dinero(interes) });
    detalle.push({ etiqueta: 'Aplicado a capital', valor: dinero(capital) });
  }
  if (recibo.saldoPendienteDespues !== undefined) {
    detalle.push({ etiqueta: 'Saldo pendiente después de este pago', valor: dinero(recibo.saldoPendienteDespues), destacado: true });
  }

  const tabla: DocumentoRecibo['tabla'] =
    !esPrima && aplicaciones.length > 0
      ? {
          titulo: 'Cuotas cubiertas por este pago',
          columnas: ['Cuota', 'Vencimiento', 'Aplicado', 'Interés', 'Capital', 'Estado'],
          alineacionDerecha: [2, 3, 4],
          filas: aplicaciones.map((a) => {
            const c = porId.get(a.cuotaId);
            return [
              c ? `${c.numeroCuota} de ${total}` : '—',
              c ? fechaLarga(c.fechaVencimiento) : '—',
              dinero(a.monto),
              dinero(a.interes ?? 0),
              dinero(a.capital ?? a.monto),
              a.quedoPagada === false ? 'Abono parcial' : 'Pagada',
            ];
          }),
        }
      : undefined;

  const notas = [NOTA_INTERNA];
  if (recibo.notas) notas.unshift(recibo.notas);

  return {
    tipo: esPrima ? 'RECIBO_PRIMA' : 'RECIBO_CUOTA',
    titulo: esPrima ? 'RECIBO DE PRIMA' : 'RECIBO DE PAGO',
    folio: recibo.folio,
    anulado: recibo.anulado ? { motivo: recibo.motivoAnulacion, fecha: fechaLarga(recibo.fechaAnulacion) } : undefined,
    emisor: emisorDe(proyecto),
    lugarYFecha: `${lugar(proyecto)}${fechaLarga(recibo.fechaPago)}`,
    cantidad: recibo.montoPagado,
    cantidadEnLetras: montoEnLetras(recibo.montoPagado),
    cuerpo: {
      recibiDe: cliente?.nombreCompleto ?? 'Comprador',
      identificacion: cliente?.dniIdentificacion ? `DUI ${cliente.dniIdentificacion}` : undefined,
      concepto,
    },
    detalle,
    tabla,
    notas,
    firmas: [
      {
        etiqueta: 'Recibí conforme',
        nombre: proyecto.tipoPropietario === 'SUCESION' && proyecto.representante ? proyecto.representante : proyecto.nombre,
      },
      {
        etiqueta: 'Entregué conforme',
        nombre: cliente?.nombreCompleto,
        identificacion: cliente?.dniIdentificacion ? `DUI ${cliente.dniIdentificacion}` : undefined,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Comprobante de entrega a beneficiarios y responsables de gastos
// ---------------------------------------------------------------------------

export interface DatosComprobanteEntrega {
  liquidacion: Liquidacion;
  proyecto: Proyecto;
  beneficiarios: Beneficiario[];
  gastos: GastoVenta[];
  distribuciones: DistribucionCobro[];
  liquidaciones: Liquidacion[];
  /** Para nombrar el lote vendido del que sale la entrega. */
  lotes?: Lote[];
}

export function construirComprobanteDeEntrega({
  liquidacion,
  proyecto,
  beneficiarios,
  gastos,
  distribuciones,
  liquidaciones,
  lotes = [],
}: DatosComprobanteEntrega): DocumentoRecibo {
  const persona = liquidacion.destinatario;
  const clave = clavePersona(persona);
  const beneficiario =
    persona.tipo === 'BENEFICIARIO' ? beneficiarios.find((b) => b.id === persona.beneficiarioId) : undefined;
  const nombre = nombreDe(persona, beneficiarios);
  const hasta = liquidacion.createdAt;

  // Lo que le correspondía hasta el momento de esta entrega (repartos vigentes y entregas registrados antes):
  // de la venta de la que sale el dinero, o de todo el proyecto si la entrega no tiene venta (registros anteriores).
  const repartosAntes = distribuciones.filter((d) => !d.anulada && d.createdAt <= hasta);
  const entregasAntes = liquidaciones.filter((l) => l.id !== liquidacion.id && l.createdAt < hasta);
  const saldo = liquidacion.contratoId
    ? calcularSaldosPorVenta(beneficiarios, gastos, repartosAntes, entregasAntes)
        .find((v) => v.contratoId === liquidacion.contratoId)
        ?.saldos.find((x) => x.clave === clave)
    : calcularSaldos(beneficiarios, gastos, repartosAntes, entregasAntes).find((x) => x.clave === clave);
  const repartido = saldo?.repartido ?? 0;
  const reembolsos = saldo?.reembolsos ?? 0;
  const entregadoAntes = saldo?.entregado ?? 0;
  const saldoDespues = Math.round((repartido + reembolsos - entregadoAntes - liquidacion.monto) * 100) / 100;

  const loteId = liquidacion.loteId ?? distribuciones.find((d) => d.contratoId === liquidacion.contratoId)?.loteId;
  const codigoLote = liquidacion.contratoId ? lotes.find((l) => l.id === loteId)?.codigoLote ?? 'vendido' : undefined;

  const conceptos: string[] = [];
  if (repartido > 0 || persona.tipo === 'BENEFICIARIO') {
    const origen = codigoLote
      ? `la venta del lote ${codigoLote} del proyecto ${proyecto.nombre}`
      : `las ventas del proyecto ${proyecto.nombre}`;
    conceptos.push(`participación${beneficiario ? ` (${beneficiario.porcentaje.toFixed(4)} %)` : ''} en los cobros de ${origen}`);
  }
  if (reembolsos > 0) conceptos.push('reembolso de gastos de venta adelantados');
  if (conceptos.length === 0) {
    conceptos.push(`reembolso de gastos de venta ${codigoLote ? `del lote ${codigoLote} ` : ''}del proyecto ${proyecto.nombre}`);
  }

  const identificacion = beneficiario?.dui ? `DUI ${beneficiario.dui}` : undefined;
  const entrega = proyecto.tipoPropietario === 'SUCESION' && proyecto.representante ? proyecto.representante : proyecto.nombre;

  return {
    tipo: 'COMPROBANTE_ENTREGA',
    titulo: 'COMPROBANTE DE ENTREGA DE FONDOS',
    folio: liquidacion.folio ?? liquidacion.id,
    emisor: emisorDe(proyecto),
    lugarYFecha: `${lugar(proyecto)}${fechaLarga(liquidacion.fecha)}`,
    cantidad: liquidacion.monto,
    cantidadEnLetras: montoEnLetras(liquidacion.monto),
    cuerpo: {
      recibiDe: proyecto.tipoPropietario === 'SUCESION' ? `${proyecto.nombre}${proyecto.representante ? `, por medio de ${proyecto.representante}` : ''}` : proyecto.nombre,
      concepto: conceptos.join(' y '),
    },
    detalle: [
      { etiqueta: 'Recibe', valor: `${nombre}${identificacion ? ` (${identificacion})` : ''}` },
      ...(codigoLote ? [{ etiqueta: 'Lote vendido', valor: codigoLote }] : []),
      { etiqueta: 'Forma de entrega', valor: formaDePago(liquidacion.metodo, liquidacion.referencia) },
      ...(repartido > 0 || persona.tipo === 'BENEFICIARIO' ? [{ etiqueta: 'Participación acumulada', valor: dinero(repartido) }] : []),
      ...(reembolsos > 0 ? [{ etiqueta: 'Reembolsos de gastos acumulados', valor: dinero(reembolsos) }] : []),
      { etiqueta: 'Entregado anteriormente', valor: dinero(entregadoAntes) },
      { etiqueta: 'Entregado en este comprobante', valor: dinero(liquidacion.monto) },
      { etiqueta: 'Saldo pendiente después de esta entrega', valor: dinero(Math.max(0, saldoDespues)), destacado: true },
    ],
    notas: liquidacion.notas ? [liquidacion.notas] : [],
    firmas: [
      { etiqueta: 'Entregué', nombre: entrega },
      { etiqueta: 'Recibí conforme', nombre, identificacion },
    ],
  };
}

function nombreDe(persona: ResponsableGasto, beneficiarios: Beneficiario[]): string {
  return persona.tipo === 'BENEFICIARIO'
    ? beneficiarios.find((b) => b.id === persona.beneficiarioId)?.nombreCompleto ?? 'Beneficiario'
    : persona.nombre;
}

// ---------------------------------------------------------------------------
// Estado de cuenta de beneficiarios (reporte imprimible de Beneficiarios y Repartos)
// ---------------------------------------------------------------------------

export interface FilaSaldoEstadoCuenta {
  nombre: string;
  tipo: 'Beneficiario' | 'Responsable de gastos';
  participacion?: number;
  repartido: number;
  reembolsos: number;
  entregado: number;
  pendiente: number;
}

export interface EstadoCuentaBeneficiarios {
  titulo: string;
  emisor: DocumentoRecibo['emisor'];
  lugarYFecha: string;
  /** Saldos por lote vendido: cada venta por separado para no mezclar el dinero de una con el de otra. */
  ventas: {
    lote: string;
    comprador?: string;
    filas: FilaSaldoEstadoCuenta[];
    totales: { cobrado: number; repartido: number; reembolsos: number; entregado: number; pendiente: number };
  }[];
  totales: { cobrado: number; repartido: number; reembolsos: number; entregado: number; pendiente: number };
  repartos: { fecha: string; lote: string; cobro: string; cobrado: number; reembolsos: number; neto: number; anulado: boolean }[];
  entregas: { folio: string; fecha: string; lote: string; destinatario: string; metodo: string; monto: number }[];
  notas: string[];
  firmas: DocumentoRecibo['firmas'];
}

export interface DatosEstadoCuenta {
  proyecto: Proyecto;
  /** Fecha del reporte (YYYY-MM-DD). */
  fecha: string;
  ventas: SaldosDeVenta[];
  beneficiarios: Beneficiario[];
  distribuciones: DistribucionCobro[];
  liquidaciones: Liquidacion[];
  lotes: Lote[];
  /** Para nombrar al comprador de cada venta. */
  contratos?: ContratoPromesa[];
  clientes?: Cliente[];
}

export function construirEstadoCuentaBeneficiarios({
  proyecto,
  fecha,
  ventas,
  beneficiarios,
  distribuciones,
  liquidaciones,
  lotes,
  contratos = [],
  clientes = [],
}: DatosEstadoCuenta): EstadoCuentaBeneficiarios {
  const centavos = (n: number) => Math.round(n * 100);
  const sumar = (valores: number[]) => valores.reduce((a, v) => a + centavos(v), 0) / 100;
  const porFecha = <T extends { fecha: string; createdAt: string }>(a: T, b: T) =>
    a.fecha.localeCompare(b.fecha) || a.createdAt.localeCompare(b.createdAt);
  const loteDe = new Map(lotes.map((l) => [l.id, l.codigoLote]));
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombreCompleto]));

  const ventasDoc = ventas.map((v) => {
    const filas = v.saldos.map((s) => {
      const persona = s.persona;
      const beneficiario = persona.tipo === 'BENEFICIARIO' ? beneficiarios.find((b) => b.id === persona.beneficiarioId) : undefined;
      return {
        nombre: s.nombre,
        tipo: persona.tipo === 'BENEFICIARIO' ? ('Beneficiario' as const) : ('Responsable de gastos' as const),
        participacion: beneficiario?.porcentaje,
        repartido: s.repartido,
        reembolsos: s.reembolsos,
        entregado: s.entregado,
        pendiente: s.pendiente,
      };
    });
    const contrato = contratos.find((c) => c.id === v.contratoId);
    const cobrado = sumar(distribuciones.filter((d) => d.contratoId === v.contratoId && !d.anulada).map((d) => d.montoCobrado));
    return {
      lote: loteDe.get(v.loteId) ?? 'Lote eliminado',
      comprador: contrato ? nombreCliente.get(contrato.compradorId) : undefined,
      filas,
      totales: { cobrado, repartido: v.repartido, reembolsos: v.reembolsos, entregado: v.entregado, pendiente: v.pendiente },
    };
  });
  const repartos = [...distribuciones].sort(porFecha).map((d) => ({
    fecha: d.fecha,
    lote: loteDe.get(d.loteId) ?? '—',
    cobro: d.origen === 'PRIMA' ? 'Prima' : 'Cuota',
    cobrado: d.montoCobrado,
    reembolsos: sumar(d.reembolsos.map((r) => r.monto)),
    neto: d.neto,
    anulado: !!d.anulada,
  }));
  const vigentes = repartos.filter((r) => !r.anulado);

  const entregas = [...liquidaciones].sort(porFecha).map((l) => ({
    folio: l.folio ?? l.id,
    fecha: l.fecha,
    lote: l.loteId ? loteDe.get(l.loteId) ?? '—' : '—',
    destinatario: nombreDe(l.destinatario, beneficiarios),
    metodo: formaDePago(l.metodo, l.referencia),
    monto: l.monto,
  }));

  const notas = [
    'Los saldos se llevan por lote vendido: cada venta reparte sus propios cobros y sus entregas salen de ella.',
    'Saldo pendiente = participación repartida + reembolsos de gastos − dinero entregado.',
  ];
  if (liquidaciones.some((l) => !l.contratoId)) {
    notas.push('Las entregas registradas sin lote se aplicaron a las ventas más antiguas de cada persona con saldo.');
  }
  if (repartos.some((r) => r.anulado)) notas.push('Los cobros anulados se muestran tachados y no cuentan en los saldos.');

  return {
    titulo: 'ESTADO DE CUENTA DE BENEFICIARIOS',
    emisor: emisorDe(proyecto),
    lugarYFecha: `${lugar(proyecto)}${fechaLarga(fecha)}`,
    ventas: ventasDoc,
    totales: {
      cobrado: sumar(vigentes.map((r) => r.cobrado)),
      repartido: sumar(ventasDoc.map((v) => v.totales.repartido)),
      reembolsos: sumar(ventasDoc.map((v) => v.totales.reembolsos)),
      entregado: sumar(ventasDoc.map((v) => v.totales.entregado)),
      pendiente: sumar(ventasDoc.map((v) => v.totales.pendiente)),
    },
    repartos,
    entregas,
    notas,
    firmas: [
      {
        etiqueta: 'Elaborado por',
        nombre: proyecto.tipoPropietario === 'SUCESION' && proyecto.representante ? proyecto.representante : proyecto.nombre,
      },
    ],
  };
}
