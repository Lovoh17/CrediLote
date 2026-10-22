import { describe, it, expect } from 'vitest';
import { construirReciboDePago, construirComprobanteDeEntrega, fechaLarga } from './documentos';
import { generarTablaAmortizacion } from '@/modules/finance/engine/amortization';
import { ContratoPromesa, Proyecto, ReciboPago, Beneficiario, DistribucionCobro, GastoVenta, Liquidacion } from '@/shared/types';

// Datos ficticios
const proyecto: Proyecto = {
  id: 'p',
  nombre: 'Sucesión de Prueba',
  ubicacion: 'El Carmen, La Unión Sur',
  centroMapa: { lat: 13.3, lng: -88 },
  zoomDefault: 17,
  moneda: 'USD',
  tipoPropietario: 'SUCESION',
  representante: 'Representante Ficticio',
  createdAt: '',
};
const contrato: ContratoPromesa = {
  id: 'k',
  loteId: 'l',
  compradorId: 'c',
  vendedorNombre: 'Vendedor',
  fechaFirma: '2026-09-24',
  precioPactado: 14000,
  primaEntregada: 5000,
  saldoFinanciado: 9000,
  plazoMeses: 8,
  tasaInteresAnual: 0,
  sistemaAmortizacion: 'DIRECTO_SIN_INTERES',
  diaCortePago: 24,
  createdAt: '',
};
const cuotas = generarTablaAmortizacion({
  precioTotal: 14000, prima: 5000, plazoMeses: 8, tasaInteresAnual: 0, sistema: 'DIRECTO_SIN_INTERES',
  fechaInicio: '2026-09-24', diaCortePago: 24, contratoId: 'k',
});
const cliente = { id: 'c', nombreCompleto: 'Comprador Ficticio', dniIdentificacion: '04512378-8', telefono: '', createdAt: '' };
const lote = { id: 'l', proyectoId: 'p', codigoLote: 'Porción 1320 m²', bloqueManzana: 'Polígono Único', areaM2: 1320, precioLista: 14000, estado: 'VENDIDO' as const, verticesPoligono: [] };

describe('fechaLarga', () => {
  it('formato largo sin zona horaria', () => {
    expect(fechaLarga('2026-09-30')).toBe('30 de septiembre de 2026');
    expect(fechaLarga('2027-01-01')).toBe('1 de enero de 2027');
  });
});

describe('recibo de prima', () => {
  const recibo: ReciboPago = {
    id: 'r1', folio: 'SDP-2026-0001', concepto: 'PRIMA', contratoId: 'k', clienteId: 'c', montoPagado: 5000,
    metodoPago: 'DEPOSITO', fechaPago: '2026-09-24', saldoPendienteDespues: 9000,
  };
  const doc = construirReciboDePago({ recibo, contrato, cliente, lote, proyecto, cuotas });

  it('título, monto en letras, lugar y fecha', () => {
    expect(doc.titulo).toBe('RECIBO DE PRIMA');
    expect(doc.cantidadEnLetras).toBe('CINCO MIL 00/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA');
    expect(doc.lugarYFecha).toBe('El Carmen, La Unión Sur, 24 de septiembre de 2026');
  });
  it('concepto con lote, proyecto y fecha de firma', () => {
    expect(doc.cuerpo.concepto).toBe(
      'prima (anticipo) de la promesa de venta del lote Porción 1320 m², Polígono Único del proyecto Sucesión de Prueba, firmada el 24 de septiembre de 2026'
    );
    expect(doc.cuerpo.identificacion).toBe('DUI 04512378-8');
  });
  it('detalle con saldo financiado y firmas', () => {
    expect(doc.detalle.find((d) => d.etiqueta === 'Saldo financiado')?.valor).toBe('$ 9,000.00 en 8 cuotas');
    expect(doc.firmas.map((f) => f.nombre)).toEqual(['Representante Ficticio', 'Comprador Ficticio']);
  });
});

describe('recibo de cuotas', () => {
  it('pago que cubre una cuota completa y abona a la siguiente', () => {
    const recibo: ReciboPago = {
      id: 'r2', folio: 'SDP-2026-0002', concepto: 'CUOTA', contratoId: 'k', clienteId: 'c', montoPagado: 1500,
      metodoPago: 'TRANSFERENCIA', referenciaBancaria: 'TR-123', fechaPago: '2026-10-24',
      aplicaciones: [
        { cuotaId: cuotas[0].id, monto: 1125, interes: 0, capital: 1125, quedoPagada: true },
        { cuotaId: cuotas[1].id, monto: 375, interes: 0, capital: 375, quedoPagada: false },
      ],
      saldoPendienteDespues: 7500,
    };
    const doc = construirReciboDePago({ recibo, contrato, cliente, lote, proyecto, cuotas });
    expect(doc.titulo).toBe('RECIBO DE PAGO');
    expect(doc.cuerpo.concepto).toBe('abono de las cuotas 1 y 2 de 8 del lote Porción 1320 m², Polígono Único del proyecto Sucesión de Prueba');
    expect(doc.cantidadEnLetras).toBe('UN MIL QUINIENTOS 00/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA');
    expect(doc.tabla?.filas.map((f) => [f[0], f[5]])).toEqual([['1 de 8', 'Pagada'], ['2 de 8', 'Abono parcial']]);
    expect(doc.detalle.find((d) => d.etiqueta === 'Forma de pago')?.valor).toBe('Transferencia bancaria (ref. TR-123)');
    expect(doc.detalle.find((d) => d.destacado)?.valor).toBe('$ 7,500.00');
  });

  it('marca el recibo anulado', () => {
    const recibo: ReciboPago = {
      id: 'r3', folio: 'SDP-2026-0003', concepto: 'CUOTA', contratoId: 'k', clienteId: 'c', montoPagado: 1125,
      fechaPago: '2026-11-24', anulado: true, motivoAnulacion: 'Monto equivocado', fechaAnulacion: '2026-11-25',
      aplicaciones: [{ cuotaId: cuotas[2].id, monto: 1125, quedoPagada: true }],
    };
    const doc = construirReciboDePago({ recibo, contrato, cliente, lote, proyecto, cuotas });
    expect(doc.anulado).toEqual({ motivo: 'Monto equivocado', fecha: '25 de noviembre de 2026' });
    expect(doc.cuerpo.concepto.startsWith('pago a la cuota 3 de 8')).toBe(true);
  });
});

describe('comprobante de entrega', () => {
  const beneficiarios: Beneficiario[] = [
    { id: 'b1', proyectoId: 'p', nombreCompleto: 'Beneficiario Uno', dui: '04512378-8', porcentaje: 100 / 7, activo: true, orden: 0, createdAt: '' },
  ];
  const gastos: GastoVenta[] = [
    { id: 'g', proyectoId: 'p', contratoId: 'k', loteId: 'l', categoria: 'GESTION_VENTA', descripcion: '', monto: 600, fecha: '2026-09-24', aCargoDe: 'SUCESION', responsable: { tipo: 'BENEFICIARIO', beneficiarioId: 'b1' }, createdAt: '2026-09-24T10:00:00Z' },
  ];
  const distribuciones: DistribucionCobro[] = [
    { id: 'd', proyectoId: 'p', contratoId: 'k', loteId: 'l', origen: 'PRIMA', fecha: '2026-09-24', montoCobrado: 5000, reembolsos: [{ gastoId: 'g', monto: 600 }], neto: 4400, partes: [{ beneficiarioId: 'b1', monto: 628.57 }], createdAt: '2026-09-24T11:00:00Z' },
  ];
  const previa: Liquidacion = { id: 'l1', folio: 'SDP-ENT-2026-0001', proyectoId: 'p', destinatario: { tipo: 'BENEFICIARIO', beneficiarioId: 'b1' }, monto: 600, fecha: '2026-09-25', metodo: 'EFECTIVO', createdAt: '2026-09-25T09:00:00Z' };
  const actual: Liquidacion = { id: 'l2', folio: 'SDP-ENT-2026-0002', proyectoId: 'p', destinatario: { tipo: 'BENEFICIARIO', beneficiarioId: 'b1' }, monto: 500, fecha: '2026-09-30', metodo: 'TRANSFERENCIA', referencia: 'TR-9', createdAt: '2026-09-30T09:00:00Z' };

  const doc = construirComprobanteDeEntrega({ liquidacion: actual, proyecto, beneficiarios, gastos, distribuciones, liquidaciones: [previa, actual] });

  it('concepto con participación y reembolso, y monto en letras', () => {
    expect(doc.titulo).toBe('COMPROBANTE DE ENTREGA DE FONDOS');
    expect(doc.cuerpo.concepto).toBe('participación (14.2857 %) en los cobros de las ventas del proyecto Sucesión de Prueba y reembolso de gastos de venta adelantados');
    expect(doc.cantidadEnLetras).toBe('QUINIENTOS 00/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA');
  });

  it('saldos: acumulado, entregado antes y pendiente después', () => {
    const valor = (e: string) => doc.detalle.find((d) => d.etiqueta === e)?.valor;
    expect(valor('Participación acumulada')).toBe('$ 628.57');
    expect(valor('Reembolsos de gastos acumulados')).toBe('$ 600.00');
    expect(valor('Entregado anteriormente')).toBe('$ 600.00');
    expect(valor('Saldo pendiente después de esta entrega')).toBe('$ 128.57');
    expect(doc.firmas[1]).toEqual({ etiqueta: 'Recibí conforme', nombre: 'Beneficiario Uno', identificacion: 'DUI 04512378-8' });
  });
});
