import React, { useEffect, useMemo, useRef, useState } from 'react';
import { imprimirElemento } from '@/shared/utils/imprimir';
import { DocumentoEstadoCuenta } from '@/shared/components/documentos/DocumentoEstadoCuenta';
import {
  Users,
  Plus,
  Scale,
  Save,
  Undo2,
  HandCoins,
  Printer,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Trash2,
} from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Modal } from '@/shared/components/ui/Modal';
import { FormField } from '@/shared/components/ui/FormField';
import { Input } from '@/shared/components/ui/Input';
import { Select } from '@/shared/components/ui/Select';
import { DocumentoRecibo } from '@/shared/components/documentos/DocumentoRecibo';
import { storage } from '@/shared/services/storage';
import { Beneficiario, Liquidacion, MetodoPago, ResponsableGasto } from '@/shared/types';
import { formatCurrency, formatDate, hoyISO } from '@/shared/utils/formatters';
import { validarDUI } from '@/shared/utils/validaciones';
import {
  porcentajesIguales,
  porcentajesValidos,
  sumaPorcentajes,
  SaldoPersona,
  SaldosDeVenta,
  ETIQUETAS_CATEGORIA,
} from './engine/reparto';

const inputBase =
  'w-full text-xs border border-slate-300 rounded-md px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white';

const METODOS: { valor: MetodoPago; etiqueta: string }[] = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
  { valor: 'DEPOSITO', etiqueta: 'Depósito' },
  { valor: 'CHEQUE', etiqueta: 'Cheque' },
];

const nuevoBeneficiario = (proyectoId: string, orden: number): Beneficiario => ({
  id: `ben-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  proyectoId,
  nombreCompleto: '',
  porcentaje: 0,
  activo: true,
  orden,
  createdAt: new Date().toISOString(),
});

/** Módulo de beneficiarios, repartos y entregas (plan 04.3, fases 8.2, 8.4 y 8.5). */
export const BeneficiariosView: React.FC = () => {
  const proyecto = storage.getActiveProyecto();
  const guardados = storage.getBeneficiarios();
  const gastos = storage.getGastos();
  const distribuciones = storage.getDistribuciones();
  const liquidaciones = storage.getLiquidaciones();
  const cobrosSinRepartir = storage.getCobrosSinRepartir();
  const lotes = storage.getLotes();
  const moneda = proyecto?.moneda;

  // Borrador editable de beneficiarios
  const [borrador, setBorrador] = useState<Beneficiario[]>(guardados);
  const firmaGuardados = JSON.stringify(guardados);
  useEffect(() => setBorrador(JSON.parse(firmaGuardados)), [firmaGuardados, proyecto?.id]);
  const hayCambios = JSON.stringify(borrador) !== firmaGuardados;

  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [entregaPara, setEntregaPara] = useState<{ venta: SaldosDeVenta; saldo: SaldoPersona } | null>(null);
  const [entregarATodosDe, setEntregarATodosDe] = useState<SaldosDeVenta | null>(null);
  // Ventas plegadas o desplegadas a mano (por defecto se abren las que tienen saldo)
  const [plegadas, setPlegadas] = useState<Record<string, boolean>>({});
  const [comprobante, setComprobante] = useState<Liquidacion | null>(null);
  const [estadoCuentaAbierto, setEstadoCuentaAbierto] = useState(false);
  // Documentos que se imprimen solos (sin la pantalla detrás)
  const comprobanteRef = useRef<HTMLDivElement>(null);
  const estadoCuentaRef = useRef<HTMLDivElement>(null);

  // Saldos por lote vendido: el dinero de cada venta se reparte y se entrega por separado
  const repartosAnulados = distribuciones.filter((d) => d.anulada).length;
  const ventas = useMemo(
    () => (proyecto ? storage.getSaldosPorVenta(proyecto.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [firmaGuardados, gastos.length, distribuciones.length, repartosAnulados, liquidaciones.length, proyecto?.id]
  );

  if (!proyecto) {
    return <p className="text-sm text-slate-500">Cree un proyecto para configurar beneficiarios.</p>;
  }

  const suma = sumaPorcentajes(borrador);
  const validos = borrador.length === 0 || porcentajesValidos(borrador);
  const erroresFila = borrador.map((b) => {
    if (!b.nombreCompleto.trim()) return 'Falta el nombre.';
    if (b.dui && !validarDUI(b.dui).valido) return validarDUI(b.dui).mensaje;
    return null;
  });
  const puedeGuardar = hayCambios && validos && erroresFila.every((e) => !e);

  const actualizar = (i: number, cambios: Partial<Beneficiario>) =>
    setBorrador(borrador.map((b, j) => (j === i ? { ...b, ...cambios } : b)));

  const repartirIguales = () => {
    const activos = borrador.filter((b) => b.activo);
    const pct = porcentajesIguales(activos.length);
    let k = 0;
    setBorrador(borrador.map((b) => (b.activo ? { ...b, porcentaje: pct[k++] } : { ...b, porcentaje: 0 })));
  };

  const guardar = () => {
    const r = storage.guardarBeneficiarios(proyecto.id, borrador);
    setMensaje(r.ok ? { tipo: 'ok', texto: 'Beneficiarios guardados correctamente.' } : { tipo: 'error', texto: r.mensaje ?? 'Error al guardar.' });
  };

  const nombreLote = (loteId: string) => lotes.find((l) => l.id === loteId)?.codigoLote ?? '—';
  const nombreBeneficiario = (id: string) => guardados.find((b) => b.id === id)?.nombreCompleto ?? 'Beneficiario';
  const nombreDestinatario = (d: ResponsableGasto) => (d.tipo === 'BENEFICIARIO' ? nombreBeneficiario(d.beneficiarioId) : d.nombre);

  const repartir = (cobro: (typeof cobrosSinRepartir)[number]) => {
    const r = storage.repartirCobroPendiente(cobro);
    setMensaje(r.ok ? { tipo: 'ok', texto: 'Cobro repartido.' } : { tipo: 'error', texto: r.mensaje ?? 'No se pudo repartir.' });
  };

  const repartirTodos = () => {
    const r = storage.repartirTodosLosPendientes();
    if (r.ok) {
      setMensaje({ tipo: 'ok', texto: `Se repartieron ${r.valor} cobro(s) pendiente(s).` });
    } else {
      setMensaje({ tipo: 'error', texto: r.mensaje ?? 'No se pudieron repartir los cobros.' });
    }
  };

  const porEntregar = (v: SaldosDeVenta) => v.saldos.reduce((a, s) => a + Math.max(0, s.pendiente), 0);
  const totalPendiente = ventas.reduce((a, v) => a + porEntregar(v), 0);
  const compradorDe = (contratoId: string) => {
    const contrato = storage.getContratoById(contratoId);
    return contrato ? storage.getClienteById(contrato.compradorId)?.nombreCompleto : undefined;
  };
  const cobradoDe = (contratoId: string) =>
    distribuciones.filter((d) => d.contratoId === contratoId && !d.anulada).reduce((a, d) => a + d.montoCobrado, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {proyecto.tipoPropietario !== 'SUCESION' && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
          Este proyecto está marcado como <strong>propio</strong>. Si pertenece a una sucesión, cámbielo en{' '}
          <em>Editar proyecto</em> (lápiz junto al nombre del proyecto, en la barra lateral).
        </div>
      )}

      {mensaje && (
        <div
          className={`p-3 rounded-lg text-xs flex justify-between items-center border ${
            mensaje.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {mensaje.tipo === 'ok' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{mensaje.texto}</span>
          </div>
          <button onClick={() => setMensaje(null)} className="text-xs opacity-70 hover:opacity-100 font-semibold ml-2">
            Cerrar
          </button>
        </div>
      )}

      {/* 1. Beneficiarios y participación */}
      <Card>
        <CardHeader className="py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" /> Beneficiarios y participación
            </h2>
            <p className="text-xs text-slate-500">
              {proyecto.representante ? `Representante: ${proyecto.representante} · ` : ''}Los porcentajes activos deben sumar 100 %.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={repartirIguales} leftIcon={<Scale className="w-3.5 h-3.5" />}>
              Partes iguales
            </Button>
            <Badge variant={validos && borrador.length > 0 ? 'available' : 'reserved'}>
              Total: {suma.toFixed(2)} %
            </Badge>
          </div>
        </CardHeader>
        <CardBody className="space-y-4 p-4">
          <div className="overflow-x-auto">
            <table className="min-w-[680px] w-full text-xs">
              <thead className="text-slate-500 text-[11px] uppercase tracking-wider">
                <tr className="text-left border-b border-slate-200">
                  <th className="px-2 py-1.5 w-12 text-center">Activo</th>
                  <th className="px-2 py-1.5">Nombre completo *</th>
                  <th className="px-2 py-1.5 w-32">DUI</th>
                  <th className="px-2 py-1.5 w-32">Teléfono</th>
                  <th className="px-2 py-1.5">Cuenta bancaria</th>
                  <th className="px-2 py-1.5 w-24 text-right">% Participación</th>
                  <th className="px-2 py-1.5 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {borrador.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-2 py-4 text-center text-slate-400">
                      No hay beneficiarios. Agregue a los herederos o miembros de la sucesión.
                    </td>
                  </tr>
                )}
                {borrador.map((b, i) => (
                  <React.Fragment key={b.id}>
                    <tr className={!b.activo ? 'opacity-50 bg-slate-50' : ''}>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={b.activo}
                          onChange={(e) => actualizar(i, { activo: e.target.checked })}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={b.nombreCompleto}
                          onChange={(e) => actualizar(i, { nombreCompleto: e.target.value })}
                          placeholder="Nombre y apellidos"
                          className={inputBase}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={b.dui ?? ''}
                          onChange={(e) => actualizar(i, { dui: e.target.value })}
                          placeholder="00000000-0"
                          className={inputBase}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={b.telefono ?? ''}
                          onChange={(e) => actualizar(i, { telefono: e.target.value })}
                          placeholder="7000-0000"
                          className={inputBase}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={b.cuentaBancaria ?? ''}
                          onChange={(e) => actualizar(i, { cuentaBancaria: e.target.value })}
                          placeholder="Banco y número de cuenta"
                          className={inputBase}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          max="100"
                          disabled={!b.activo}
                          value={b.activo ? b.porcentaje || '' : 0}
                          onChange={(e) => actualizar(i, { porcentaje: parseFloat(e.target.value) || 0 })}
                          className={`${inputBase} text-right font-mono tabular-nums`}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => setBorrador(borrador.filter((_, j) => j !== i))}
                          title="Quitar"
                          className="text-slate-400 hover:text-red-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                    {erroresFila[i] && (
                      <tr>
                        <td />
                        <td colSpan={6} className="px-2 pb-1.5 text-[11px] text-red-700">
                          {erroresFila[i]}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => setBorrador([...borrador, nuevoBeneficiario(proyecto.id, borrador.length)])}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar beneficiario
            </button>
            <div className="flex items-center gap-2">
              {!validos && <span className="text-[11px] text-red-700">Los porcentajes activos suman {suma.toFixed(4)} %: deben sumar 100 %.</span>}
              <Button size="sm" variant="ghost" onClick={() => setBorrador(guardados)} disabled={!hayCambios} leftIcon={<Undo2 className="w-3.5 h-3.5" />}>
                Descartar
              </Button>
              <Button size="sm" onClick={guardar} disabled={!puedeGuardar} leftIcon={<Save className="w-3.5 h-3.5" />}>
                Guardar beneficiarios
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Un beneficiario que ya recibió repartos no se puede eliminar; desmárquelo como activo. Los cambios de porcentaje solo afectan a los cobros futuros.
          </p>
        </CardBody>
      </Card>

      {/* 2. Cobros pendientes de repartir */}
      {cobrosSinRepartir.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Cobros sin repartir ({cobrosSinRepartir.length})
              </h2>
              <p className="text-xs text-slate-500">
                Cobros registrados antes de configurar los beneficiarios. La prima reembolsa primero los gastos de venta.
              </p>
            </div>
            <Button
              size="sm"
              onClick={repartirTodos}
              disabled={!porcentajesValidos(guardados)}
            >
              Repartir todos ({cobrosSinRepartir.length})
            </Button>
          </CardHeader>
          <CardBody className="p-4">
            <table className="w-full text-xs">
              <thead className="text-slate-500 text-[11px] uppercase tracking-wider">
                <tr className="text-left">
                  <th className="px-2 py-1.5">Fecha</th>
                  <th className="px-2 py-1.5">Lote</th>
                  <th className="px-2 py-1.5">Cobro</th>
                  <th className="px-2 py-1.5 text-right">Monto</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {cobrosSinRepartir.map((c) => (
                  <tr key={`${c.contratoId}-${c.origen}-${c.reciboId ?? ''}`}>
                    <td className="px-2 py-2">{formatDate(c.fecha)}</td>
                    <td className="px-2 py-2 font-semibold text-slate-900">{nombreLote(c.loteId)}</td>
                    <td className="px-2 py-2">{c.origen === 'PRIMA' ? 'Prima' : 'Cuota'}</td>
                    <td className="px-2 py-2 text-right font-medium">{formatCurrency(c.monto, moneda)}</td>
                    <td className="px-2 py-2 text-right">
                      <Button size="xs" onClick={() => repartir(c)} disabled={!porcentajesValidos(guardados)}>
                        Repartir
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* 3. Saldos por lote vendido */}
      <Card>
        <CardHeader className="py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <HandCoins className="w-4 h-4 text-slate-500" /> Saldos por lote vendido
            </h2>
            <p className="text-xs text-slate-500">
              Cada venta reparte sus propios cobros. Lo que se entrega sale de un lote y no se mezcla con otras ventas.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 [&_button]:whitespace-nowrap">
            <Badge variant={totalPendiente > 0 ? 'reserved' : 'available'}>
              Pendiente total: {formatCurrency(totalPendiente, moneda)}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => setEstadoCuentaAbierto(true)} leftIcon={<Printer className="w-3.5 h-3.5" />}>
              Estado de cuenta
            </Button>
          </div>
        </CardHeader>
        <CardBody className="p-4 space-y-3">
          {ventas.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-slate-400">
              Sin movimientos. Los saldos aparecen al repartir la prima o una cuota de una venta.
            </p>
          )}
          {ventas.map((v) => {
            const pendienteVenta = porEntregar(v);
            const abierta = plegadas[v.contratoId] === undefined ? pendienteVenta > 0 || v.pendiente < 0 : !plegadas[v.contratoId];
            const comprador = compradorDe(v.contratoId);
            return (
              <div key={v.contratoId} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setPlegadas({ ...plegadas, [v.contratoId]: abierta })}
                    className="flex items-center gap-2 min-w-0 text-left"
                  >
                    {abierta ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-slate-900">Lote {nombreLote(v.loteId)}</span>
                      <span className="block text-[11px] text-slate-500 truncate">
                        {comprador ? `${comprador} · ` : ''}Cobrado {formatCurrency(cobradoDe(v.contratoId), moneda)} · Entregado{' '}
                        {formatCurrency(v.entregado, moneda)}
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center gap-2 [&_button]:whitespace-nowrap">
                    <Badge variant={pendienteVenta > 0 ? 'reserved' : 'available'}>
                      {pendienteVenta > 0 ? `Pendiente: ${formatCurrency(pendienteVenta, moneda)}` : 'Todo entregado'}
                    </Badge>
                    <Button size="xs" onClick={() => setEntregarATodosDe(v)} disabled={pendienteVenta <= 0}>
                      Entregar a todos
                    </Button>
                  </div>
                </div>
                {abierta && (
                  <div className="overflow-x-auto">
                    <table className="min-w-[720px] w-full text-xs">
                      <thead className="text-slate-500 text-[11px] uppercase tracking-wider">
                        <tr className="text-left border-b border-slate-100">
                          <th className="px-3 py-1.5">Persona</th>
                          <th className="px-2 py-1.5 text-right">Participación</th>
                          <th className="px-2 py-1.5 text-right">Repartido</th>
                          <th className="px-2 py-1.5 text-right">Reembolsos</th>
                          <th className="px-2 py-1.5 text-right">Entregado</th>
                          <th className="px-2 py-1.5 text-right">Pendiente</th>
                          <th className="px-3 py-1.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 tabular-nums">
                        {v.saldos.map((s) => {
                          const ben = s.persona.tipo === 'BENEFICIARIO' ? guardados.find((b) => b.id === (s.persona as { beneficiarioId: string }).beneficiarioId) : undefined;
                          return (
                            <tr key={s.clave}>
                              <td className="px-3 py-2">
                                <p className="font-semibold text-slate-900">{s.nombre}</p>
                                <p className="text-[11px] text-slate-500">{s.persona.tipo === 'BENEFICIARIO' ? 'Beneficiario' : 'Responsable de gastos'}</p>
                              </td>
                              <td className="px-2 py-2 text-right">{ben ? `${ben.porcentaje.toFixed(4)} %` : '—'}</td>
                              <td className="px-2 py-2 text-right">{formatCurrency(s.repartido, moneda)}</td>
                              <td className="px-2 py-2 text-right">{formatCurrency(s.reembolsos, moneda)}</td>
                              <td className="px-2 py-2 text-right">{formatCurrency(s.entregado, moneda)}</td>
                              <td className="px-2 py-2 text-right">
                                {s.pendiente < 0 ? (
                                  <span className="text-red-600 font-bold tabular-nums">
                                    A devolver: {formatCurrency(Math.abs(s.pendiente), moneda)}
                                  </span>
                                ) : (
                                  <span className="font-bold text-slate-900 tabular-nums">{formatCurrency(s.pendiente, moneda)}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Button size="xs" variant="outline" onClick={() => setEntregaPara({ venta: v, saldo: s })} disabled={s.pendiente <= 0}>
                                  Registrar entrega
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </CardBody>
      </Card>

      {/* 4. Repartos por cobro */}
      <Card>
        <CardHeader className="py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Repartos por cobro</h2>
            <p className="text-xs text-slate-500">Cada prima o cuota cobrada: reembolso de gastos y parte de cada beneficiario.</p>
          </div>
        </CardHeader>
        <CardBody className="p-4 overflow-x-auto">
          <table className="min-w-[640px] w-full text-xs">
            <thead className="text-slate-500 text-[11px] uppercase tracking-wider">
              <tr className="text-left">
                <th className="px-2 py-1.5 w-6" />
                <th className="px-2 py-1.5">Fecha</th>
                <th className="px-2 py-1.5">Lote</th>
                <th className="px-2 py-1.5">Cobro</th>
                <th className="px-2 py-1.5 text-right">Cobrado</th>
                <th className="px-2 py-1.5 text-right">Reembolsos</th>
                <th className="px-2 py-1.5 text-right">Neto repartido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {distribuciones.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-2 py-4 text-center text-slate-400">
                    Aún no hay repartos. Se generan al registrar la promesa (prima) y cada cuota cobrada.
                  </td>
                </tr>
              )}
              {[...distribuciones]
                .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.createdAt.localeCompare(a.createdAt))
                .map((d) => {
                  const abierto = expandido === d.id;
                  const totalReembolsos = d.reembolsos.reduce((a, r) => a + r.monto, 0);
                  return (
                    <React.Fragment key={d.id}>
                      <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setExpandido(abierto ? null : d.id)}>
                        <td className="px-2 py-2 text-slate-400">{abierto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</td>
                        <td className="px-2 py-2">{formatDate(d.fecha)}</td>
                        <td className="px-2 py-2 font-semibold text-slate-900">{nombreLote(d.loteId)}</td>
                        <td className="px-2 py-2">{d.origen === 'PRIMA' ? 'Prima' : 'Cuota'}</td>
                        <td className="px-2 py-2 text-right">{formatCurrency(d.montoCobrado, moneda)}</td>
                        <td className="px-2 py-2 text-right">{formatCurrency(totalReembolsos, moneda)}</td>
                        <td className="px-2 py-2 text-right font-semibold text-slate-900">{formatCurrency(d.neto, moneda)}</td>
                      </tr>
                      {abierto && (
                        <tr>
                          <td />
                          <td colSpan={6} className="px-2 pb-3">
                            <div className="grid md:grid-cols-2 gap-3 bg-slate-50 rounded-lg p-3">
                              <div>
                                <p className="text-[11px] font-semibold text-slate-500 uppercase mb-1">Reembolsos de gastos</p>
                                {d.reembolsos.length === 0 && <p className="text-slate-400">Ninguno</p>}
                                {d.reembolsos.map((r) => {
                                  const g = gastos.find((x) => x.id === r.gastoId);
                                  return (
                                    <p key={r.gastoId} className="flex justify-between">
                                      <span>
                                        {g ? `${ETIQUETAS_CATEGORIA[g.categoria]} · ${nombreDestinatario(g.responsable)}` : 'Gasto'}
                                      </span>
                                      <strong className="tabular-nums">{formatCurrency(r.monto, moneda)}</strong>
                                    </p>
                                  );
                                })}
                              </div>
                              <div>
                                <p className="text-[11px] font-semibold text-slate-500 uppercase mb-1">Parte de cada beneficiario</p>
                                {d.partes.map((p) => {
                                  const ben = guardados.find((b) => b.id === p.beneficiarioId);
                                  const pct = ben ? `${ben.porcentaje}%` : d.neto > 0 ? `${((p.monto / d.neto) * 100).toFixed(1)}%` : '';
                                  return (
                                    <p key={p.beneficiarioId} className="flex justify-between">
                                      <span>{nombreBeneficiario(p.beneficiarioId)} {pct && `(${pct})`}</span>
                                      <strong className="tabular-nums">{formatCurrency(p.monto, moneda)}</strong>
                                    </p>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {/* 5. Historial de entregas */}
      <Card>
        <CardHeader className="py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Entregas de dinero registradas ({liquidaciones.length})</h2>
            <p className="text-xs text-slate-500">Comprobantes oficiales de dinero entregado a beneficiarios y a responsables de gastos.</p>
          </div>
        </CardHeader>
        <CardBody className="p-4 overflow-x-auto">
          <table className="min-w-[640px] w-full text-xs">
            <thead className="text-slate-500 text-[11px] uppercase tracking-wider">
              <tr className="text-left">
                <th className="px-2 py-1.5">Folio</th>
                <th className="px-2 py-1.5">Fecha</th>
                <th className="px-2 py-1.5">Lote</th>
                <th className="px-2 py-1.5">Destinatario</th>
                <th className="px-2 py-1.5">Método</th>
                <th className="px-2 py-1.5 text-right">Monto</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {liquidaciones.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-2 py-4 text-center text-slate-400">
                    Aún no se han registrado entregas.
                  </td>
                </tr>
              )}
              {[...liquidaciones]
                .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.createdAt.localeCompare(a.createdAt))
                .map((l) => (
                  <tr key={l.id}>
                    <td className="px-2 py-2 font-mono font-bold text-slate-900">{l.folio}</td>
                    <td className="px-2 py-2">{formatDate(l.fecha)}</td>
                    <td className="px-2 py-2">{l.loteId ? nombreLote(l.loteId) : '—'}</td>
                    <td className="px-2 py-2 font-semibold text-slate-900">{nombreDestinatario(l.destinatario)}</td>
                    <td className="px-2 py-2">{METODOS.find((m) => m.valor === l.metodo)?.etiqueta ?? l.metodo}</td>
                    <td className="px-2 py-2 text-right font-bold text-slate-900">{formatCurrency(l.monto, moneda)}</td>
                    <td className="px-2 py-2 text-right">
                      <Button size="xs" variant="outline" onClick={() => setComprobante(l)} leftIcon={<Printer className="w-3.5 h-3.5" />}>
                        Comprobante
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {/* Modal: Entrega individual */}
      <ModalEntrega
        objetivo={entregaPara && { ...entregaPara, lote: nombreLote(entregaPara.venta.loteId) }}
        onClose={() => setEntregaPara(null)}
        onRegistrada={(l) => {
          setEntregaPara(null);
          setComprobante(l);
        }}
        proyectoId={proyecto.id}
        moneda={moneda}
      />

      {/* Modal: Entregar a todos */}
      <ModalEntregarATodos
        venta={entregarATodosDe}
        lote={entregarATodosDe ? nombreLote(entregarATodosDe.loteId) : ''}
        onClose={() => setEntregarATodosDe(null)}
        moneda={moneda}
        onCompletado={(creadas) => {
          const lote = entregarATodosDe ? nombreLote(entregarATodosDe.loteId) : '';
          setEntregarATodosDe(null);
          setMensaje({ tipo: 'ok', texto: `Se registraron ${creadas.length} entregas de dinero del lote ${lote}.` });
        }}
      />

      {/* Modal: Comprobante oficial de entrega con DocumentoRecibo */}
      <Modal
        isOpen={Boolean(comprobante)}
        onClose={() => setComprobante(null)}
        size="3xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              Folio: {comprobante?.folio}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setComprobante(null)}>
                Cerrar
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  comprobanteRef.current &&
                  imprimirElemento(comprobanteRef.current, `Comprobante de entrega ${comprobante?.folio ?? ''}`.trim())
                }
                leftIcon={<Printer className="w-3.5 h-3.5" />}
              >
                Imprimir Comprobante
              </Button>
            </div>
          </div>
        }
      >
        {comprobante && (() => {
          const doc = storage.getDocumentoEntrega(comprobante.id);
          return doc ? (
            <div className="bg-slate-100 -m-6 p-6">
              <DocumentoRecibo ref={comprobanteRef} documento={doc} />
            </div>
          ) : (
            <p className="text-xs text-slate-500">No se pudo generar el documento de entrega.</p>
          );
        })()}
      </Modal>

      {/* Modal: Estado de cuenta de beneficiarios (documento imprimible) */}
      <Modal
        isOpen={estadoCuentaAbierto}
        onClose={() => setEstadoCuentaAbierto(false)}
        size="3xl"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="ghost" size="sm" onClick={() => setEstadoCuentaAbierto(false)}>
              Cerrar
            </Button>
            <Button
              size="sm"
              onClick={() => estadoCuentaRef.current && imprimirElemento(estadoCuentaRef.current, `Estado de cuenta de beneficiarios ${hoyISO()}`)}
              leftIcon={<Printer className="w-3.5 h-3.5" />}
            >
              Imprimir estado de cuenta
            </Button>
          </div>
        }
      >
        {estadoCuentaAbierto && (() => {
          const doc = storage.getEstadoCuentaBeneficiarios(proyecto?.id);
          return doc ? (
            <div className="bg-slate-100 -m-6 p-6">
              <DocumentoEstadoCuenta ref={estadoCuentaRef} documento={doc} />
            </div>
          ) : (
            <p className="text-xs text-slate-500">No hay un proyecto activo.</p>
          );
        })()}
      </Modal>
    </div>
  );
};

/** Registrar una entrega de dinero a una persona (liquidación), de lo que le corresponde de un lote vendido. */
const ModalEntrega: React.FC<{
  objetivo: { venta: SaldosDeVenta; saldo: SaldoPersona; lote: string } | null;
  onClose: () => void;
  onRegistrada: (l: Liquidacion) => void;
  proyectoId: string;
  moneda?: string;
}> = ({ objetivo, onClose, onRegistrada, proyectoId, moneda }) => {
  const saldo = objetivo?.saldo ?? null;
  const [monto, setMonto] = useState(0);
  const [fecha, setFecha] = useState(hoyISO());
  const [metodo, setMetodo] = useState<MetodoPago>('EFECTIVO');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (saldo) {
      setMonto(saldo.pendiente);
      setReferencia('');
      setNotas('');
      setError(null);
    }
  }, [saldo]);

  if (!saldo) return null;
  const excede = monto > saldo.pendiente + 0.001;

  const registrar = () => {
    if (monto <= 0 || excede) return;
    const r = storage.addLiquidacion({
      proyectoId,
      contratoId: objetivo!.venta.contratoId,
      loteId: objetivo!.venta.loteId,
      destinatario: saldo.persona,
      monto: Math.round(monto * 100) / 100,
      fecha,
      metodo,
      referencia: referencia.trim() || undefined,
      notas: notas.trim() || undefined,
    });
    if (r.ok && r.valor) {
      onRegistrada(r.valor);
    } else {
      setError(r.mensaje ?? 'No se pudo registrar la entrega.');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Registrar entrega a ${saldo.nombre}`}
      description={`Lote ${objetivo!.lote} · Saldo pendiente de entregar de esta venta: ${formatCurrency(saldo.pendiente, moneda)}`}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={registrar} disabled={monto <= 0 || excede}>
            Registrar entrega
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-slate-800">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Monto ($)" required error={excede ? 'No puede superar lo pendiente.' : undefined}>
            <Input
              size="sm"
              type="number"
              step="0.01"
              min="0"
              value={monto || ''}
              onChange={(e) => {
                setError(null);
                setMonto(parseFloat(e.target.value) || 0);
              }}
              leftAddon="$"
              className="font-bold text-slate-900 tabular-nums"
            />
          </FormField>

          <FormField label="Fecha" required>
            <Input size="sm" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </FormField>

          <FormField label="Método" required>
            <Select size="sm" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
              {METODOS.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.etiqueta}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Referencia">
            <Input
              size="sm"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="N.º de transferencia, cheque…"
            />
          </FormField>
        </div>

        <FormField label="Notas (opcional)">
          <Input size="sm" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observaciones de la entrega..." />
        </FormField>
      </div>
    </Modal>
  );
};

/** Entregar a todas las personas con saldo pendiente lo que les corresponde de un lote vendido. */
const ModalEntregarATodos: React.FC<{
  venta: SaldosDeVenta | null;
  lote: string;
  onClose: () => void;
  moneda?: string;
  onCompletado: (creadas: Liquidacion[]) => void;
}> = ({ venta, lote, onClose, moneda, onCompletado }) => {
  const [fecha, setFecha] = useState(hoyISO());
  const [metodo, setMetodo] = useState<MetodoPago>('TRANSFERENCIA');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!venta) return null;
  const saldos = venta.saldos.filter((s) => s.pendiente > 0);
  const totalPendiente = saldos.reduce((a, s) => a + s.pendiente, 0);

  const confirmar = () => {
    const r = storage.registrarEntregasATodos({
      contratoId: venta.contratoId,
      fecha,
      metodo,
      referencia: referencia.trim() || undefined,
      notas: notas.trim() || undefined,
    });
    if (r.ok && r.valor) {
      onCompletado(r.valor);
    } else {
      setError(r.mensaje ?? 'No se pudieron registrar las entregas.');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Entregar a todos: lote ${lote}`}
      description={`Se entregará lo pendiente de este lote a ${saldos.length} persona(s), por un total de ${formatCurrency(totalPendiente, moneda)}. Cada persona recibe su comprobante.`}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={confirmar}>
            Confirmar entregas ({formatCurrency(totalPendiente, moneda)})
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-slate-800">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Resumen de personas a liquidar */}
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 max-h-48 overflow-y-auto">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
            Desglose de entregas ({saldos.length} personas)
          </p>
          <div className="space-y-1.5 text-xs">
            {saldos.map((s) => (
              <div key={s.clave} className="flex justify-between items-center py-0.5 border-b border-slate-100 last:border-0">
                <span className="font-medium text-slate-800">{s.nombre}</span>
                <span className="font-bold text-slate-900 tabular-nums">{formatCurrency(s.pendiente, moneda)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Fecha de entrega" required>
            <Input size="sm" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </FormField>

          <FormField label="Método de pago" required>
            <Select size="sm" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
              {METODOS.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.etiqueta}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Referencia bancaria">
            <Input
              size="sm"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="ej. Transferencia masiva BAC"
            />
          </FormField>

          <FormField label="Notas generales">
            <Input
              size="sm"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Notas contables de las entregas"
            />
          </FormField>
        </div>
      </div>
    </Modal>
  );
};
