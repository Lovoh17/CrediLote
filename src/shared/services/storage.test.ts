/**
 * Pruebas de integración de los procesos (plan 04.3, fase 8.8) contra el StorageService real,
 * con un localStorage en memoria. Todos los datos son ficticios.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Beneficiario, ContratoPromesa, Cliente, Lote } from '@/shared/types';
import type { DatosPromesaVenta } from './storage';
import { porcentajesIguales } from '@/modules/beneficiarios/engine/reparto';
import { calcularPoligonal } from '@/shared/utils/geoElSalvador';

class MemoriaStorage {
  private datos = new Map<string, string>();
  getItem(k: string) {
    return this.datos.has(k) ? this.datos.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.datos.set(k, v);
  }
  removeItem(k: string) {
    this.datos.delete(k);
  }
  clear() {
    this.datos.clear();
  }
}

type Storage = (typeof import('./storage'))['storage'];

async function nuevoStorage(estadoInicial?: unknown): Promise<Storage> {
  vi.resetModules();
  const mem = new MemoriaStorage();
  if (estadoInicial) mem.setItem('credilote_skeleton_v1', JSON.stringify(estadoInicial));
  (globalThis as unknown as { localStorage: MemoriaStorage }).localStorage = mem;
  return (await import('./storage')).storage;
}

const PROYECTO = 'p-1';

function configurarSucesion(s: Storage) {
  s.addProyecto({
    id: PROYECTO,
    nombre: 'Sucesión de Prueba',
    ubicacion: 'El Carmen, La Unión Sur',
    centroMapa: { lat: 13.3, lng: -88 },
    zoomDefault: 17,
    moneda: 'USD',
    tipoPropietario: 'SUCESION',
    representante: 'Representante Ficticio',
    createdAt: '2026-09-01',
  });
  const pct = porcentajesIguales(7);
  const beneficiarios: Beneficiario[] = pct.map((porcentaje, i) => ({
    id: `b${i + 1}`,
    proyectoId: PROYECTO,
    nombreCompleto: `Beneficiario ${i + 1}`,
    porcentaje,
    activo: true,
    orden: i,
    createdAt: '',
  }));
  expect(s.guardarBeneficiarios(PROYECTO, beneficiarios).ok).toBe(true);
}

type OpcionesVenta = { codigo?: string; negociacionId?: string; gastos?: boolean };

function datosVenta(opciones: OpcionesVenta = {}): DatosPromesaVenta {
  const id = `k-${Math.random().toString(36).slice(2, 6)}`;
  const loteId = `l-${id}`;
  const contrato: ContratoPromesa = {
    id,
    loteId,
    compradorId: `c-${id}`,
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
  const cliente: Cliente = { id: `c-${id}`, nombreCompleto: 'Comprador Ficticio', dniIdentificacion: '04512378-8', telefono: '', createdAt: '' };
  const lote: Lote = {
    id: loteId,
    proyectoId: PROYECTO,
    codigoLote: opciones.codigo ?? `L-${id}`,
    bloqueManzana: 'A',
    areaM2: 1320,
    precioLista: 14000,
    estado: 'VENDIDO',
    verticesPoligono: [],
  };
  return {
    contrato,
    cliente,
    loteModificado: lote,
    negociacionId: opciones.negociacionId,
    pagoPrima: { metodo: 'DEPOSITO', referencia: 'DEP-1' },
    gastos: opciones.gastos
      ? [
          { categoria: 'GESTION_VENTA', descripcion: 'Comisión', monto: 600, fecha: '2026-09-24', aCargoDe: 'SUCESION', responsable: { tipo: 'BENEFICIARIO', beneficiarioId: 'b1' } },
          { categoria: 'HONORARIOS_ABOGADO', descripcion: 'Promesa', monto: 400, fecha: '2026-09-24', aCargoDe: 'SUCESION', responsable: { tipo: 'EXTERNO', nombre: '  Abogado   Ficticio ' } },
        ]
      : undefined,
  };
}

function registrarVenta(s: Storage, opciones: OpcionesVenta = {}) {
  const datos = datosVenta(opciones);
  const resultado = s.registrarPromesaVenta(datos);
  expect(resultado).toMatchObject({ ok: true, valor: { id: datos.contrato.id } });
  return datos.contrato.id;
}

const pagar = (s: Storage, contratoId: string, monto: number, fecha = '2026-10-24') =>
  s.registrarPagoCuota({ cuotaId: s.getCuotasByContratoId(contratoId)[0].id, monto, metodo: 'TRANSFERENCIA', fechaPago: fecha });

let s: Storage;
beforeEach(async () => {
  s = await nuevoStorage();
  configurarSucesion(s);
});

describe('registro de la promesa: recibo de prima, gastos y reparto', () => {
  it('emite el recibo de prima con folio del proyecto y lo reparte tras reembolsar los gastos', () => {
    const k = registrarVenta(s, { gastos: true });
    const [recibo] = s.getRecibos();
    expect(recibo).toMatchObject({ folio: 'SP-2026-0001', concepto: 'PRIMA', montoPagado: 5000, metodoPago: 'DEPOSITO', saldoPendienteDespues: 9000 });

    const [reparto] = s.getDistribuciones();
    expect(reparto.reciboId).toBe(recibo.id);
    expect(reparto.reembolsos.map((r) => r.monto)).toEqual([600, 400]);
    expect(reparto.neto).toBe(4000);
    expect(s.getGastos().find((g) => g.responsable.tipo === 'EXTERNO')?.responsable).toEqual({ tipo: 'EXTERNO', nombre: 'Abogado Ficticio' });
    expect(s.getCobrosSinRepartir()).toEqual([]);
    expect(s.getSaldoPendienteContrato(k)).toBe(9000);

    const doc = s.getDocumentoRecibo(recibo.id)!;
    expect(doc.titulo).toBe('RECIBO DE PRIMA');
    expect(doc.cantidadEnLetras).toBe('CINCO MIL 00/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA');
  });
});

describe('cobro de cuotas: parcial, varias cuotas, exceso y anulación', () => {
  it('abono parcial y luego pago que completa una cuota y cubre la siguiente', () => {
    const k = registrarVenta(s);
    expect(pagar(s, k, 500).ok).toBe(true);
    let [c1, c2] = s.getCuotasByContratoId(k);
    expect(c1).toMatchObject({ estado: 'ABONO_PARCIAL', montoPagado: 500 });
    expect(s.getPendienteDeCuota(c1.id)).toBe(625);

    const r = pagar(s, k, 1750);
    expect(r.ok).toBe(true);
    [c1, c2] = s.getCuotasByContratoId(k);
    expect([c1.estado, c2.estado]).toEqual(['PAGADO', 'PAGADO']);
    expect(r.valor).toMatchObject({ folio: 'SP-2026-0003', saldoPendienteDespues: 6750 });
    expect(r.valor!.aplicaciones!.map((a) => [a.monto, a.quedoPagada])).toEqual([[625, true], [1125, true]]);
    expect(s.getDocumentoRecibo(r.valor!.id)!.cuerpo.concepto).toMatch(/^pago de las cuotas 1 y 2 de 8/);
    expect(s.getResumenCobranza()).toMatchObject({ primasCobradas: 5000, cuotasCobradas: 2250, recibosDeCuotas: 2 });
  });

  it('rechaza un pago mayor que todo lo pendiente', () => {
    const k = registrarVenta(s);
    const r = pagar(s, k, 9000.01);
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/supera el saldo pendiente/);
  });

  it('anula solo el último cobro, revierte las cuotas y su reparto', () => {
    const k = registrarVenta(s);
    const primero = pagar(s, k, 1125).valor!;
    const segundo = pagar(s, k, 1500).valor!;

    expect(s.anularRecibo(primero.id, 'error').ok).toBe(false);
    expect(s.anularRecibo(segundo.id, '').ok).toBe(false);
    expect(s.anularRecibo(s.getRecibos().find((r) => r.concepto === 'PRIMA')!.id, 'x').ok).toBe(false);

    const antes = s.getSaldosPorPersona().find((x) => x.clave === 'B:b1')!.repartido;
    expect(s.anularRecibo(segundo.id, 'Monto equivocado').ok).toBe(true);
    const [c1, c2, c3] = s.getCuotasByContratoId(k);
    expect([c1.estado, c2.estado, c3.estado]).toEqual(['PAGADO', 'PENDIENTE', 'PENDIENTE']);
    expect(s.getSaldoPendienteContrato(k)).toBe(7875);
    expect(s.getDistribuciones().find((d) => d.reciboId === segundo.id)?.anulada).toBe(true);
    expect(s.getSaldosPorPersona().find((x) => x.clave === 'B:b1')!.repartido).toBeLessThan(antes);
    expect(s.getResumenCobranza()).toMatchObject({ cuotasCobradas: 1125, recibosAnulados: 1 });
    expect(s.getDocumentoRecibo(segundo.id)!.anulado?.motivo).toBe('Monto equivocado');
  });
});

describe('entregas a beneficiarios', () => {
  it('no permite entregar más de lo pendiente y entrega a todos con folio propio', () => {
    registrarVenta(s, { gastos: true });
    const b1 = s.getSaldosPorPersona().find((x) => x.clave === 'B:b1')!;
    expect(b1.pendiente).toBe(1171.43);

    const exceso = s.addLiquidacion({ proyectoId: PROYECTO, destinatario: b1.persona, monto: 1171.44, fecha: '2026-09-30', metodo: 'EFECTIVO' });
    expect(exceso.ok).toBe(false);

    const todos = s.registrarEntregasATodos({ fecha: '2026-09-30', metodo: 'TRANSFERENCIA' });
    expect(todos.ok).toBe(true);
    expect(todos.valor).toHaveLength(8); // 7 beneficiarios + el abogado externo
    expect(todos.valor![0].folio).toBe('SP-ENT-2026-0001');
    expect(s.getSaldosPorPersona().every((x) => x.pendiente === 0)).toBe(true);
    expect(s.registrarEntregasATodos({ fecha: '2026-09-30', metodo: 'EFECTIVO' }).ok).toBe(false);

    const doc = s.getDocumentoEntrega(todos.valor![0].id)!;
    expect(doc.titulo).toBe('COMPROBANTE DE ENTREGA DE FONDOS');
    expect(doc.detalle.find((d) => d.destacado)?.valor).toBe('$ 0.00');
  });
});

describe('beneficiarios y gastos: validaciones', () => {
  it('rechaza DUI duplicados y no elimina a quien tiene movimientos', () => {
    const lista = s.getBeneficiarios();
    const dup = lista.map((b, i) => (i < 2 ? { ...b, dui: '04512378-8' } : b));
    expect(s.guardarBeneficiarios(PROYECTO, dup).mensaje).toMatch(/mismo DUI/);

    registrarVenta(s);
    const sinElPrimero = lista.slice(1).map((b) => ({ ...b, porcentaje: 100 / 6 }));
    expect(s.guardarBeneficiarios(PROYECTO, sinElPrimero).mensaje).toMatch(/Desactívelo/);
  });

  it('corrige un gasto no reembolsado y bloquea uno ya reembolsado', () => {
    const k = registrarVenta(s, { gastos: true });
    const reembolsado = s.getGastos()[0];
    expect(s.actualizarGasto(reembolsado.id, { monto: 1 }).ok).toBe(false);

    const nuevo = s.addGasto({ contratoId: k, categoria: 'OTROS', descripcion: '', monto: 50, fecha: '2026-10-01', aCargoDe: 'SUCESION', responsable: { tipo: 'BENEFICIARIO', beneficiarioId: 'b2' } })!;
    expect(s.actualizarGasto(nuevo.id, { monto: 75 }).ok).toBe(true);
    expect(s.actualizarGasto(nuevo.id, { monto: 0 }).mensaje).toMatch(/mayor que cero/);
    expect(s.addGasto({ contratoId: k, categoria: 'OTROS', descripcion: '', monto: 10, fecha: '2026-10-01', aCargoDe: 'SUCESION', responsable: { tipo: 'BENEFICIARIO', beneficiarioId: 'no-existe' } })).toBeNull();
  });
});

describe('negociaciones', () => {
  it('una negociación cancelada no se convierte: la promesa se rechaza', () => {
    const n = s.crearNegociacion({ interesadoNombre: 'Interesado Ficticio', responsable: { tipo: 'BENEFICIARIO', beneficiarioId: 'b1' } })!;
    s.cancelarNegociacion(n.id, 'RESPONSABLE');
    const r = s.registrarPromesaVenta(datosVenta({ negociacionId: n.id }));
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/convertida en venta o cancelada/) });
    expect(s.getNegociacionById(n.id)?.estado).toBe('CANCELADA');
    expect(s.getContratos()).toHaveLength(0);
  });

  it('una negociación en espera se convierte y sus gastos pasan a la venta', () => {
    const n = s.crearNegociacion({ interesadoNombre: 'Interesado Ficticio', responsable: { tipo: 'BENEFICIARIO', beneficiarioId: 'b1' } })!;
    s.addGastoNegociacion(n.id, { categoria: 'COMBUSTIBLE', descripcion: 'Viaje', monto: 50, fecha: '2026-09-20', aCargoDe: 'SUCESION', responsable: { tipo: 'BENEFICIARIO', beneficiarioId: 'b1' } });
    s.completarNegociacion(n.id);
    const k = registrarVenta(s, { negociacionId: n.id });
    expect(s.getNegociacionById(n.id)).toMatchObject({ estado: 'CONVERTIDA', contratoId: k });
    expect(s.getGastosDeNegociacion(n.id).every((g) => g.contratoId === k)).toBe(true);
  });
});

describe('registro de la promesa: validaciones (no se guarda una venta incompleta)', () => {
  const sinCambios = () => {
    expect(s.getContratos()).toHaveLength(0);
    expect(s.getLotes()).toHaveLength(0);
    expect(s.getCuotasPendientes()).toHaveLength(0);
    expect(s.getRecibos()).toHaveLength(0);
  };

  it('rechaza una venta de $0 (documento sin precio) sin guardar nada', () => {
    const datos = datosVenta();
    datos.contrato.precioPactado = 0;
    datos.contrato.primaEntregada = 0;
    expect(s.registrarPromesaVenta(datos)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/precio de venta debe ser mayor que cero/) });
    sinCambios();
  });

  it('rechaza una prima mayor que el precio, un plazo inválido o un día de pago fuera de rango', () => {
    const prima = datosVenta();
    prima.contrato.primaEntregada = 15000;
    expect(s.registrarPromesaVenta(prima).mensaje).toMatch(/prima no puede ser mayor/);

    const plazo = datosVenta();
    plazo.contrato.plazoMeses = 0;
    expect(s.registrarPromesaVenta(plazo).mensaje).toMatch(/plazo/);

    const dia = datosVenta();
    dia.contrato.diaCortePago = 32;
    expect(s.registrarPromesaVenta(dia).mensaje).toMatch(/día de pago/);
    sinCambios();
  });

  it('permite una venta pagada completa con la prima (sin cuotas)', () => {
    const datos = datosVenta();
    datos.contrato.primaEntregada = datos.contrato.precioPactado;
    datos.contrato.plazoMeses = 0;
    expect(s.registrarPromesaVenta(datos).ok).toBe(true);
    expect(s.getSaldoPendienteContrato(datos.contrato.id)).toBe(0);
  });

  it('no vende dos veces el mismo lote', () => {
    registrarVenta(s, { codigo: 'L-07' });
    const segunda = datosVenta({ codigo: 'L-07' });
    expect(s.registrarPromesaVenta(segunda)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/L-07 ya tiene una promesa/) });
    expect(s.getContratos()).toHaveLength(1);
  });

  it('rechaza un gasto inválido en lugar de descartarlo en silencio', () => {
    const datos = datosVenta({ gastos: true });
    datos.gastos![0].monto = 0;
    expect(s.registrarPromesaVenta(datos)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Comisión.*mayor que cero/) });
    sinCambios();
  });
});

describe('migración al cargar', () => {
  it('emite el recibo de prima de ventas registradas antes de que existiera', async () => {
    const k = registrarVenta(s);
    const guardado = JSON.parse(globalThis.localStorage.getItem('credilote_skeleton_v1')!);
    guardado.recibos = []; // como una instalación antigua
    guardado.contadoresFolio = {};
    const recargado = await nuevoStorage(guardado);
    const recibos = recargado.getRecibos(PROYECTO);
    expect(recibos).toHaveLength(1);
    expect(recibos[0]).toMatchObject({ concepto: 'PRIMA', contratoId: k, folio: 'SP-2026-0001' });
    expect(recargado.getDistribuciones(PROYECTO)[0].reciboId).toBe(recibos[0].id);
  });
});

describe('descripción técnica: lotes con rumbos y distancias pero sin coordenadas', () => {
  // Rectángulo ficticio de 17 × 20 m (340 m²), sin punto de partida
  const TRAMOS = [
    { inicio: 'N' as const, grados: 0, minutos: 0, segundos: 0, fin: 'E' as const, distancia: 17 },
    { inicio: 'N' as const, grados: 90, minutos: 0, segundos: 0, fin: 'E' as const, distancia: 20 },
    { inicio: 'S' as const, grados: 0, minutos: 0, segundos: 0, fin: 'E' as const, distancia: 17 },
    { inicio: 'S' as const, grados: 90, minutos: 0, segundos: 0, fin: 'W' as const, distancia: 20 },
  ];
  const SAN_SALVADOR = { lat: 13.6929, lng: -89.2182 }; // centro por defecto de un proyecto nuevo
  const EL_CARMEN = { lat: 13.35, lng: -87.98 }; // aproximado, ficticio para la prueba

  function registrarSinCoordenadas() {
    const datos = datosVenta({ codigo: 'PORCIÓN 1' });
    datos.loteModificado.areaM2 = 340;
    datos.loteModificado.descripcionTecnica = { tramos: TRAMOS, referenciaPartida: ' vértice Nor Poniente ' };
    expect(s.registrarPromesaVenta(datos).ok).toBe(true);
    return datos.loteModificado.id;
  }

  it('guarda los tramos aunque no haya punto de partida; el lote queda sin polígono y "sin ubicar"', () => {
    const loteId = registrarSinCoordenadas();
    const lote = s.getLoteById(loteId)!;
    expect(lote.verticesPoligono).toEqual([]);
    expect(lote.descripcionTecnica).toMatchObject({ tramos: TRAMOS, referenciaPartida: 'vértice Nor Poniente' });
    expect(s.getLotesSinUbicar(PROYECTO).map((l) => l.id)).toEqual([loteId]);
  });

  it('al marcar el punto de partida en el mapa dibuja el polígono y centra el proyecto si estaba lejos', () => {
    s.updateProyecto({ ...s.getActiveProyecto()!, centroMapa: SAN_SALVADOR });
    const loteId = registrarSinCoordenadas();
    const r = s.ubicarLote(loteId, EL_CARMEN);
    expect(r.ok).toBe(true);
    expect(r.valor!.errorCierreM).toBeLessThan(0.001);
    expect(r.valor!.areaM2).toBeCloseTo(340, 0);

    const lote = s.getLoteById(loteId)!;
    expect(lote.verticesPoligono).toHaveLength(4);
    expect(lote.verticesPoligono[0]).toEqual(EL_CARMEN);
    expect(lote.descripcionTecnica).toMatchObject({ origen: EL_CARMEN, ubicadoPor: 'MAPA' });
    expect(s.getLotesSinUbicar(PROYECTO)).toEqual([]);
    const centro = s.getActiveProyecto()!.centroMapa;
    expect(Math.abs(centro.lat - EL_CARMEN.lat)).toBeLessThan(0.001);
    expect(Math.abs(centro.lng - EL_CARMEN.lng)).toBeLessThan(0.001);
  });

  it('no mueve el centro del proyecto si ya está cerca de sus lotes', () => {
    const antes = s.getActiveProyecto()!.centroMapa; // 13.3, -88 (a ~6 km)
    s.ubicarLote(registrarSinCoordenadas(), EL_CARMEN);
    expect(s.getActiveProyecto()!.centroMapa).toEqual(antes);
  });

  it('también se ubica con la coordenada Lambert del plano', () => {
    const loteId = registrarSinCoordenadas();
    const r = s.ubicarLote(loteId, { norte: 250120.5, este: 580340.25 });
    expect(r.ok).toBe(true);
    expect(s.getLoteById(loteId)!.descripcionTecnica).toMatchObject({ ubicadoPor: 'LAMBERT', puntoPartida: { norte: 250120.5, este: 580340.25 } });
  });

  it('rechaza un punto fuera de El Salvador, una coordenada Lambert inválida y un lote sin tramos', () => {
    const loteId = registrarSinCoordenadas();
    expect(s.ubicarLote(loteId, { lat: 14.1, lng: -87.2 }).mensaje).toMatch(/fuera de El Salvador/);
    expect(s.ubicarLote(loteId, { norte: 10, este: 20 }).mensaje).toMatch(/Lambert no es válida/);
    const sinTramos = registrarVenta(s);
    expect(s.ubicarLote(s.getContratos().find((c) => c.id === sinTramos)!.loteId, EL_CARMEN).mensaje).toMatch(/no tiene guardados los tramos/);
    expect(s.getLoteById(loteId)!.verticesPoligono).toEqual([]);
  });

  it('corregir los tramos de un lote ya ubicado redibuja el polígono desde el mismo punto', () => {
    const loteId = registrarSinCoordenadas();
    s.ubicarLote(loteId, EL_CARMEN);
    const triangulo = TRAMOS.slice(0, 2).concat({ inicio: 'S', grados: 49, minutos: 38, segundos: 0, fin: 'W', distancia: 26.25 });
    expect(s.guardarDescripcionTecnica(loteId, { tramos: triangulo }).ok).toBe(true);
    const lote = s.getLoteById(loteId)!;
    expect(lote.verticesPoligono).toHaveLength(3);
    expect(lote.verticesPoligono[0]).toEqual(EL_CARMEN);
  });

  it('si el polígono viene calculado desde la primera latitud/longitud del documento, ese vértice es el punto de partida', () => {
    const datos = datosVenta({ codigo: 'PORCIÓN 2' });
    datos.loteModificado.areaM2 = 340;
    datos.loteModificado.descripcionTecnica = { tramos: TRAMOS };
    datos.loteModificado.verticesPoligono = calcularPoligonal(EL_CARMEN, TRAMOS).vertices;
    expect(s.registrarPromesaVenta(datos).ok).toBe(true);
    expect(s.getLoteById(datos.loteModificado.id)!.descripcionTecnica).toMatchObject({ origen: EL_CARMEN, ubicadoPor: 'DOCUMENTO' });

    // Al corregir los tramos se redibuja desde ese mismo primer punto
    const triangulo = TRAMOS.slice(0, 2).concat({ inicio: 'S', grados: 49, minutos: 38, segundos: 0, fin: 'W', distancia: 26.25 });
    expect(s.guardarDescripcionTecnica(datos.loteModificado.id, { tramos: triangulo }).ok).toBe(true);
    expect(s.getLoteById(datos.loteModificado.id)!.verticesPoligono[0]).toEqual(EL_CARMEN);
  });

  it('rechaza la promesa si un tramo no es válido', () => {
    const datos = datosVenta();
    datos.loteModificado.descripcionTecnica = { tramos: [{ ...TRAMOS[0], grados: 95 }, ...TRAMOS.slice(1)] };
    expect(s.registrarPromesaVenta(datos).mensaje).toMatch(/tramo 1 de la descripción técnica no es válido/);
  });
});

describe('promesas duplicadas', () => {
  it('reconoce el lote aunque el código venga con otras mayúsculas, tildes o espacios', () => {
    registrarVenta(s, { codigo: 'PORCIÓN UNO' });
    const r = s.registrarPromesaVenta(datosVenta({ codigo: '  Porcion   uno ' }));
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/PORCIÓN UNO ya tiene una promesa/) });
    expect(s.getContratos()).toHaveLength(1);
  });

  it('rechaza la misma promesa con otro código de lote (mismo comprador, precio y área)', () => {
    registrarVenta(s, { codigo: 'PORCIÓN UNO' });
    const r = s.registrarPromesaVenta(datosVenta({ codigo: 'Porción 1320 m²' }));
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya está registrada en el lote PORCIÓN UNO/) });
    expect(s.getLotes(PROYECTO)).toHaveLength(1);
  });

  it('el mismo comprador sí puede comprar otro lote distinto', () => {
    registrarVenta(s, { codigo: 'L-01' });
    const otro = datosVenta({ codigo: 'L-02' });
    otro.loteModificado.areaM2 = 900;
    expect(s.registrarPromesaVenta(otro).ok).toBe(true);
  });

  it('un lote del catálogo sin venta se reutiliza aunque el código difiera en tildes', () => {
    s.addLote({ id: 'cat-1', proyectoId: PROYECTO, codigoLote: 'Porción Dos', bloqueManzana: '', areaM2: 500, precioLista: 0, estado: 'DISPONIBLE', verticesPoligono: [] });
    const k = registrarVenta(s, { codigo: 'PORCION DOS' });
    expect(s.getContratos().find((c) => c.id === k)!.loteId).toBe('cat-1');
    expect(s.getLotes(PROYECTO).filter((l) => l.codigoLote.toUpperCase().includes('DOS'))).toHaveLength(1);
  });

  it('un lote del catálogo ya dibujado conserva su polígono si la promesa no trae coordenadas', () => {
    const poligono = [
      { lat: 13.48, lng: -88.18 },
      { lat: 13.4802, lng: -88.18 },
      { lat: 13.4802, lng: -88.1798 },
    ];
    s.addLote({ id: 'cat-16', proyectoId: PROYECTO, codigoLote: 'Lote 16', bloqueManzana: 'Polígono F', areaM2: 324.35, precioLista: 0, estado: 'DISPONIBLE', verticesPoligono: poligono, linderos: { norte: 'Lote 15' } });
    const datos = datosVenta({ codigo: 'LOTE 16' }); // la promesa trae el código con otras mayúsculas y sin polígono
    datos.loteModificado.areaM2 = 324.35;
    expect(s.registrarPromesaVenta(datos).ok).toBe(true);
    expect(s.getLoteById('cat-16')).toMatchObject({ verticesPoligono: poligono, linderos: { norte: 'Lote 15' }, estado: 'VENDIDO' });
  });
});

describe('lotes vendidos', () => {
  it('lista cada lote con su contrato, comprador y avance de pagos, del más reciente al más antiguo', () => {
    const k1 = registrarVenta(s, { codigo: 'L-01' });
    const segunda = datosVenta({ codigo: 'L-02' });
    segunda.loteModificado.areaM2 = 900;
    segunda.contrato.fechaFirma = '2099-01-01';
    expect(s.registrarPromesaVenta(segunda).ok).toBe(true);

    const filas = s.getLotesVendidos(PROYECTO);
    expect(filas.map((f) => f.lote.codigoLote)).toEqual(['L-02', 'L-01']);
    const f1 = filas.find((f) => f.contrato.id === k1)!;
    expect(f1.comprador?.dniIdentificacion).toBe('04512378-8');
    expect(f1.saldoPendiente).toBe(9000); // 14,000 − 5,000 de prima
    expect(f1).toMatchObject({ cuotasPagadas: 0, dibujado: false });
    expect(f1.cuotasTotales).toBeGreaterThan(0);
    expect(f1.proximaCuota?.numeroCuota).toBe(1);
    expect(s.getLotesVendidos('otro-proyecto')).toEqual([]);
  });
});

describe('documento de la promesa: se guarda al subirlo y se vincula al registrar', () => {
  const archivo = new File([new Uint8Array([37, 80, 68, 70])], 'promesa.pdf', { type: 'application/pdf' });
  afterEach(() => vi.unstubAllGlobals());

  /** API simulada: responde a las rutas de documentos y registra las llamadas. */
  function api(respuestas: Record<string, () => Response>) {
    const llamadas: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const llamada = `${init?.method ?? 'GET'} ${url}`;
        if (url.startsWith('/api/documentos')) llamadas.push(llamada);
        const clave = Object.keys(respuestas).find((k) => llamada.startsWith(k));
        return clave ? respuestas[clave]() : new Response('{"error":"no disponible"}', { status: 503 });
      })
    );
    return llamadas;
  }
  const json = (estado: number, cuerpo: unknown) => () => new Response(JSON.stringify(cuerpo), { status: estado });

  it('al registrar, vincula al contrato el documento que ya se había guardado', async () => {
    const llamadas = api({
      'POST /api/documentos?nombre=': json(201, { id: 'doc-1', nombre: 'promesa.pdf', nuevo: true }),
      'POST /api/documentos/doc-1/vincular': json(200, { id: 'doc-1', contratoId: 'k-1' }),
    });
    const subida = s.subirDocumento(null, archivo);
    expect(await s.guardarDocumentoDeContrato(subida, 'k-1', archivo)).toEqual({ ok: true });
    expect(llamadas).toEqual(['POST /api/documentos?nombre=promesa.pdf', 'POST /api/documentos/doc-1/vincular?contratoId=k-1']);
  });

  it('si la primera subida falló, la repite ya con el contrato', async () => {
    let intentos = 0;
    const llamadas = api({
      'POST /api/documentos?nombre=': () =>
        ++intentos === 1 ? new Response('{"error":"sin conexión"}', { status: 503 }) : new Response(JSON.stringify({ id: 'doc-1' }), { status: 201 }),
    });
    const subida = s.subirDocumento(null, archivo);
    expect(await s.guardarDocumentoDeContrato(subida, 'k-1', archivo)).toEqual({ ok: true });
    expect(llamadas).toEqual(['POST /api/documentos?nombre=promesa.pdf', 'POST /api/documentos?nombre=promesa.pdf&contratoId=k-1']);
  });

  it('avisa si el documento ya pertenece a otro contrato', async () => {
    api({
      'POST /api/documentos?nombre=': json(200, { id: 'doc-1', nuevo: false }),
      'POST /api/documentos/doc-1/vincular': json(409, { error: 'El documento ya pertenece a otro contrato.' }),
    });
    const r = await s.guardarDocumentoDeContrato(s.subirDocumento(null, archivo), 'k-2', archivo);
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/otro contrato/) });
  });
});

describe('limpiar datos', () => {
  it('borra ventas, cobros y repartos, y conserva el proyecto y los beneficiarios', () => {
    registrarVenta(s, { gastos: true });
    const beneficiarios = s.getBeneficiarios(PROYECTO);
    expect(s.getRecibos().length).toBeGreaterThan(0);

    s.limpiarConservandoBeneficiarios();
    expect(s.getContratos()).toEqual([]);
    expect(s.getLotes()).toEqual([]);
    expect(s.getClientes()).toEqual([]);
    expect(s.getCuotasPendientes()).toEqual([]);
    expect(s.getRecibos()).toEqual([]);
    expect(s.getGastos()).toEqual([]);
    expect(s.getDistribuciones()).toEqual([]);
    expect(s.getActiveProyecto()?.id).toBe(PROYECTO);
    expect(s.getBeneficiarios(PROYECTO)).toEqual(beneficiarios);

    // Los folios vuelven a empezar
    registrarVenta(s);
    expect(s.getRecibos()[0].folio).toMatch(/-0001$/);
  });
});

describe('saldos por lote vendido', () => {
  it('cada venta lleva su saldo: las entregas salen de un lote y no se mezclan con otras ventas', () => {
    const kA = registrarVenta(s, { codigo: 'LOTE-A', gastos: true });
    const segunda = datosVenta({ codigo: 'LOTE-B' });
    segunda.loteModificado.areaM2 = 900; // otro terreno (la misma área y comprador se toma como la misma venta)
    expect(s.registrarPromesaVenta(segunda).ok).toBe(true);
    const kB = segunda.contrato.id;

    const [ventaA, ventaB] = s.getSaldosPorVenta(PROYECTO);
    expect([ventaA.contratoId, ventaB.contratoId]).toEqual([kA, kB]);
    expect(ventaA.saldos).toHaveLength(8); // 7 beneficiarios + el abogado externo (gastos del lote A)
    expect(ventaB.saldos).toHaveLength(7);
    const b1 = (v: typeof ventaA) => v.saldos.find((x) => x.clave === 'B:b1')!;
    expect(b1(ventaA).pendiente).toBe(1171.43); // 4000/7 + 600 de comisión
    expect(b1(ventaB).pendiente).toBe(714.29); // 5000/7

    // No se puede sacar de un lote más de lo que ese lote le debe, aunque en total tenga más
    const persona = b1(ventaB).persona;
    const exceso = s.addLiquidacion({ proyectoId: PROYECTO, contratoId: kB, destinatario: persona, monto: 714.3, fecha: '2026-10-03', metodo: 'EFECTIVO' });
    expect(exceso.ok).toBe(false);
    const entrega = s.addLiquidacion({ proyectoId: PROYECTO, contratoId: kB, destinatario: persona, monto: 714.29, fecha: '2026-10-03', metodo: 'EFECTIVO' });
    expect(entrega.ok).toBe(true);
    expect(entrega.valor!.loteId).toBe(ventaB.loteId);

    const [aDespues, bDespues] = s.getSaldosPorVenta(PROYECTO);
    expect(b1(aDespues).pendiente).toBe(1171.43);
    expect(b1(bDespues).pendiente).toBe(0);

    // Entregar a todos solo del lote A: una entrega por persona con saldo en ese lote
    const todos = s.registrarEntregasATodos({ contratoId: kA, fecha: '2026-10-03', metodo: 'TRANSFERENCIA' });
    expect(todos.valor).toHaveLength(8);
    expect(todos.valor!.every((l) => l.contratoId === kA)).toBe(true);
    const [aFinal, bFinal] = s.getSaldosPorVenta(PROYECTO);
    expect(aFinal.pendiente).toBe(0);
    expect(bFinal.pendiente).toBeCloseTo(5000 - 714.29, 2);

    // El comprobante dice de qué lote sale el dinero y cuadra solo con esa venta
    const doc = s.getDocumentoEntrega(entrega.valor!.id)!;
    expect(doc.cuerpo.concepto).toMatch(/en los cobros de la venta del lote LOTE-B del proyecto/);
    const valor = (e: string) => doc.detalle.find((d) => d.etiqueta === e)?.valor;
    expect(valor('Lote vendido')).toBe('LOTE-B');
    expect(valor('Participación acumulada')).toBe('$ 714.29');
    expect(valor('Saldo pendiente después de esta entrega')).toBe('$ 0.00');

    // El estado de cuenta trae una tabla por lote
    const e = s.getEstadoCuentaBeneficiarios(PROYECTO)!;
    expect(e.ventas.map((v) => v.lote)).toEqual(['LOTE-A', 'LOTE-B']);
    expect(e.entregas.find((x) => x.folio === entrega.valor!.folio)?.lote).toBe('LOTE-B');
    expect(e.totales.pendiente).toBeCloseTo(e.ventas.reduce((a, v) => a + v.totales.pendiente, 0), 2);
  });
});

describe('estado de cuenta de beneficiarios (documento imprimible)', () => {
  it('resume saldos, repartos y entregas, y los totales cuadran con las filas', () => {
    registrarVenta(s, { gastos: true });
    const [b1] = s.getSaldosPorPersona(PROYECTO).filter((x) => x.persona.tipo === 'BENEFICIARIO');
    expect(s.addLiquidacion({ proyectoId: PROYECTO, destinatario: b1.persona, monto: 100, fecha: '2026-10-01', metodo: 'EFECTIVO' }).ok).toBe(true);

    const e = s.getEstadoCuentaBeneficiarios(PROYECTO)!;
    expect(e.titulo).toBe('ESTADO DE CUENTA DE BENEFICIARIOS');
    expect(e.emisor.nombre).toBe('Sucesión de Prueba');
    expect(e.ventas).toHaveLength(1);
    expect(e.ventas[0]).toMatchObject({ comprador: 'Comprador Ficticio', totales: { cobrado: 5000, entregado: 100 } });
    expect(e.ventas[0].filas.filter((x) => x.tipo === 'Beneficiario')).toHaveLength(7);
    expect(e.ventas[0].filas.find((x) => x.tipo === 'Beneficiario')!.participacion).toBeCloseTo(100 / 7, 4);
    expect(e.repartos).toHaveLength(1);
    expect(e.repartos[0]).toMatchObject({ cobro: 'Prima', cobrado: 5000, reembolsos: 1000, neto: 4000, anulado: false });
    expect(e.entregas).toEqual([expect.objectContaining({ monto: 100, metodo: 'Efectivo' })]);
    expect(e.totales.cobrado).toBe(5000);
    expect(e.totales.entregado).toBe(100);
    // repartido + reembolsos − entregado = pendiente
    expect(e.totales.repartido + e.totales.reembolsos - e.totales.entregado).toBeCloseTo(e.totales.pendiente, 2);
    expect(e.firmas[0]).toMatchObject({ etiqueta: 'Elaborado por', nombre: 'Representante Ficticio' });
  });
});
