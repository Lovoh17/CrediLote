import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Proyecto, TipoPropietario } from '@/shared/types';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { FormField } from '@/shared/components/ui/FormField';
import { Input } from '@/shared/components/ui/Input';
import { Select } from '@/shared/components/ui/Select';
import { storage } from '@/shared/services/storage';

import { hoyISO } from '@/shared/utils/formatters';
interface ProyectoFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Proyecto a editar; si no se indica, el formulario crea uno nuevo. */
  proyecto?: Proyecto;
  onGuardado: (proyectoId: string) => void;
}

/** Alta, edición y eliminación de proyectos (plan 04.3, fase 8.1). */
export const ProyectoFormModal: React.FC<ProyectoFormModalProps> = ({
  isOpen,
  onClose,
  proyecto,
  onGuardado,
}) => {
  const editando = Boolean(proyecto);
  const [nombre, setNombre] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [moneda, setMoneda] = useState('USD');
  const [lat, setLat] = useState('13.6929');
  const [lng, setLng] = useState('-89.2182');
  const [tipoPropietario, setTipoPropietario] = useState<TipoPropietario>('PROPIO');
  const [representante, setRepresentante] = useState('');
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [destinoLotes, setDestinoLotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setNombre(proyecto?.nombre ?? '');
    setUbicacion(proyecto && proyecto.ubicacion !== 'Ubicación no especificada' ? proyecto.ubicacion : '');
    setMoneda(proyecto?.moneda ?? 'USD');
    setLat(String(proyecto?.centroMapa.lat ?? 13.6929));
    setLng(String(proyecto?.centroMapa.lng ?? -89.2182));
    setTipoPropietario(proyecto?.tipoPropietario ?? 'PROPIO');
    setRepresentante(proyecto?.representante ?? '');
    setConfirmarEliminar(false);
    setDestinoLotes('');
    setError(null);
  }, [isOpen, proyecto]);

  const otrosProyectos = storage.getProyectos().filter((p) => p.id !== proyecto?.id);
  const lotesDelProyecto = proyecto ? storage.contarLotesDeProyecto(proyecto.id) : 0;

  const guardar = () => {
    if (!nombre.trim()) return;
    const datos = {
      nombre: nombre.trim(),
      ubicacion: ubicacion.trim() || 'Ubicación no especificada',
      moneda,
      centroMapa: { lat: parseFloat(lat) || 13.6929, lng: parseFloat(lng) || -89.2182 },
      tipoPropietario,
      representante: tipoPropietario === 'SUCESION' ? representante.trim() || undefined : undefined,
    };
    if (proyecto) {
      storage.updateProyecto({ ...proyecto, ...datos });
      onGuardado(proyecto.id);
    } else {
      const nuevo: Proyecto = {
        id: `proj-${Date.now()}`,
        zoomDefault: 16,
        createdAt: hoyISO(),
        ...datos,
      };
      storage.addProyecto(nuevo);
      onGuardado(nuevo.id);
    }
    onClose();
  };

  const eliminar = () => {
    if (!proyecto) return;
    const r = storage.deleteProyecto(proyecto.id, lotesDelProyecto > 0 ? destinoLotes || undefined : undefined);
    if (!r.ok) {
      setError(r.mensaje ?? 'No se pudo eliminar el proyecto.');
      return;
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editando ? 'Editar proyecto' : 'Crear Nuevo Proyecto / Lotificación'}
      description={
        editando
          ? 'Modifique los datos generales del proyecto territorial.'
          : 'Ingrese los datos generales para delimitar un nuevo desarrollo de terrenos.'
      }
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={guardar} disabled={!nombre.trim()}>
            {editando ? 'Guardar cambios' : 'Guardar Proyecto'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-slate-800">
        <FormField label="Nombre del proyecto" required>
          <Input
            size="sm"
            type="text"
            placeholder="ej. Residencial Campestre El Roble"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </FormField>

        <FormField label="Ubicación geográfica" helpText="Municipio, departamento o referencia regional">
          <Input
            size="sm"
            type="text"
            placeholder="ej. El Carmen, La Unión Sur"
            value={ubicacion}
            onChange={(e) => setUbicacion(e.target.value)}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Propietario">
            <Select
              size="sm"
              value={tipoPropietario}
              onChange={(e) => setTipoPropietario(e.target.value as TipoPropietario)}
            >
              <option value="PROPIO">Propio</option>
              <option value="SUCESION">Sucesión (con beneficiarios)</option>
            </Select>
          </FormField>

          <FormField label="Moneda de operación">
            <Select size="sm" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
              <option value="USD">Dólares (USD)</option>
              <option value="HNL">Lempiras (HNL)</option>
              <option value="MXN">Pesos (MXN)</option>
              <option value="GTQ">Quetzales (GTQ)</option>
            </Select>
          </FormField>
        </div>

        {tipoPropietario === 'SUCESION' && (
          <FormField
            label="Representante que firma"
            helpText="Los beneficiarios y sus porcentajes se configuran en el módulo Beneficiarios."
          >
            <Input
              size="sm"
              type="text"
              placeholder="Nombre de quien firma en nombre de la sucesión"
              value={representante}
              onChange={(e) => setRepresentante(e.target.value)}
            />
          </FormField>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Latitud central (GPS)">
            <Input
              size="sm"
              type="text"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="font-mono tabular-nums"
            />
          </FormField>
          <FormField label="Longitud central (GPS)">
            <Input
              size="sm"
              type="text"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="font-mono tabular-nums"
            />
          </FormField>
        </div>

        {editando && (
          <div className="pt-3 mt-2 border-t border-slate-200">
            {!confirmarEliminar ? (
              <button
                type="button"
                onClick={() => setConfirmarEliminar(true)}
                className="text-xs font-medium text-red-600 hover:text-red-700 flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Eliminar este proyecto
              </button>
            ) : (
              <div className="p-3 bg-red-50/80 border border-red-200 rounded-lg space-y-2">
                <p className="text-xs text-red-800 font-medium">
                  {lotesDelProyecto > 0
                    ? `Este proyecto tiene ${lotesDelProyecto} lote(s). Elija a qué proyecto moverlos con sus contratos, gastos y repartos:`
                    : 'El proyecto no tiene lotes. Se eliminará junto con su lista de beneficiarios.'}
                </p>
                {lotesDelProyecto > 0 && (
                  <Select
                    size="sm"
                    value={destinoLotes}
                    onChange={(e) => setDestinoLotes(e.target.value)}
                  >
                    <option value="">— Seleccione el proyecto destino —</option>
                    {otrosProyectos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </Select>
                )}
                {error && <p className="text-[11px] text-red-700 font-medium">{error}</p>}
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={eliminar}
                    disabled={lotesDelProyecto > 0 && !destinoLotes}
                  >
                    Eliminar definitivamente
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmarEliminar(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
