import React, { useEffect, useState } from 'react';
import {
  Handshake,
  Plus,
  CircleCheck,
  CircleX,
  RotateCcw,
  Upload,
  Clock,
  MapPin,
  Wallet,
  AlertTriangle,
} from 'lucide-react';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Modal } from '@/shared/components/ui/Modal';
import { Drawer } from '@/shared/components/ui/Drawer';
import { storage } from '@/shared/services/storage';
import { EstadoNegociacion, Negociacion, ResponsableGasto } from '@/shared/types';
import { formatCurrency, formatDate } from '@/shared/utils/formatters';
import { NavigationTab } from '@/app/Sidebar';
import { ETIQUETAS_CATEGORIA } from '@/modules/beneficiarios/engine/reparto';
import { CamposGasto, SelectorResponsable, BorradorGasto, borradorVacio, gastoCompleto } from '@/modules/gastos/components/EditorGastos';
import { solicitarPromesaDeNegociacion } from './promesaDesdeNegociacion';
import { solicitarEnfoqueLote } from '@/modules/cartography/enfoqueLote';

const inputBase =
  'w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white';

const COLUMNAS: { estado: EstadoNegociacion; titulo: string; descripcion: string; color: string }[] = [
  { estado: 'EN_NEGOCIACION', titulo: 'En negociación', descripcion: 'Conversaciones abiertas y sus gastos', color: 'bg-blue-500' },
  { estado: 'ESPERANDO_PROMESA', titulo: 'Esperando promesa', descripcion: 'Acuerdo cerrado: falta subir la promesa', color: 'bg-amber-500' },
  { estado: 'CONVERTIDA', titulo: 'Convertidas en venta', descripcion: 'La promesa ya se registró', color: 'bg-emerald-500' },
  { estado: 'CANCELADA', titulo: 'Canceladas', descripcion: 'No se concretó la venta', color: 'bg-slate-400' },
];

const diasDesde = (fecha: string) => {
  const [y, m, d] = fecha.split('-').map(Number);
  const inicio = new Date(y, m - 1, d).getTime();
  return Math.max(0, Math.floor((Date.now() - inicio) / 86400000));
};

interface NegociacionesViewProps {
  onNavigate: (tab: NavigationTab) => void;
}

/** Negociaciones con interesados antes de la venta (plan 04.3, fase 8.7). */
export const NegociacionesView: React.FC<NegociacionesViewProps> = ({ onNavigate }) => {
  const proyecto = storage.getActiveProyecto();
  const negociaciones = storage.getNegociaciones();
  const beneficiarios = storage.getBeneficiarios().filter((b) => b.activo);
  const lotes = storage.getLotes();

  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [cancelarId, setCancelarId] = useState<string | null>(null);

  const detalle = detalleId ? negociaciones.find((n) => n.id === detalleId) ?? null : null;
  const moneda = proyecto?.moneda;

  const nombrePersona = (r: ResponsableGasto) =>
    r.tipo === 'BENEFICIARIO' ? beneficiarios.find((b) => b.id === r.beneficiarioId)?.nombreCompleto ?? 'Beneficiario' : r.nombre;
  const descripcionLote = (n: Negociacion) =>
    (n.loteId && lotes.find((l) => l.id === n.loteId)?.codigoLote) || n.loteReferencia || 'Sin lote definido';
  const totalGastos = (n: Negociacion) =>
    storage.getGastosDeNegociacion(n.id).reduce((a, g) => a + g.monto, 0);

  const subirPromesa = (n: Negociacion) => {
    solicitarPromesaDeNegociacion(n.id);
    onNavigate('contracts');
  };

  if (!proyecto) {
    return <p className="text-sm text-slate-500">Cree un proyecto para registrar negociaciones.</p>;
  }

  const esperando = negociaciones.filter((n) => n.estado === 'ESPERANDO_PROMESA');

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500 max-w-2xl">
          Registre cada negociación con un interesado y sus gastos (gasolina, viáticos…). Al marcarla como completada queda
          <strong> esperando la promesa de venta</strong>; al subir la promesa se convierte en venta y sus gastos se reembolsan de la prima.
        </p>
        <Button onClick={() => setNuevaAbierta(true)} leftIcon={<Plus className="w-4 h-4" />}>
          Nueva negociación
        </Button>
      </div>

      {esperando.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              {esperando.length === 1
                ? `La negociación con ${esperando[0].interesadoNombre} está esperando la promesa de venta.`
                : `${esperando.length} negociaciones están esperando la promesa de venta.`}
            </span>
          </div>
          {esperando.length === 1 && (
            <Button size="sm" onClick={() => subirPromesa(esperando[0])} leftIcon={<Upload className="w-3.5 h-3.5" />}>
              Subir promesa de venta
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {COLUMNAS.map((col) => {
          const lista = negociaciones
            .filter((n) => n.estado === col.estado)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          return (
            <div key={col.estado} className="bg-slate-100/70 rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between px-1">
                <div>
                  <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${col.color}`} /> {col.titulo}
                  </p>
                  <p className="text-[11px] text-slate-500">{col.descripcion}</p>
                </div>
                <span className="text-xs font-semibold text-slate-500 bg-white rounded-full px-2 py-0.5">{lista.length}</span>
              </div>

              {lista.length === 0 && <p className="text-[11px] text-slate-400 px-1 pb-2">Ninguna</p>}

              {lista.map((n) => {
                const gastos = totalGastos(n);
                return (
                  <Card key={n.id} className="p-3 space-y-2 hover:border-slate-300 transition-colors">
                    <button onClick={() => setDetalleId(n.id)} className="w-full text-left space-y-1">
                      <p className="text-sm font-semibold text-slate-900">{n.interesadoNombre}</p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {descripcionLote(n)}
                      </p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Wallet className="w-3 h-3" /> Gastos: {formatCurrency(gastos, moneda)} · {nombrePersona(n.responsable)}
                      </p>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {n.estado === 'EN_NEGOCIACION'
                          ? `Desde ${formatDate(n.fechaInicio)} (${diasDesde(n.fechaInicio)} días)`
                          : n.estado === 'ESPERANDO_PROMESA'
                          ? `Completada ${formatDate(n.fechaCompletada)} · esperando ${diasDesde(n.fechaCompletada ?? n.fechaInicio)} días`
                          : `Cerrada ${formatDate(n.fechaCierre)}`}
                      </p>
                      {n.estado === 'CANCELADA' && (
                        <p className="text-[11px] text-slate-500">
                          Gastos asumidos por: <strong>{n.gastosAsumidosPor === 'SUCESION' ? 'la sucesión' : 'el responsable'}</strong>
                        </p>
                      )}
                    </button>

                    <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
                      {n.estado === 'EN_NEGOCIACION' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => storage.completarNegociacion(n.id)} leftIcon={<CircleCheck className="w-3.5 h-3.5 text-emerald-600" />}>
                            Completada
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setCancelarId(n.id)} leftIcon={<CircleX className="w-3.5 h-3.5" />}>
                            Cancelar
                          </Button>
                        </>
                      )}
                      {n.estado === 'ESPERANDO_PROMESA' && (
                        <>
                          <Button size="sm" onClick={() => subirPromesa(n)} leftIcon={<Upload className="w-3.5 h-3.5" />}>
                            Subir promesa
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => storage.reabrirNegociacion(n.id)} leftIcon={<RotateCcw className="w-3.5 h-3.5" />}>
                            Reabrir
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setCancelarId(n.id)} leftIcon={<CircleX className="w-3.5 h-3.5" />}>
                            Cancelar
                          </Button>
                        </>
                      )}
                      {n.estado === 'CONVERTIDA' && n.loteId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            solicitarEnfoqueLote(n.loteId!);
                            onNavigate('cartography');
                          }}
                          leftIcon={<MapPin className="w-3.5 h-3.5" />}
                        >
                          Ver en mapa
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          );
        })}
      </div>

      <ModalNuevaNegociacion
        abierto={nuevaAbierta}
        onClose={() => setNuevaAbierta(false)}
        onCreada={(id) => {
          setNuevaAbierta(false);
          setDetalleId(id);
        }}
      />

      <ModalCancelar negociacionId={cancelarId} onClose={() => setCancelarId(null)} />

      <Drawer
        isOpen={Boolean(detalle)}
        onClose={() => setDetalleId(null)}
        title={
          detalle && (
            <span className="flex items-center gap-2">
              <Handshake className="w-4 h-4 text-slate-500" /> {detalle.interesadoNombre}
            </span>
          )
        }
        description={detalle ? COLUMNAS.find((c) => c.estado === detalle.estado)?.titulo : undefined}
        size="lg"
      >
        {detalle && <DetalleNegociacion negociacion={detalle} />}
      </Drawer>
    </div>
  );
};

/** Detalle: datos editables y gastos de la negociación. */
const DetalleNegociacion: React.FC<{ negociacion: Negociacion }> = ({ negociacion }) => {
  const proyecto = storage.getActiveProyecto();
  const beneficiarios = storage.getBeneficiarios().filter((b) => b.activo);
  const lotesDisponibles = storage.getLotes().filter((l) => l.estado === 'DISPONIBLE' || l.id === negociacion.loteId);
  const gastos = storage.getGastosDeNegociacion(negociacion.id);
  const editable = negociacion.estado === 'EN_NEGOCIACION' || negociacion.estado === 'ESPERANDO_PROMESA';

  const [datos, setDatos] = useState<Negociacion>(negociacion);
  useEffect(() => setDatos(negociacion), [negociacion]);
  const hayCambios = JSON.stringify(datos) !== JSON.stringify(negociacion);

  const [nuevoGasto, setNuevoGasto] = useState<BorradorGasto | null>(null);
  const nombrePersona = (r: ResponsableGasto) =>
    r.tipo === 'BENEFICIARIO' ? beneficiarios.find((b) => b.id === r.beneficiarioId)?.nombreCompleto ?? 'Beneficiario' : r.nombre;

  const guardarGasto = () => {
    if (!nuevoGasto || !gastoCompleto(nuevoGasto)) return;
    storage.addGastoNegociacion(negociacion.id, nuevoGasto);
    setNuevoGasto(null);
  };

  const quitarGasto = (id: string) => {
    if (!window.confirm('¿Eliminar este gasto?')) return;
    const r = storage.deleteGasto(id);
    if (!r.ok && r.mensaje) window.alert(r.mensaje);
  };

  const etiquetaACargo = (a: string) => (a === 'SUCESION' ? 'Sucesión' : a === 'COMPRADOR' ? 'Comprador' : 'Responsable');

  return (
    <div className="space-y-6 text-slate-800">
      <section className="space-y-3">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Datos de la negociación</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-slate-600 block mb-0.5">Interesado</label>
            <input value={datos.interesadoNombre} disabled={!editable} onChange={(e) => setDatos({ ...datos, interesadoNombre: e.target.value })} className={inputBase} />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-600 block mb-0.5">Teléfono</label>
            <input value={datos.interesadoTelefono ?? ''} disabled={!editable} onChange={(e) => setDatos({ ...datos, interesadoTelefono: e.target.value || undefined })} className={inputBase} placeholder="+503 0000-0000" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-600 block mb-0.5">Lote (opcional)</label>
            <select value={datos.loteId ?? ''} disabled={!editable} onChange={(e) => setDatos({ ...datos, loteId: e.target.value || undefined })} className={inputBase}>
              <option value="">— Sin lote registrado —</option>
              {lotesDisponibles.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigoLote}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-600 block mb-0.5">Descripción del terreno</label>
            <input value={datos.loteReferencia ?? ''} disabled={!editable} onChange={(e) => setDatos({ ...datos, loteReferencia: e.target.value || undefined })} className={inputBase} placeholder="ej. porción norte, unos 500 m²" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-600 block mb-0.5">Precio acordado ($)</label>
            <input type="number" min="0" step="0.01" value={datos.precioAcordado ?? ''} disabled={!editable} onChange={(e) => setDatos({ ...datos, precioAcordado: parseFloat(e.target.value) || undefined })} className={inputBase} />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-600 block mb-0.5">Prima acordada ($)</label>
            <input type="number" min="0" step="0.01" value={datos.primaAcordada ?? ''} disabled={!editable} onChange={(e) => setDatos({ ...datos, primaAcordada: parseFloat(e.target.value) || undefined })} className={inputBase} />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium text-slate-600 block mb-0.5">Quién negocia</label>
            {editable ? (
              <SelectorResponsable beneficiarios={beneficiarios} value={datos.responsable} onChange={(responsable) => setDatos({ ...datos, responsable })} />
            ) : (
              <p className="text-xs">{nombrePersona(datos.responsable)}</p>
            )}
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium text-slate-600 block mb-0.5">Notas</label>
            <textarea value={datos.notas ?? ''} disabled={!editable} onChange={(e) => setDatos({ ...datos, notas: e.target.value || undefined })} rows={2} className={inputBase} />
          </div>
        </div>
        {editable && (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDatos(negociacion)} disabled={!hayCambios}>
              Descartar
            </Button>
            <Button size="sm" onClick={() => storage.actualizarNegociacion(datos)} disabled={!hayCambios || !datos.interesadoNombre.trim()}>
              Guardar datos
            </Button>
          </div>
        )}
        {negociacion.estado === 'CANCELADA' && negociacion.motivoCancelacion && (
          <p className="text-xs text-slate-600">Motivo de cancelación: {negociacion.motivoCancelacion}</p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Gastos de la negociación ({formatCurrency(gastos.reduce((a, g) => a + g.monto, 0), proyecto?.moneda)})
          </h4>
          {negociacion.estado !== 'CANCELADA' && !nuevoGasto && (
            <Button size="sm" variant="outline" onClick={() => setNuevoGasto({ ...borradorVacio(), categoria: 'COMBUSTIBLE', responsable: negociacion.responsable })} leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Agregar gasto
            </Button>
          )}
        </div>

        {nuevoGasto && (
          <div className="p-3 border border-emerald-200 bg-emerald-50/40 rounded-lg space-y-2">
            <CamposGasto gasto={nuevoGasto} beneficiarios={beneficiarios} onChange={setNuevoGasto} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setNuevoGasto(null)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={guardarGasto} disabled={!gastoCompleto(nuevoGasto)}>
                Guardar gasto
              </Button>
            </div>
          </div>
        )}

        {gastos.length === 0 && !nuevoGasto && <p className="text-xs text-slate-400">Sin gastos registrados.</p>}
        <ul className="divide-y divide-slate-100">
          {[...gastos]
            .sort((a, b) => b.fecha.localeCompare(a.fecha))
            .map((g) => {
              const reembolsado = storage.getReembolsadoDeGasto(g.id);
              return (
                <li key={g.id} className="py-2 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <p className="font-medium">{ETIQUETAS_CATEGORIA[g.categoria]}{g.descripcion ? ` · ${g.descripcion}` : ''}</p>
                    <p className="text-[11px] text-slate-500">
                      {formatDate(g.fecha)} · {nombrePersona(g.responsable)} · a cargo de {etiquetaACargo(g.aCargoDe)}
                      {reembolsado > 0 && ` · reembolsado ${formatCurrency(reembolsado, proyecto?.moneda)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold">{formatCurrency(g.monto, proyecto?.moneda)}</span>
                    {reembolsado === 0 && negociacion.estado !== 'CANCELADA' && (
                      <button onClick={() => quitarGasto(g.id)} className="text-slate-400 hover:text-rose-600" title="Eliminar gasto">
                        <CircleX className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
        </ul>
        {negociacion.estado !== 'CANCELADA' && gastos.length > 0 && (
          <p className="text-[11px] text-slate-500">
            {negociacion.estado === 'CONVERTIDA'
              ? 'Estos gastos ya pertenecen a la venta y se reembolsan de su prima.'
              : 'Al subir la promesa, estos gastos pasan a la venta y se reembolsan de la prima a su responsable.'}
          </p>
        )}
        {negociacion.estado === 'ESPERANDO_PROMESA' && (
          <Badge variant="reserved">Esperando promesa de venta</Badge>
        )}
      </section>
    </div>
  );
};

/** Alta de una negociación. */
const ModalNuevaNegociacion: React.FC<{ abierto: boolean; onClose: () => void; onCreada: (id: string) => void }> = ({
  abierto,
  onClose,
  onCreada,
}) => {
  const beneficiarios = storage.getBeneficiarios().filter((b) => b.activo);
  const lotesDisponibles = storage.getLotes().filter((l) => l.estado === 'DISPONIBLE');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [loteId, setLoteId] = useState('');
  const [referencia, setReferencia] = useState('');
  const [responsable, setResponsable] = useState<ResponsableGasto>({ tipo: 'EXTERNO', nombre: '' });
  const [notas, setNotas] = useState('');

  useEffect(() => {
    if (!abierto) return;
    setNombre('');
    setTelefono('');
    setLoteId('');
    setReferencia('');
    setNotas('');
    setResponsable(beneficiarios[0] ? { tipo: 'BENEFICIARIO', beneficiarioId: beneficiarios[0].id } : { tipo: 'EXTERNO', nombre: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const responsableOk = responsable.tipo === 'BENEFICIARIO' || responsable.nombre.trim().length > 0;

  const crear = () => {
    if (!nombre.trim() || !responsableOk) return;
    const n = storage.crearNegociacion({
      interesadoNombre: nombre.trim(),
      interesadoTelefono: telefono.trim() || undefined,
      loteId: loteId || undefined,
      loteReferencia: referencia.trim() || undefined,
      responsable,
      notas: notas.trim() || undefined,
    });
    if (n) onCreada(n.id);
  };

  return (
    <Modal
      isOpen={abierto}
      onClose={onClose}
      title="Nueva negociación"
      description="Registre con quién está negociando; los gastos se agregan en el detalle."
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={crear} disabled={!nombre.trim() || !responsableOk}>
            Crear negociación
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 text-slate-800">
        <div className="col-span-2">
          <label className="text-xs font-semibold text-slate-700 block mb-1">Nombre del interesado *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputBase} placeholder="ej. Ana Martínez" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">Teléfono</label>
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputBase} placeholder="+503 0000-0000" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">Lote (opcional)</label>
          <select value={loteId} onChange={(e) => setLoteId(e.target.value)} className={inputBase}>
            <option value="">— Sin lote registrado —</option>
            {lotesDisponibles.map((l) => (
              <option key={l.id} value={l.id}>
                {l.codigoLote}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs font-semibold text-slate-700 block mb-1">Descripción del terreno (opcional)</label>
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} className={inputBase} placeholder="ej. porción norte, unos 500 m²" />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-semibold text-slate-700 block mb-1">Quién negocia (responsable de los gastos)</label>
          <SelectorResponsable beneficiarios={beneficiarios} value={responsable} onChange={setResponsable} />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-semibold text-slate-700 block mb-1">Notas</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={inputBase} />
        </div>
      </div>
    </Modal>
  );
};

/** Cancelación: decidir quién asume los gastos (decisión del 2026-09-27). */
const ModalCancelar: React.FC<{ negociacionId: string | null; onClose: () => void }> = ({ negociacionId, onClose }) => {
  const n = negociacionId ? storage.getNegociacionById(negociacionId) : undefined;
  const [asume, setAsume] = useState<'SUCESION' | 'RESPONSABLE'>('SUCESION');
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    setAsume('SUCESION');
    setMotivo('');
  }, [negociacionId]);

  if (!n) return null;
  const gastos = storage.getGastosDeNegociacion(n.id).filter((g) => g.aCargoDe !== 'COMPRADOR');
  const total = gastos.reduce((a, g) => a + g.monto, 0);

  const confirmar = () => {
    storage.cancelarNegociacion(n.id, asume, motivo.trim() || undefined);
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Cancelar negociación con ${n.interesadoNombre}`}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Volver
          </Button>
          <Button variant="danger" size="sm" onClick={confirmar}>
            Cancelar negociación
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-slate-800">
        {gastos.length > 0 ? (
          <>
            <p className="text-xs">
              Esta negociación tiene <strong>{gastos.length} gasto(s) por {formatCurrency(total)}</strong>. ¿Quién los asume?
            </p>
            <label className="flex items-start gap-2 text-xs p-2.5 border border-slate-200 rounded-lg cursor-pointer">
              <input type="radio" checked={asume === 'SUCESION'} onChange={() => setAsume('SUCESION')} className="mt-0.5" />
              <span>
                <strong>La sucesión:</strong> se reembolsan a su responsable con la próxima prima que se cobre en el proyecto.
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs p-2.5 border border-slate-200 rounded-lg cursor-pointer">
              <input type="radio" checked={asume === 'RESPONSABLE'} onChange={() => setAsume('RESPONSABLE')} className="mt-0.5" />
              <span>
                <strong>Quien los hizo:</strong> no se reembolsan.
              </span>
            </label>
          </>
        ) : (
          <p className="text-xs">La negociación no tiene gastos.</p>
        )}
        {n.estado === 'ESPERANDO_PROMESA' && n.loteId && (
          <p className="text-[11px] text-slate-500">El lote reservado volverá a estar disponible.</p>
        )}
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">Motivo (opcional)</label>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputBase} placeholder="ej. no consiguió el financiamiento" />
        </div>
      </div>
    </Modal>
  );
};
