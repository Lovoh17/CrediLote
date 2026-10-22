/**
 * Motor de reparto de cobros entre beneficiarios de una sucesión (plan 04.3, reglas RN-B1 a RN-B5).
 * Funciones puras: todos los cálculos se hacen en centavos enteros.
 */
import {
  Beneficiario,
  DistribucionCobro,
  GastoVenta,
  Liquidacion,
  ResponsableGasto,
} from '@/shared/types';

const aCentavos = (monto: number) => Math.round(monto * 100);
const aMonto = (centavos: number) => centavos / 100;

/** Tolerancia al validar que los porcentajes sumen 100 (por el redondeo a 4 decimales). */
const TOLERANCIA_PORCENTAJE = 0.001;

/**
 * Porcentajes iguales con precisión completa (100 / n), para que el reparto sea exactamente igual.
 * Se muestran redondeados a 4 decimales; redondearlos al guardar favorecería al último beneficiario.
 */
export function porcentajesIguales(cantidad: number): number[] {
  if (cantidad <= 0) return [];
  return Array.from({ length: cantidad }, () => 100 / cantidad);
}

export function sumaPorcentajes(beneficiarios: Pick<Beneficiario, 'porcentaje' | 'activo'>[]): number {
  return Number(
    beneficiarios.filter((b) => b.activo).reduce((acc, b) => acc + (Number(b.porcentaje) || 0), 0).toFixed(4)
  );
}

export function porcentajesValidos(beneficiarios: Pick<Beneficiario, 'porcentaje' | 'activo'>[]): boolean {
  const activos = beneficiarios.filter((b) => b.activo);
  return (
    activos.length > 0 &&
    activos.every((b) => b.porcentaje > 0) &&
    Math.abs(sumaPorcentajes(beneficiarios) - 100) <= TOLERANCIA_PORCENTAJE
  );
}

export interface GastoPendiente {
  gastoId: string;
  pendiente: number;
}

/**
 * Gastos a cargo de la sucesión que cumplen `incluir` y todavía no se han reembolsado del todo,
 * en orden de fecha (y de registro). Lo reembolsado se cuenta en todas las distribuciones recibidas.
 */
export function gastosPendientes(
  gastos: GastoVenta[],
  distribuciones: DistribucionCobro[],
  incluir: (g: GastoVenta) => boolean
): GastoPendiente[] {
  const reembolsado = new Map<string, number>();
  distribuciones
    .filter((d) => !d.anulada)
    .forEach((d) =>
    d.reembolsos.forEach((r) => reembolsado.set(r.gastoId, (reembolsado.get(r.gastoId) ?? 0) + aCentavos(r.monto)))
  );

  return gastos
    .filter((g) => g.aCargoDe === 'SUCESION' && incluir(g))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.createdAt.localeCompare(b.createdAt))
    .map((g) => ({ gastoId: g.id, pendiente: aMonto(aCentavos(g.monto) - (reembolsado.get(g.id) ?? 0)) }))
    .filter((g) => g.pendiente > 0);
}

/** RN-B2: gastos pendientes de la venta (contrato) que se está cobrando. */
export function gastosPendientesDeContrato(
  gastos: GastoVenta[],
  distribuciones: DistribucionCobro[],
  contratoId: string
): GastoPendiente[] {
  return gastosPendientes(gastos, distribuciones, (g) => g.contratoId === contratoId);
}

/**
 * RN-N3: gastos de negociaciones canceladas que asumió la sucesión. No pertenecen a ninguna venta y se
 * reembolsan de la próxima prima que se cobre en el proyecto.
 */
export function gastosPendientesDeNegociacionesCanceladas(
  gastos: GastoVenta[],
  distribuciones: DistribucionCobro[],
  negociacionesCanceladasPorSucesion: Set<string>
): GastoPendiente[] {
  return gastosPendientes(
    gastos,
    distribuciones,
    (g) => !g.contratoId && !!g.negociacionId && negociacionesCanceladasPorSucesion.has(g.negociacionId)
  );
}

export interface ResultadoDistribucion {
  reembolsos: { gastoId: string; monto: number }[];
  neto: number;
  partes: { beneficiarioId: string; monto: number }[];
  /** Índice del beneficiario que recibe el próximo centavo sobrante (RN-B3). */
  siguienteIndiceRotacion: number;
}

/**
 * Reparte un cobro:
 * 1. RN-B2: primero reembolsa los gastos pendientes de la sucesión (al responsable de cada gasto).
 * 2. RN-B3: el neto se reparte según los porcentajes, redondeando hacia abajo al centavo; los centavos
 *    sobrantes se asignan uno a uno en rotación, empezando por `indiceRotacion`.
 */
export function calcularDistribucion(params: {
  monto: number;
  gastosPendientes: GastoPendiente[];
  beneficiarios: Pick<Beneficiario, 'id' | 'porcentaje'>[];
  indiceRotacion: number;
}): ResultadoDistribucion {
  let disponible = aCentavos(params.monto);

  const reembolsos: ResultadoDistribucion['reembolsos'] = [];
  for (const gasto of params.gastosPendientes) {
    if (disponible <= 0) break;
    const aplicar = Math.min(disponible, aCentavos(gasto.pendiente));
    if (aplicar > 0) {
      reembolsos.push({ gastoId: gasto.gastoId, monto: aMonto(aplicar) });
      disponible -= aplicar;
    }
  }

  const beneficiarios = params.beneficiarios;
  const n = beneficiarios.length;
  if (n === 0 || disponible <= 0) {
    return {
      reembolsos,
      neto: aMonto(Math.max(disponible, 0)),
      partes: [],
      siguienteIndiceRotacion: params.indiceRotacion,
    };
  }

  const sumaPct = beneficiarios.reduce((acc, b) => acc + b.porcentaje, 0);
  const centavos = beneficiarios.map((b) => Math.floor((disponible * b.porcentaje) / sumaPct));
  let sobrante = disponible - centavos.reduce((a, b) => a + b, 0);

  let indice = ((params.indiceRotacion % n) + n) % n;
  while (sobrante > 0) {
    centavos[indice] += 1;
    sobrante -= 1;
    indice = (indice + 1) % n;
  }

  return {
    reembolsos,
    neto: aMonto(disponible),
    partes: beneficiarios.map((b, i) => ({ beneficiarioId: b.id, monto: aMonto(centavos[i]) })),
    siguienteIndiceRotacion: indice,
  };
}

/** Clave estable de una persona (beneficiario o externo) para agrupar saldos. */
export function clavePersona(r: ResponsableGasto): string {
  return r.tipo === 'BENEFICIARIO' ? `B:${r.beneficiarioId}` : `E:${r.nombre.trim().toLocaleLowerCase('es')}`;
}

export interface SaldoPersona {
  clave: string;
  persona: ResponsableGasto;
  nombre: string;
  /** Partes recibidas de los repartos. */
  repartido: number;
  /** Reembolsos de gastos que adelantó. */
  reembolsos: number;
  /** Dinero ya entregado (liquidaciones). */
  entregado: number;
  pendiente: number;
}

/**
 * RN-B5: saldo por persona = repartido + reembolsos − entregado (sin repartos anulados).
 * Un saldo negativo indica que se le entregó más de lo que le corresponde (p. ej. tras anular un cobro).
 */
export function calcularSaldos(
  beneficiarios: Beneficiario[],
  gastos: GastoVenta[],
  distribuciones: DistribucionCobro[],
  liquidaciones: Liquidacion[]
): SaldoPersona[] {
  const saldos = new Map<string, SaldoPersona>();
  const nombreBeneficiario = new Map(beneficiarios.map((b) => [b.id, b.nombreCompleto]));

  const obtener = (persona: ResponsableGasto): SaldoPersona => {
    const clave = clavePersona(persona);
    let s = saldos.get(clave);
    if (!s) {
      const nombre =
        persona.tipo === 'BENEFICIARIO'
          ? nombreBeneficiario.get(persona.beneficiarioId) ?? 'Beneficiario eliminado'
          : persona.nombre;
      s = { clave, persona, nombre, repartido: 0, reembolsos: 0, entregado: 0, pendiente: 0 };
      saldos.set(clave, s);
    }
    return s;
  };

  // Todos los beneficiarios aparecen aunque todavía no tengan movimientos
  [...beneficiarios].sort((a, b) => a.orden - b.orden).forEach((b) =>
    obtener({ tipo: 'BENEFICIARIO', beneficiarioId: b.id })
  );

  const gastoPorId = new Map(gastos.map((g) => [g.id, g]));
  const suma = (s: SaldoPersona, campo: 'repartido' | 'reembolsos' | 'entregado', monto: number) => {
    s[campo] = aMonto(aCentavos(s[campo]) + aCentavos(monto));
  };

  distribuciones.filter((d) => !d.anulada).forEach((d) => {
    d.partes.forEach((p) => suma(obtener({ tipo: 'BENEFICIARIO', beneficiarioId: p.beneficiarioId }), 'repartido', p.monto));
    d.reembolsos.forEach((r) => {
      const gasto = gastoPorId.get(r.gastoId);
      if (gasto) suma(obtener(gasto.responsable), 'reembolsos', r.monto);
    });
  });

  liquidaciones.forEach((l) => suma(obtener(l.destinatario), 'entregado', l.monto));

  return [...saldos.values()].map((s) => ({
    ...s,
    pendiente: aMonto(aCentavos(s.repartido) + aCentavos(s.reembolsos) - aCentavos(s.entregado)),
  }));
}

export interface SaldosDeVenta {
  contratoId: string;
  loteId: string;
  /** Personas con movimientos en esta venta (beneficiarios en su orden y después los externos). */
  saldos: SaldoPersona[];
  repartido: number;
  reembolsos: number;
  entregado: number;
  pendiente: number;
}

/**
 * Saldos por lote vendido: lo repartido y reembolsado de los cobros de cada venta, menos lo entregado de esa venta.
 * Así el dinero de una venta no se mezcla con el de otra.
 *
 * Las entregas sin venta (registradas antes de llevar los saldos por lote) se aplican, por orden de fecha,
 * a las ventas más antiguas de esa persona que todavía tengan saldo; lo que sobre queda en la última.
 * La suma de todas las ventas es igual a `calcularSaldos`.
 */
export function calcularSaldosPorVenta(
  beneficiarios: Beneficiario[],
  gastos: GastoVenta[],
  distribuciones: DistribucionCobro[],
  liquidaciones: Liquidacion[]
): SaldosDeVenta[] {
  const nombreBeneficiario = new Map(beneficiarios.map((b) => [b.id, b.nombreCompleto]));
  const ordenBeneficiario = new Map(beneficiarios.map((b) => [b.id, b.orden]));
  const gastoPorId = new Map(gastos.map((g) => [g.id, g]));
  const porFecha = <T extends { fecha: string; createdAt: string }>(a: T, b: T) =>
    a.fecha.localeCompare(b.fecha) || a.createdAt.localeCompare(b.createdAt);

  // Movimientos en centavos por venta y por persona
  type Cuenta = { persona: ResponsableGasto; repartido: number; reembolsos: number; entregado: number };
  const ventas = new Map<string, { loteId: string; cuentas: Map<string, Cuenta> }>();
  const venta = (contratoId: string, loteId: string) => {
    let v = ventas.get(contratoId);
    if (!v) {
      v = { loteId, cuentas: new Map() };
      ventas.set(contratoId, v);
    }
    return v;
  };
  const cuenta = (v: { cuentas: Map<string, Cuenta> }, persona: ResponsableGasto) => {
    const clave = clavePersona(persona);
    let c = v.cuentas.get(clave);
    if (!c) {
      c = { persona, repartido: 0, reembolsos: 0, entregado: 0 };
      v.cuentas.set(clave, c);
    }
    return c;
  };

  // Las ventas en el orden de su primer cobro
  [...distribuciones]
    .filter((d) => !d.anulada)
    .sort(porFecha)
    .forEach((d) => {
      const v = venta(d.contratoId, d.loteId);
      d.partes.forEach((p) => (cuenta(v, { tipo: 'BENEFICIARIO', beneficiarioId: p.beneficiarioId }).repartido += aCentavos(p.monto)));
      d.reembolsos.forEach((r) => {
        const gasto = gastoPorId.get(r.gastoId);
        if (gasto) cuenta(v, gasto.responsable).reembolsos += aCentavos(r.monto);
      });
    });

  const ordenadas = [...liquidaciones].sort(porFecha);
  ordenadas
    .filter((l) => l.contratoId)
    .forEach((l) => (cuenta(venta(l.contratoId!, l.loteId ?? ''), l.destinatario).entregado += aCentavos(l.monto)));

  // Entregas sin venta: a las ventas más antiguas de la persona con saldo
  ordenadas
    .filter((l) => !l.contratoId)
    .forEach((l) => {
      const clave = clavePersona(l.destinatario);
      const suyas = [...ventas.values()].filter((v) => v.cuentas.has(clave)).map((v) => v.cuentas.get(clave)!);
      let resto = aCentavos(l.monto);
      for (const c of suyas) {
        const aplicar = Math.min(resto, Math.max(0, c.repartido + c.reembolsos - c.entregado));
        c.entregado += aplicar;
        resto -= aplicar;
      }
      if (resto > 0) {
        const ultima = suyas[suyas.length - 1];
        if (ultima) ultima.entregado += resto;
      }
    });

  const nombre = (p: ResponsableGasto) =>
    p.tipo === 'BENEFICIARIO' ? nombreBeneficiario.get(p.beneficiarioId) ?? 'Beneficiario eliminado' : p.nombre;
  const orden = (p: ResponsableGasto) =>
    p.tipo === 'BENEFICIARIO' ? ordenBeneficiario.get(p.beneficiarioId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;

  return [...ventas.entries()].map(([contratoId, v]) => {
    const saldos = [...v.cuentas.entries()]
      .map(([clave, c]) => ({
        clave,
        persona: c.persona,
        nombre: nombre(c.persona),
        repartido: aMonto(c.repartido),
        reembolsos: aMonto(c.reembolsos),
        entregado: aMonto(c.entregado),
        pendiente: aMonto(c.repartido + c.reembolsos - c.entregado),
      }))
      .sort((a, b) => orden(a.persona) - orden(b.persona) || a.nombre.localeCompare(b.nombre, 'es'));
    const total = (campo: 'repartido' | 'reembolsos' | 'entregado' | 'pendiente') =>
      aMonto(saldos.reduce((acc, s) => acc + aCentavos(s[campo]), 0));
    return {
      contratoId,
      loteId: v.loteId,
      saldos,
      repartido: total('repartido'),
      reembolsos: total('reembolsos'),
      entregado: total('entregado'),
      pendiente: total('pendiente'),
    };
  });
}

export const ETIQUETAS_CATEGORIA: Record<GastoVenta['categoria'], string> = {
  GESTION_VENTA: 'Gestión / comisión de venta',
  HONORARIOS_ABOGADO: 'Honorarios de abogado / notario',
  ESCRITURACION: 'Escrituración',
  TOPOGRAFIA: 'Levantamiento topográfico',
  INSCRIPCION_CNR: 'Inscripción CNR',
  SOLVENCIAS_IMPUESTOS: 'Solvencias e impuestos',
  COMBUSTIBLE: 'Combustible / gasolina',
  VIATICOS: 'Viáticos y alimentación',
  OTROS: 'Otros',
};
