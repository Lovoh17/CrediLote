import React, { useMemo, useState } from 'react';
import { Lote } from '@/shared/types';
import { storage } from '@/shared/services/storage';
import { Button } from '@/shared/components/ui/Button';
import { DescripcionTecnica, calcularGeometriaFormulario } from '@/modules/contracts/components/DescripcionTecnica';

type DatosEditor = Parameters<typeof calcularGeometriaFormulario>[0];

interface EditorTramosLoteProps {
  lote: Lote;
  onGuardado: () => void;
}

/**
 * Corrige los tramos (y, si se tiene, la coordenada Lambert del primer punto) de un lote ya registrado.
 * Usa la misma tabla que Ingesta; al guardar, storage.guardarDescripcionTecnica redibuja el lote desde su primer punto.
 */
export const EditorTramosLote: React.FC<EditorTramosLoteProps> = ({ lote, onGuardado }) => {
  const descripcion = lote.descripcionTecnica;
  const [datos, setDatos] = useState<DatosEditor>(() => ({
    tramos: descripcion?.tramos ?? [],
    puntoPartida: descripcion?.puntoPartida,
    // Ubicado en el mapa o por el documento: el primer vértice es el punto de partida
    coordenadas: descripcion?.origen && !descripcion.puntoPartida ? [descripcion.origen] : [],
    areaM2: lote.areaM2,
    codigoLote: lote.codigoLote,
    referenciaPartida: descripcion?.referenciaPartida,
  }));
  const geometria = useMemo(() => calcularGeometriaFormulario(datos), [datos]);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const guardar = () => {
    const r = storage.guardarDescripcionTecnica(lote.id, {
      tramos: datos.tramos ?? [],
      puntoPartida: datos.puntoPartida && datos.puntoPartida.norte > 0 && datos.puntoPartida.este > 0 ? datos.puntoPartida : undefined,
      referenciaPartida: datos.referenciaPartida,
    });
    if (r.ok) onGuardado();
    else setMensaje(r.mensaje ?? 'No se pudieron guardar los tramos.');
  };

  return (
    <div className="space-y-3">
      <DescripcionTecnica datos={datos} geometria={geometria} onChange={(cambios) => setDatos((d) => ({ ...d, ...cambios }))} />
      {mensaje && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">{mensaje}</p>}
      <Button variant="primary" size="sm" className="w-full" onClick={guardar}>
        Guardar tramos
      </Button>
    </div>
  );
};
