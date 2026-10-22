import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { Plus, Trash2, CheckCircle, AlertTriangle, XCircle, MapPin } from 'lucide-react';
import { ExtraerDatosPromesaResult } from '@/shared/types';
import { COLORES_ESTADO_LOTE, crearMarcadorLote } from '@/shared/components/map/marcadorLote';
import {
  lambertElSalvadorToWGS84,
  calcularPoligonal,
  areaPoligonoWGS84,
  centroidePoligono,
  evaluarGeometria,
  esPuntoLambertValido,
  dentroDeElSalvador,
  AvisoGeometria,
  CoordenadaWGS84,
  ResultadoPoligonal,
  TramoRumbo,
} from '@/shared/utils/geoElSalvador';

/** Origen cualquiera dentro del país, solo para medir cierre y área de tramos sin ubicación. */
const ORIGEN_REFERENCIA: CoordenadaWGS84 = { lat: 13.7, lng: -89.2 };

type DatosGeometria = Pick<
  ExtraerDatosPromesaResult,
  'puntoPartida' | 'tramos' | 'coordenadas' | 'areaM2' | 'codigoLote' | 'referenciaPartida' | 'tramosDeclarados'
>;

export interface GeometriaFormulario {
  /** Vértices finales que se guardarán en el lote. */
  vertices: CoordenadaWGS84[];
  /** Primer punto (donde empieza el tramo 1) en WGS84, si el documento trae su coordenada. */
  origen: CoordenadaWGS84 | null;
  poligonal: ResultadoPoligonal | null;
  avisos: AvisoGeometria[];
  /** true si hay advertencias o errores: el usuario debe aceptarlos explícitamente antes de confirmar (RN-G2, RN-G3). */
  requiereConfirmacion: boolean;
}

/**
 * Calcula la geometría del formulario: si hay punto de partida Lambert y tramos, la poligonal (RN-G2);
 * si no, las coordenadas WGS84 directas. Evalúa cierre y área (RN-G2, RN-G3).
 */
export function calcularGeometriaFormulario(datos: DatosGeometria): GeometriaFormulario {
  const tramos = datos.tramos ?? [];
  const coordenadas = datos.coordenadas ?? [];
  // El punto de partida es siempre el primer punto con coordenadas, aunque el documento no lo diga: el punto
  // Lambert o, si no hay, la primera latitud/longitud.
  const origen = esPuntoLambertValido(datos.puntoPartida)
    ? lambertElSalvadorToWGS84(datos.puntoPartida.este, datos.puntoPartida.norte)
    : tramos.length > 0 && coordenadas.length > 0 && dentroDeElSalvador(coordenadas[0])
    ? coordenadas[0]
    : null;

  let vertices: CoordenadaWGS84[] = [];
  let poligonal: ResultadoPoligonal | null = null;

  // Sin punto de partida no se dibuja nada (RN-G2), pero el cierre y el área se revisan igual con un origen
  // de referencia: así se detectan tramos mal leídos aunque el lote todavía no tenga ubicación.
  let poligonalSinUbicar: ResultadoPoligonal | null = null;

  if (origen && tramos.length > 0) {
    poligonal = calcularPoligonal(origen, tramos);
    vertices = poligonal.vertices;
  } else {
    // Sin tramos: polígono por coordenadas de los vértices (p. ej. la tabla Lambert del plano)
    vertices = coordenadas;
    if (!origen && tramos.length >= 3) poligonalSinUbicar = calcularPoligonal(ORIGEN_REFERENCIA, tramos);
  }

  const avisos: AvisoGeometria[] = [];
  if (origen && tramos.length === 0 && vertices.length < 3) {
    avisos.push({
      nivel: 'advertencia',
      mensaje: 'Solo hay punto de partida: el lote se registrará sin polígono hasta agregar los tramos.',
    });
  }

  if (poligonalSinUbicar && vertices.length < 3) {
    avisos.push(
      {
        nivel: 'advertencia',
        mensaje:
          `Se leyeron ${tramos.length} tramos, pero el documento no trae las coordenadas del primer punto` +
          `${datos.referenciaPartida ? ` (${datos.referenciaPartida})` : ''}, donde empieza el tramo 1. Puede escribir aquí su coordenada Lambert ` +
          '(del plano del CNR) o registrar sin dibujo: los tramos se guardan y el lote se ubica después en Cartografía.',
      },
      ...evaluarGeometria({ tieneTramos: true, ...poligonalSinUbicar }, datos.areaM2)
    );
  }

  if (vertices.length >= 3) {
    avisos.push(
      ...evaluarGeometria(
        {
          tieneTramos: !!poligonal,
          errorCierreM: poligonal?.errorCierreM ?? 0,
          precision: poligonal?.precision ?? Infinity,
          areaM2: poligonal?.areaM2 ?? areaPoligonoWGS84(vertices),
        },
        datos.areaM2
      )
    );
  } else if (vertices.length > 0) {
    avisos.push({ nivel: 'advertencia', mensaje: 'Se necesitan al menos 3 vértices para formar el polígono.' });
  }

  return {
    vertices: vertices.length >= 3 ? vertices : [],
    origen,
    poligonal,
    avisos,
    requiereConfirmacion: avisos.some((a) => a.nivel === 'error' || a.nivel === 'advertencia'),
  };
}

interface DescripcionTecnicaProps {
  datos: DatosGeometria;
  geometria: GeometriaFormulario;
  onChange: (cambios: Pick<ExtraerDatosPromesaResult, 'puntoPartida' | 'tramos'>) => void;
}

const TRAMO_VACIO: TramoRumbo = { inicio: 'N', grados: 0, minutos: 0, segundos: 0, fin: 'E', distancia: 0 };

const inputBase =
  'w-full text-[11px] border border-slate-300 rounded px-1.5 py-1 focus:ring-1 focus:ring-emerald-500 focus:outline-none font-mono';
const selectBase = `${inputBase} min-w-[3rem] px-1 bg-white`;

export const DescripcionTecnica: React.FC<DescripcionTecnicaProps> = ({ datos, geometria, onChange }) => {
  const tramos = datos.tramos ?? [];
  const punto = datos.puntoPartida ?? { norte: 0, este: 0 };

  const actualizarTramo = (indice: number, cambios: Partial<TramoRumbo>) => {
    const nuevos = tramos.map((t, i) => (i === indice ? { ...t, ...cambios } : t));
    onChange({ puntoPartida: datos.puntoPartida, tramos: nuevos });
  };

  const actualizarPunto = (campo: 'norte' | 'este', valor: number) => {
    onChange({ puntoPartida: { ...punto, [campo]: valor }, tramos });
  };

  const numero = (valor: string) => {
    const n = parseFloat(valor);
    return Number.isFinite(n) ? n : 0;
  };

  return (
    <div className="mt-3 space-y-3">
      {/* Punto de partida */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
        <div>
          <label className="text-[11px] font-medium text-slate-700 block mb-1">Mojón 1 · Norte (Lambert, m)</label>
          <input
            type="number"
            step="0.01"
            value={punto.norte || ''}
            onChange={(e) => actualizarPunto('norte', numero(e.target.value))}
            placeholder="250000.00"
            className={inputBase}
          />
        </div>
        <div>
          <label className="text-[11px] font-medium text-slate-700 block mb-1">Mojón 1 · Este (Lambert, m)</label>
          <input
            type="number"
            step="0.01"
            value={punto.este || ''}
            onChange={(e) => actualizarPunto('este', numero(e.target.value))}
            placeholder="580000.00"
            className={inputBase}
          />
        </div>
        <div className="text-[11px] text-slate-500 pb-1">
          {geometria.origen ? (
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
              {geometria.origen.lat.toFixed(6)}, {geometria.origen.lng.toFixed(6)}
            </span>
          ) : datos.puntoPartida ? (
            <span className="text-amber-700">Fuera del rango Lambert de El Salvador</span>
          ) : (
            <span>Sin punto de partida</span>
          )}
        </div>
      </div>

      {/* Tabla de tramos */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="max-h-64 overflow-auto">
          <table className="min-w-[500px] w-full text-[11px]">
            <thead className="bg-slate-50 text-slate-600 sticky top-0">
              <tr>
                <th className="px-2 py-1 text-left">#</th>
                <th className="px-1 py-1">N/S</th>
                <th className="px-1 py-1">Grados</th>
                <th className="px-1 py-1">Min</th>
                <th className="px-1 py-1">Seg</th>
                <th className="px-1 py-1">E/O</th>
                <th className="px-1 py-1">Distancia (m)</th>
                <th className="px-1 py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tramos.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-3 text-center text-slate-400">
                    Sin tramos. Agréguelos para trazar el polígono desde el mojón 1.
                  </td>
                </tr>
              )}
              {tramos.map((t, i) => (
                <tr key={i}>
                  <td className="px-2 py-1 text-slate-500">{i + 1}</td>
                  <td className="px-1 py-1 min-w-[3.25rem]">
                    <select
                      value={t.inicio}
                      onChange={(e) => actualizarTramo(i, { inicio: e.target.value as 'N' | 'S' })}
                      className={selectBase}
                    >
                      <option value="N">N</option>
                      <option value="S">S</option>
                    </select>
                  </td>
                  <td className="px-1 py-1 w-16">
                    <input type="number" value={t.grados} onChange={(e) => actualizarTramo(i, { grados: numero(e.target.value) })} className={`${inputBase} min-w-[3rem]`} />
                  </td>
                  <td className="px-1 py-1 w-14">
                    <input type="number" value={t.minutos} onChange={(e) => actualizarTramo(i, { minutos: numero(e.target.value) })} className={`${inputBase} min-w-[2.75rem]`} />
                  </td>
                  <td className="px-1 py-1 w-14">
                    <input type="number" value={t.segundos} onChange={(e) => actualizarTramo(i, { segundos: numero(e.target.value) })} className={`${inputBase} min-w-[2.75rem]`} />
                  </td>
                  <td className="px-1 py-1 min-w-[3.25rem]">
                    <select
                      value={t.fin}
                      onChange={(e) => actualizarTramo(i, { fin: e.target.value as 'E' | 'W' })}
                      className={selectBase}
                    >
                      <option value="E">E</option>
                      <option value="W">O</option>
                    </select>
                  </td>
                  <td className="px-1 py-1 w-24">
                    <input
                      type="number"
                      step="0.01"
                      value={t.distancia}
                      onChange={(e) => actualizarTramo(i, { distancia: numero(e.target.value) })}
                      className={inputBase}
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => onChange({ puntoPartida: datos.puntoPartida, tramos: tramos.filter((_, j) => j !== i) })}
                      className="p-1 text-slate-400 hover:text-rose-600"
                      title="Eliminar tramo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-slate-50 px-2 py-1.5 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onChange({ puntoPartida: datos.puntoPartida, tramos: [...tramos, { ...TRAMO_VACIO }] })}
            className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar tramo
          </button>
          {datos.tramosDeclarados ? (
            <span
              className={`text-[11px] font-medium ${tramos.length < datos.tramosDeclarados ? 'text-rose-600' : 'text-slate-500'}`}
              title={tramos.length < datos.tramosDeclarados ? 'Puede faltar una página del PDF' : undefined}
            >
              {tramos.length} de {datos.tramosDeclarados} tramos leídos
            </span>
          ) : null}
          {geometria.poligonal && (
            <span className="text-[11px] text-slate-500">
              {tramos.length} tramos · perímetro {geometria.poligonal.perimetroM.toFixed(2)} m
            </span>
          )}
        </div>
      </div>

      {/* Avisos de cierre y área */}
      {geometria.avisos.length > 0 && (
        <ul className="space-y-1">
          {geometria.avisos.map((a, i) => (
            <li
              key={i}
              className={`text-[11px] flex items-start gap-1.5 px-2 py-1 rounded ${
                a.nivel === 'ok'
                  ? 'bg-emerald-50 text-emerald-800'
                  : a.nivel === 'advertencia'
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-rose-50 text-rose-800'
              }`}
            >
              {a.nivel === 'ok' ? (
                <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
              ) : a.nivel === 'advertencia' ? (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              ) : (
                <XCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
              )}
              {a.mensaje}
            </li>
          ))}
        </ul>
      )}

      <PoligonoPreview vertices={geometria.vertices} origen={geometria.origen} etiqueta={datos.codigoLote} />
    </div>
  );
};

/** Mini mapa satelital con el polígono calculado, para verificar antes de confirmar. */
export const PoligonoPreview: React.FC<{
  vertices: CoordenadaWGS84[];
  origen: CoordenadaWGS84 | null;
  etiqueta?: string;
}> = ({ vertices, origen, etiqueta }) => {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const capaRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return;
    const mapa = L.map(contenedorRef.current, { center: [13.6929, -89.2182], zoom: 8, zoomControl: true, maxZoom: 20 });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri',
      maxNativeZoom: 18, // más allá se amplía la última imagen en lugar de mostrar gris
      maxZoom: 20,
    }).addTo(mapa);
    capaRef.current = L.layerGroup().addTo(mapa);
    mapaRef.current = mapa;
    return () => {
      mapa.remove();
      mapaRef.current = null;
    };
  }, []);

  const clave = useMemo(() => JSON.stringify({ vertices, origen, etiqueta }), [vertices, origen, etiqueta]);

  useEffect(() => {
    const mapa = mapaRef.current;
    const capa = capaRef.current;
    if (!mapa || !capa) return;
    capa.clearLayers();

    if (vertices.length >= 3) {
      const poligono = L.polygon(
        vertices.map((v) => [v.lat, v.lng] as L.LatLngTuple),
        { color: '#F59E0B', weight: 3, fillOpacity: 0.3 }
      ).addTo(capa);
      const centro = centroidePoligono(vertices);
      if (centro) {
        crearMarcadorLote([centro.lat, centro.lng], {
          codigo: etiqueta || 'Lote',
          color: COLORES_ESTADO_LOTE.RESERVADO,
          destacado: true,
        }).addTo(capa);
      }
      mapa.fitBounds(poligono.getBounds(), { padding: [30, 30], maxZoom: 20 });
    } else if (origen) {
      L.circleMarker([origen.lat, origen.lng], { radius: 6, color: '#F59E0B' })
        .bindTooltip('Mojón 1 (ubicación aproximada, sin polígono)')
        .addTo(capa);
      mapa.setView([origen.lat, origen.lng], 17);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return (
    // La altura va en el contenedor: index.css fuerza .leaflet-container { height: 100% }.
    <div className="border border-slate-200 rounded-lg overflow-hidden h-56">
      <div ref={contenedorRef} className="w-full h-full" />
    </div>
  );
};
