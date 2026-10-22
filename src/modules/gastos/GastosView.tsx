import React, { useState } from 'react';
import { Wallet, Undo2, Clock, ShoppingBag, Trash2, Plus, Pencil, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Modal } from '@/shared/components/ui/Modal';
import { FormField } from '@/shared/components/ui/FormField';
import { Input } from '@/shared/components/ui/Input';
import { MetricCard } from '@/shared/components/ui/MetricCard';
import { DataGrid, Column } from '@/shared/components/ui/DataGrid';
import { storage } from '@/shared/services/storage';
import { GastoVenta } from '@/shared/types';
import { formatCurrency, formatDate } from '@/shared/utils/formatters';
import { ETIQUETAS_CATEGORIA } from '@/modules/beneficiarios/engine/reparto';
import { CamposGasto, BorradorGasto, borradorVacio, gastoCompleto } from './components/EditorGastos';

/** Módulo de gastos de venta (plan 04.3, fase 8.3). */
export const GastosView: React.FC = () => {
  const proyecto = storage.getActiveProyecto();
  const gastos = storage.getGastos();
  const beneficiarios = storage.getBeneficiarios().filter((b) => b.activo);
  const lotes = storage.getLotes();
  const contratos = storage.getContratos().filter((c) => lotes.some((l) => l.id === c.loteId));

  const [formAbierto, setFormAbierto] = useState(false);
  const [contratoId, setContratoId] = useState('');
  const [borrador, setBorrador] = useState<BorradorGasto>(borradorVacio());
  const [referencia, setReferencia] = useState('');
  const [filtroVenta, setFiltroVenta] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Estado para modal de edición
  const [gastoParaEditar, setGastoParaEditar] = useState<GastoVenta | null>(null);
  const [borradorEdicion, setBorradorEdicion] = useState<BorradorGasto>(borradorVacio());
  const [referenciaEdicion, setReferenciaEdicion] = useState('');
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  const moneda = proyecto?.moneda;
  const nombreLote = (loteId?: string) => (loteId && lotes.find((l) => l.id === loteId)?.codigoLote) || '—';
  const nombreResponsable = (g: GastoVenta) =>
    g.responsable.tipo === 'BENEFICIARIO'
      ? storage.getBeneficiarios().find((b) => b.id === (g.responsable as { beneficiarioId: string }).beneficiarioId)
          ?.nombreCompleto ?? 'Beneficiario'
      : g.responsable.nombre;

  const conReembolso = gastos.map((g) => ({ ...g, reembolsado: storage.getReembolsadoDeGasto(g.id) }));
  const visibles = conReembolso
    .filter((g) => !filtroVenta || g.contratoId === filtroVenta)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const sucesion = conReembolso.filter((g) => g.aCargoDe === 'SUCESION');
  const totalSucesion = sucesion.reduce((a, g) => a + g.monto, 0);
  const totalReembolsado = sucesion.reduce((a, g) => a + g.reembolsado, 0);
  const totalComprador = conReembolso.filter((g) => g.aCargoDe === 'COMPRADOR').reduce((a, g) => a + g.monto, 0);

  const guardar = () => {
    if (!contratoId || !gastoCompleto(borrador)) return;
    const creado = storage.addGasto({ ...borrador, contratoId, referencia: referencia.trim() || undefined });
    if (creado) {
      setMensaje(
        'Gasto registrado. Si la prima de esa venta ya se repartió, se reembolsará con los próximos cobros.'
      );
      setBorrador(borradorVacio());
      setReferencia('');
      setFormAbierto(false);
    }
  };

  const abrirEdicion = (g: GastoVenta) => {
    setGastoParaEditar(g);
    setBorradorEdicion({
      categoria: g.categoria,
      descripcion: g.descripcion,
      monto: g.monto,
      fecha: g.fecha,
      aCargoDe: g.aCargoDe,
      responsable: g.responsable,
    });
    setReferenciaEdicion(g.referencia ?? '');
    setErrorEdicion(null);
  };

  const guardarEdicion = () => {
    if (!gastoParaEditar) return;
    const r = storage.actualizarGasto(gastoParaEditar.id, {
      ...borradorEdicion,
      referencia: referenciaEdicion.trim() || undefined,
    });
    if (r.ok) {
      setMensaje('Gasto actualizado correctamente.');
      setGastoParaEditar(null);
      setErrorEdicion(null);
    } else {
      setErrorEdicion(r.mensaje ?? 'No se pudo actualizar el gasto.');
    }
  };

  const eliminar = (g: GastoVenta) => {
    if (!window.confirm('¿Eliminar este gasto?')) return;
    const r = storage.deleteGasto(g.id);
    setMensaje(r.ok ? 'Gasto eliminado.' : r.mensaje ?? null);
  };

  const columnas: Column<(typeof conReembolso)[number]>[] = [
    { key: 'fecha', header: 'Fecha', render: (g) => <span className="tabular-nums">{formatDate(g.fecha)}</span> },
    {
      key: 'lote',
      header: 'Venta / negociación',
      render: (g) =>
        g.loteId ? (
          <span className="font-semibold text-slate-900">{nombreLote(g.loteId)}</span>
        ) : g.negociacionId ? (
          <span className="text-slate-600">
            Negociación: {storage.getNegociacionById(g.negociacionId)?.interesadoNombre ?? '—'}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'categoria',
      header: 'Categoría / detalle',
      render: (g) => (
        <div>
          <p className="font-medium text-slate-800">{ETIQUETAS_CATEGORIA[g.categoria]}</p>
          {g.descripcion && <p className="text-[11px] text-slate-500">{g.descripcion}</p>}
        </div>
      ),
    },
    { key: 'responsable', header: 'Responsable', render: (g) => nombreResponsable(g) },
    {
      key: 'aCargo',
      header: 'A cargo de',
      render: (g) =>
        g.aCargoDe === 'SUCESION' ? (
          <Badge variant="info">Sucesión</Badge>
        ) : g.aCargoDe === 'COMPRADOR' ? (
          <Badge variant="neutral">Comprador</Badge>
        ) : (
          <Badge variant="neutral">Responsable</Badge>
        ),
    },
    {
      key: 'monto',
      header: 'Monto',
      align: 'right',
      render: (g) => <span className="font-bold tabular-nums text-slate-900">{formatCurrency(g.monto, moneda)}</span>,
    },
    {
      key: 'reembolso',
      header: 'Reembolso',
      align: 'right',
      render: (g) =>
        g.aCargoDe !== 'SUCESION' ? (
          <span className="text-slate-400 text-xs">No aplica</span>
        ) : g.reembolsado >= g.monto ? (
          <Badge variant="available">Reembolsado</Badge>
        ) : g.reembolsado > 0 ? (
          <Badge variant="reserved">{formatCurrency(g.reembolsado, moneda)}</Badge>
        ) : (
          <Badge variant="neutral">Pendiente</Badge>
        ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      render: (g) =>
        g.reembolsado === 0 ? (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => abrirEdicion(g)}
              title="Editar gasto"
              className="p-1 rounded text-slate-400 hover:text-emerald-700 hover:bg-slate-100 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => eliminar(g)}
              title="Eliminar gasto"
              className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-slate-100 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : null,
    },
  ];

  if (!proyecto) {
    return <p className="text-sm text-slate-500">Cree un proyecto para registrar gastos de venta.</p>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Gastos de la sucesión" value={formatCurrency(totalSucesion, moneda)} helpText={`${sucesion.length} gastos`} icon={<Wallet className="w-4 h-4 text-emerald-600" />} />
        <MetricCard label="Reembolsado" value={formatCurrency(totalReembolsado, moneda)} helpText="Pagado a los responsables desde la prima" icon={<Undo2 className="w-4 h-4 text-blue-600" />} />
        <MetricCard label="Pendiente de reembolso" value={formatCurrency(totalSucesion - totalReembolsado, moneda)} helpText="Se cubre con los próximos cobros" icon={<Clock className="w-4 h-4 text-amber-600" />} />
        <MetricCard label="A cargo de compradores" value={formatCurrency(totalComprador, moneda)} helpText="Solo control contable" icon={<ShoppingBag className="w-4 h-4 text-slate-600" />} />
      </div>

      {mensaje && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex justify-between items-center">
          <span>{mensaje}</span>
          <button onClick={() => setMensaje(null)} className="text-emerald-700 hover:text-emerald-900 font-medium text-xs">
            Cerrar
          </button>
        </div>
      )}

      <Card>
        <CardHeader className="py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Gastos Registrados</h2>
            <p className="text-xs text-slate-500">
              Gastos de gestión, abogados, topografía, combustible o viáticos asociados a las ventas y negociaciones.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filtroVenta}
              onChange={(e) => setFiltroVenta(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="">Todas las ventas</option>
              {contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {nombreLote(c.loteId)}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => setFormAbierto((a) => !a)} leftIcon={<Plus className="w-3.5 h-3.5" />} disabled={contratos.length === 0}>
              Agregar gasto
            </Button>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          {formAbierto && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <p className="text-xs font-semibold text-slate-800">Nuevo gasto de venta</p>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                <div className="md:col-span-4">
                  <label className="text-[11px] font-medium text-slate-600 block mb-0.5">Venta a la que se asocia</label>
                  <select
                    value={contratoId}
                    onChange={(e) => setContratoId(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="">— Seleccione la venta —</option>
                    {contratos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {nombreLote(c.loteId)} · {storage.getClienteById(c.compradorId)?.nombreCompleto ?? 'Comprador'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-[11px] font-medium text-slate-600 block mb-0.5">Referencia (factura, recibo…)</label>
                  <input
                    type="text"
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              <CamposGasto gasto={borrador} beneficiarios={beneficiarios} onChange={setBorrador} />
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setFormAbierto(false)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={guardar} disabled={!contratoId || !gastoCompleto(borrador)}>
                  Guardar gasto
                </Button>
              </div>
            </div>
          )}

          <DataGrid
            columns={columnas}
            data={visibles}
            keyExtractor={(g) => g.id}
            striped
            emptyMessage={
              contratos.length === 0
                ? 'Aún no hay ventas registradas en este proyecto.'
                : 'No hay gastos registrados. Agréguelos al subir la promesa o con el botón "Agregar gasto".'
            }
          />
        </CardBody>
      </Card>

      {/* Modal: Editar Gasto no reembolsado */}
      <Modal
        isOpen={Boolean(gastoParaEditar)}
        onClose={() => setGastoParaEditar(null)}
        title="Editar Gasto de Venta"
        description="Solo se pueden modificar gastos que todavía no han sido reembolsados."
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="ghost" size="sm" onClick={() => setGastoParaEditar(null)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={guardarEdicion} disabled={!gastoCompleto(borradorEdicion)}>
              Guardar Cambios
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {errorEdicion && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorEdicion}</span>
            </div>
          )}

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1 text-slate-700">
            <p>
              <strong>Venta / Lote:</strong> {gastoParaEditar && nombreLote(gastoParaEditar.loteId)}
            </p>
          </div>

          <CamposGasto gasto={borradorEdicion} beneficiarios={beneficiarios} onChange={setBorradorEdicion} />

          <FormField label="Referencia documental (factura, recibo, comprobante)">
            <Input
              size="sm"
              type="text"
              value={referenciaEdicion}
              onChange={(e) => setReferenciaEdicion(e.target.value)}
              placeholder="ej. Factura #4029 / Ticket 882"
            />
          </FormField>
        </div>
      </Modal>
    </div>
  );
};
