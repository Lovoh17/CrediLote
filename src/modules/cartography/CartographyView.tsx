import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { storage } from '@/shared/services/storage';
import { Lote, ContratoPromesa, Cliente } from '@/shared/types';
import { centroidePoligono, calcularPoligonal } from '@/shared/utils/geoElSalvador';
import { COLORES_ESTADO_LOTE, crearMarcadorLote } from '@/shared/components/map/marcadorLote';
import { ESTADOS_LOTE } from '@/shared/theme/status';
import { consultarEnfoqueLote, limpiarEnfoqueLote } from './enfoqueLote';
import { Drawer } from '@/shared/components/ui/Drawer';
import { PropertyList, Property } from '@/shared/components/ui/PropertyList';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { formatCurrency, formatArea } from '@/shared/utils/formatters';
import { NavigationTab } from '@/app/Sidebar';
import { User, MessageSquare, Crosshair, MapPinned, X } from 'lucide-react';
import { EditorTramosLote } from './components/EditorTramosLote';

// Esri no tiene imágenes en todas partes más allá del nivel 18: a partir de ahí se amplía la última
// disponible en lugar de mostrar cuadros grises. Así se puede acercar hasta que el lote llene la vista.
const ZOOM_NATIVO_SATELITE = 18;
const ZOOM_MAXIMO = 20;
const ZOOM_ENFOQUE = 20;

/** Cómo se ubicó un lote cuya escritura solo trae rumbos y distancias (Lote.descripcionTecnica.ubicadoPor). */
const TEXTO_UBICACION: Record<string, string> = {
  LAMBERT: 'Ubicación según coordenada oficial (Lambert)',
  DOCUMENTO: 'Ubicación según la latitud y longitud del documento',
  MAPA: 'Ubicación aproximada (marcada a mano)',
};

const iconoPrimerPunto = () =>
  L.divIcon({
    className: '',
    html: '<div style="width:18px;height:18px;border-radius:9999px;background:#F59E0B;border:3px solid #fff;box-shadow:0 0 0 1px #92400E,0 1px 4px rgba(0,0,0,.4)"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

interface ResultadoUbicacion {
  codigo: string;
  errorCierreM: number;
  areaM2: number;
  areaEscrituraM2: number;
  ubicadoPor: 'LAMBERT' | 'MAPA';
}

interface CartographyViewProps {
  onNavigate: (tab: NavigationTab) => void;
}

export const CartographyView: React.FC<CartographyViewProps> = ({ onNavigate }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polygonsLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const activeProyecto = storage.getActiveProyecto();
  const lotes = storage.getLotes();

  const [selectedLoteId, setSelectedLoteId] = useState<string | null>(null);
  const selectedLote: Lote | null = selectedLoteId ? lotes.find((l) => l.id === selectedLoteId) ?? null : null;
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'DISPONIBLE' | 'RESERVADO' | 'VENDIDO'>('ALL');
  const [baseLayerType, setBaseLayerType] = useState<'satellite' | 'streets'>('satellite');
  // Lote resaltado en el mapa (seleccionado, elegido en "Ir a lote" o recién registrado)
  const [loteEnfocadoId, setLoteEnfocadoId] = useState<string | null>(() => consultarEnfoqueLote());
  const poligonosRef = useRef<Map<string, L.Polygon>>(new Map());

  // Lotes con rumbos y distancias pero sin punto de partida: se ubican marcando su primer punto
  const lotesSinUbicar = storage.getLotesSinUbicar(activeProyecto?.id);
  const [ubicandoId, setUbicandoId] = useState<string | null>(() => {
    // Desde otra vista se puede pedir ubicar un lote que todavía no tiene dibujo
    const pedido = consultarEnfoqueLote();
    const lote = pedido ? storage.getLoteById(pedido) : undefined;
    return lote && (lote.verticesPoligono?.length ?? 0) < 3 && (lote.descripcionTecnica?.tramos.length ?? 0) >= 3 ? lote.id : null;
  });
  const ubicando = ubicandoId ? lotes.find((l) => l.id === ubicandoId) ?? null : null;
  const ubicandoRef = useRef<Lote | null>(null);
  ubicandoRef.current = ubicando;
  const [mostrarLambert, setMostrarLambert] = useState(false);
  const [lambert, setLambert] = useState({ norte: '', este: '' });
  const [mensajeUbicacion, setMensajeUbicacion] = useState<string | null>(null);
  const [resultadoUbicacion, setResultadoUbicacion] = useState<ResultadoUbicacion | null>(null);
  const [editandoTramos, setEditandoTramos] = useState(false);
  // Al reubicar el lote que ya estaba resaltado, el mapa se vuelve a encuadrar en él
  const [reencuadre, setReencuadre] = useState(0);
  useEffect(() => setEditandoTramos(false), [selectedLoteId]);

  useEffect(() => {
    limpiarEnfoqueLote();
  }, []);

  const empezarUbicacion = (lote: Lote) => {
    setSelectedLoteId(null);
    setResultadoUbicacion(null);
    setMensajeUbicacion(null);
    setMostrarLambert(false);
    setLambert({ norte: '', este: '' });
    setUbicandoId(lote.id);
  };

  /** Ubica el lote desde su primer punto (clic en el mapa o coordenada Lambert) y muestra el cierre y el área. */
  const ubicarEn = (lote: Lote, punto: { lat: number; lng: number } | { norte: number; este: number }) => {
    const r = storage.ubicarLote(lote.id, punto);
    if (!r.ok || !r.valor) {
      setMensajeUbicacion(r.mensaje ?? 'No se pudo ubicar el lote.');
      return;
    }
    setMensajeUbicacion(null);
    setResultadoUbicacion({
      codigo: lote.codigoLote,
      errorCierreM: r.valor.errorCierreM,
      areaM2: r.valor.areaM2,
      areaEscrituraM2: lote.areaM2,
      ubicadoPor: 'norte' in punto ? 'LAMBERT' : 'MAPA',
    });
    setUbicandoId(null);
    if (filterStatus !== 'ALL' && lote.estado !== filterStatus) setFilterStatus('ALL');
    setLoteEnfocadoId(lote.id);
    if ('norte' in punto) setReencuadre((n) => n + 1);
  };

  const ubicarConLambert = () => {
    if (!ubicando) return;
    const norte = Number(lambert.norte.replace(/,/g, ''));
    const este = Number(lambert.este.replace(/,/g, ''));
    if (!(norte > 0) || !(este > 0)) {
      setMensajeUbicacion('Escriba la coordenada Norte y la Este del primer punto, en metros.');
      return;
    }
    ubicarEn(ubicando, { norte, este });
  };

  const lotesConPoligono = lotes.filter((l) => l.verticesPoligono && l.verticesPoligono.length >= 3);
  const lotesFiltrados = lotesConPoligono.filter((l) => filterStatus === 'ALL' || l.estado === filterStatus);

  // Firmas de contenido: storage.getLotes() devuelve un arreglo nuevo en cada render,
  // así que los efectos dependen de estas cadenas y no del arreglo.
  const firmaDibujo = JSON.stringify(
    lotesFiltrados.map((l) => [l.id, l.estado, l.codigoLote, l.nombreCompradorLabel, l.verticesPoligono])
  );
  const firmaEncuadre = useMemo(
    () => `${activeProyecto?.id}|${lotesFiltrados.map((l) => l.id).join(',')}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [firmaDibujo, activeProyecto?.id]
  );

  const enfocarLote = (id: string) => {
    const lote = lotesConPoligono.find((l) => l.id === id);
    if (!lote) return;
    if (filterStatus !== 'ALL' && lote.estado !== filterStatus) setFilterStatus('ALL');
    setLoteEnfocadoId(id);
  };

  const verTodos = () => {
    setLoteEnfocadoId(null);
    const map = mapInstanceRef.current;
    const puntos = lotesFiltrados.flatMap((l) => l.verticesPoligono.map((v) => [v.lat, v.lng] as L.LatLngTuple));
    if (map && puntos.length > 0) map.fitBounds(L.latLngBounds(puntos), { padding: [50, 50], maxZoom: 18 });
  };

  // Obtener información adicional del lote seleccionado
  const selectedContrato: ContratoPromesa | undefined = selectedLote
    ? storage.getContratoByLoteId(selectedLote.id)
    : undefined;

  const selectedCliente: Cliente | undefined = selectedLote?.compradorId
    ? storage.getClienteById(selectedLote.compradorId)
    : undefined;

  // 1. Inicializar mapa de Leaflet
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const center = activeProyecto?.centroMapa || { lat: 14.1524, lng: -87.0385 };
      const zoom = activeProyecto?.zoomDefault || 17;

      const map = L.map(mapContainerRef.current, {
        center: [center.lat, center.lng],
        zoom,
        zoomControl: true,
        maxZoom: ZOOM_MAXIMO,
      });

      // Capa satelital de Esri por defecto
      const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye',
          maxNativeZoom: ZOOM_NATIVO_SATELITE,
          maxZoom: ZOOM_MAXIMO,
        }
      );

      satelliteLayer.addTo(map);

      polygonsLayerGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 2. Manejo de cambio de capa base (Satelital vs Calles OSM)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Remover capas base existentes
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    if (baseLayerType === 'satellite') {
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed',
          maxNativeZoom: ZOOM_NATIVO_SATELITE,
          maxZoom: ZOOM_MAXIMO,
        }
      ).addTo(map);
    } else {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxNativeZoom: 19,
        maxZoom: ZOOM_MAXIMO,
      }).addTo(map);
    }
  }, [baseLayerType]);

  // 3. Dibujo de polígonos y marcadores de lotes (solo cuando cambia su contenido o el lote resaltado)
  useEffect(() => {
    if (!mapInstanceRef.current || !polygonsLayerGroupRef.current) return;
    const layerGroup = polygonsLayerGroupRef.current;
    layerGroup.clearLayers();
    poligonosRef.current.clear();

    lotesFiltrados.forEach((lote) => {
      const destacado = lote.id === loteEnfocadoId;
      const color = COLORES_ESTADO_LOTE[lote.estado] ?? COLORES_ESTADO_LOTE.DISPONIBLE;
      const latLngs = lote.verticesPoligono.map((v) => [v.lat, v.lng] as L.LatLngTuple);

      const seleccionar = () => {
        if (ubicandoRef.current) return; // al ubicar un lote, el clic marca el primer punto
        setSelectedLoteId(lote.id);
        setLoteEnfocadoId(lote.id);
      };

      // Lote resaltado: halo blanco ancho debajo del contorno de color, visible sobre cualquier fondo.
      if (destacado) {
        L.polygon(latLngs, { color: '#FFFFFF', weight: 9, opacity: 0.9, fill: false, interactive: false }).addTo(
          layerGroup
        );
      }

      const polygon = L.polygon(latLngs, {
        color,
        weight: destacado ? 4 : 3,
        fillColor: color,
        fillOpacity: destacado ? 0.25 : 0.35,
      })
        .on('click', seleccionar)
        .addTo(layerGroup);
      poligonosRef.current.set(lote.id, polygon);

      // Pin con el código del lote en el centroide: visible a cualquier zoom (RN-G3).
      const centro = centroidePoligono(lote.verticesPoligono);
      if (centro) {
        crearMarcadorLote([centro.lat, centro.lng], {
          codigo: lote.codigoLote,
          detalle: lote.estado !== 'DISPONIBLE' ? lote.nombreCompradorLabel : undefined,
          color,
          destacado,
        })
          .on('click', seleccionar)
          .addTo(layerGroup);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaDibujo, loteEnfocadoId]);

  // 4. Encuadre inicial: el lote solicitado o, si no hay, todos los lotes visibles
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const enfocado = loteEnfocadoId ? poligonosRef.current.get(loteEnfocadoId) : undefined;
    if (enfocado) {
      map.fitBounds(enfocado.getBounds(), { padding: [80, 80], maxZoom: ZOOM_ENFOQUE });
      return;
    }
    const puntos = lotesFiltrados.flatMap((l) => l.verticesPoligono.map((v) => [v.lat, v.lng] as L.LatLngTuple));
    if (puntos.length > 0) {
      map.fitBounds(L.latLngBounds(puntos), { padding: [50, 50], maxZoom: 18 });
    } else if (activeProyecto) {
      map.setView([activeProyecto.centroMapa.lat, activeProyecto.centroMapa.lng], activeProyecto.zoomDefault || 17);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaEncuadre]);

  // 6. Modo "Ubicar en el mapa": la forma del lote sigue al cursor y el clic fija su primer punto
  useEffect(() => {
    const map = mapInstanceRef.current;
    const lote = ubicando;
    const tramos = lote?.descripcionTecnica?.tramos ?? [];
    if (!map || !lote || tramos.length < 3) return;

    const contenedor = map.getContainer();
    contenedor.style.cursor = 'crosshair';
    if (activeProyecto) map.setView([activeProyecto.centroMapa.lat, activeProyecto.centroMapa.lng], Math.max(map.getZoom(), 17));

    const vista = L.polygon([], { color: '#F59E0B', weight: 2, dashArray: '6 4', fillColor: '#F59E0B', fillOpacity: 0.15, interactive: false }).addTo(map);
    const inicio = L.marker([0, 0], { icon: iconoPrimerPunto(), interactive: false });
    let cuadro: number | null = null;

    const mover = (e: L.LeafletMouseEvent) => {
      if (cuadro !== null) return;
      cuadro = requestAnimationFrame(() => {
        cuadro = null;
        const { vertices } = calcularPoligonal({ lat: e.latlng.lat, lng: e.latlng.lng }, tramos);
        vista.setLatLngs(vertices.map((v) => [v.lat, v.lng] as L.LatLngTuple));
        inicio.setLatLng(e.latlng);
        if (!map.hasLayer(inicio)) inicio.addTo(map);
      });
    };
    const clic = (e: L.LeafletMouseEvent) => ubicarEn(lote, { lat: e.latlng.lat, lng: e.latlng.lng });

    map.on('mousemove', mover);
    map.on('click', clic);
    return () => {
      map.off('mousemove', mover);
      map.off('click', clic);
      if (cuadro !== null) cancelAnimationFrame(cuadro);
      vista.remove();
      inicio.remove();
      contenedor.style.cursor = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ubicandoId]);

  // 7. Lote resaltado y ubicado a mano: su primer punto se puede arrastrar para ajustar (con el panel cerrado,
  // porque el panel cubre el mapa)
  const loteResaltado = loteEnfocadoId ? lotes.find((l) => l.id === loteEnfocadoId) : undefined;
  const origenAjustable =
    loteResaltado?.descripcionTecnica?.ubicadoPor === 'MAPA' ? loteResaltado.descripcionTecnica.origen : undefined;
  useEffect(() => {
    const map = mapInstanceRef.current;
    const lote = loteResaltado;
    if (!map || !lote || !origenAjustable || ubicandoId || selectedLoteId) return;
    const marcador = L.marker([origenAjustable.lat, origenAjustable.lng], {
      icon: iconoPrimerPunto(),
      draggable: true,
      title: 'Arrastre para ajustar el primer punto del lote',
      zIndexOffset: 1000,
    }).addTo(map);
    marcador.on('dragend', () => {
      const p = marcador.getLatLng();
      ubicarEn(lote, { lat: p.lat, lng: p.lng });
    });
    return () => {
      marcador.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loteResaltado?.id, origenAjustable?.lat, origenAjustable?.lng, ubicandoId, selectedLoteId]);

  // 5. Al elegir un lote en "Ir a lote" (o al hacer clic), acercar el mapa a ese lote
  useEffect(() => {
    const map = mapInstanceRef.current;
    const poligono = loteEnfocadoId ? poligonosRef.current.get(loteEnfocadoId) : undefined;
    if (map && poligono) {
      map.flyToBounds(poligono.getBounds(), { padding: [80, 80], maxZoom: ZOOM_ENFOQUE, duration: 0.8 });
    }
  }, [loteEnfocadoId, reencuadre]);

  return (
    <div className="h-[calc(100vh-8.5rem)] flex flex-col relative rounded-xl overflow-hidden border border-slate-200 bg-white">
      {/* Top Map Control Bar */}
      <div className="min-h-14 py-2 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 flex flex-wrap items-center justify-between gap-2 z-10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filtrar:</span>
          <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-lg">
            <button
              onClick={() => setFilterStatus('ALL')}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterStatus === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({lotes.length})
            </button>
            {(['DISPONIBLE', 'RESERVADO', 'VENDIDO'] as const).map((estado) => {
              const cfg = ESTADOS_LOTE[estado];
              const isSelected = filterStatus === estado;
              return (
                <button
                  key={estado}
                  onClick={() => setFilterStatus(estado)}
                  className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                    isSelected ? cfg.filterButtonActiveClass : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cfg.label}s
                </button>
              );
            })}
          </div>
        </div>

        {/* Ir a un lote concreto */}
        <div className="flex items-center gap-2">
          <label htmlFor="ir-a-lote" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Ir a lote:
          </label>
          <select
            id="ir-a-lote"
            value={loteEnfocadoId ?? ''}
            onChange={(e) => (e.target.value ? enfocarLote(e.target.value) : verTodos())}
            className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white max-w-[220px] focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">— Seleccione —</option>
            {lotesConPoligono.map((l) => (
              <option key={l.id} value={l.id}>
                {l.codigoLote}
                {l.nombreCompradorLabel && l.estado !== 'DISPONIBLE' ? ` · ${l.nombreCompradorLabel}` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={verTodos}
            className="text-xs px-2.5 py-1.5 rounded-lg font-medium border border-slate-300 text-slate-700 hover:bg-slate-100"
          >
            Ver todos
          </button>
        </div>

        {/* Base Layer Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Capa:</span>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setBaseLayerType('satellite')}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                baseLayerType === 'satellite'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Satelital
            </button>
            <button
              onClick={() => setBaseLayerType('streets')}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                baseLayerType === 'streets'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mapa Vectorial
            </button>
          </div>
        </div>
      </div>

      {/* Empty State Banner if no lots */}
      {lotes.length === 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-white/95 backdrop-blur-sm border border-slate-200 shadow-lg rounded-xl px-5 py-3 text-center max-w-md">
          <p className="text-xs font-bold text-slate-800">No hay parcelas registradas en este proyecto</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Registre una promesa de venta o agregue lotes para ver los polígonos delimitados en el mapa.
          </p>
          <button
            onClick={() => onNavigate('contracts')}
            className="mt-2 text-xs font-semibold text-emerald-600 hover:text-emerald-700 underline"
          >
            Registrar Promesa de Venta &rarr;
          </button>
        </div>
      )}

      {/* Lotes sin ubicar (solo rumbos y distancias, sin coordenada del primer punto) */}
      {!ubicando && lotesSinUbicar.length > 0 && (
        <div className="absolute top-16 left-4 z-20 w-72 max-w-[calc(100%-2rem)] bg-white/95 backdrop-blur-sm border border-amber-300 shadow-lg rounded-xl p-3">
          <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
            <MapPinned className="w-4 h-4" />
            {lotesSinUbicar.length} lote{lotesSinUbicar.length === 1 ? '' : 's'} sin ubicar en el mapa
          </p>
          <p className="text-[11px] text-slate-600 mt-0.5">Su escritura trae la forma, pero no dónde empieza.</p>
          <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
            {lotesSinUbicar.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">
                  <span className="font-semibold text-slate-800">{l.codigoLote}</span>
                  {l.nombreCompradorLabel ? <span className="text-slate-500"> · {l.nombreCompradorLabel}</span> : null}
                </span>
                <button
                  onClick={() => empezarUbicacion(l)}
                  className="shrink-0 px-2 py-0.5 rounded-md border border-amber-400 text-amber-800 font-semibold hover:bg-amber-50"
                >
                  Ubicar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Modo ubicar: instrucciones, coordenada Lambert y cancelar */}
      {ubicando && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 w-[26rem] max-w-[calc(100%-2rem)] bg-white/95 backdrop-blur-sm border border-amber-300 shadow-lg rounded-xl p-3">
          <div className="flex items-start gap-2">
            <Crosshair className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-bold text-slate-900">Ubicando {ubicando.codigoLote}</p>
              <p className="text-[11px] text-slate-600">
                Haga clic en el {ubicando.descripcionTecnica?.referenciaPartida ?? 'primer punto'} del terreno (donde empieza el
                tramo 1). La figura sigue al cursor para que la haga coincidir con la foto.
              </p>
            </div>
            <button onClick={() => setUbicandoId(null)} className="p-1 rounded hover:bg-slate-100" aria-label="Cancelar">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          {mostrarLambert ? (
            <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
              <label className="text-[11px] text-slate-600">
                Norte (m)
                <input
                  value={lambert.norte}
                  onChange={(e) => setLambert({ ...lambert, norte: e.target.value })}
                  inputMode="decimal"
                  placeholder="242964.01"
                  className="mt-0.5 w-full text-xs border border-slate-300 rounded-md px-2 py-1"
                />
              </label>
              <label className="text-[11px] text-slate-600">
                Este (m)
                <input
                  value={lambert.este}
                  onChange={(e) => setLambert({ ...lambert, este: e.target.value })}
                  inputMode="decimal"
                  placeholder="609547.57"
                  className="mt-0.5 w-full text-xs border border-slate-300 rounded-md px-2 py-1"
                />
              </label>
              <Button variant="primary" size="sm" onClick={ubicarConLambert}>
                Ubicar
              </Button>
            </div>
          ) : (
            <button onClick={() => setMostrarLambert(true)} className="mt-2 text-[11px] font-semibold text-emerald-700 hover:underline">
              Tengo la coordenada Lambert del plano del CNR
            </button>
          )}
          {mensajeUbicacion && <p className="mt-2 text-[11px] text-rose-700">{mensajeUbicacion}</p>}
        </div>
      )}

      {/* Resultado de la ubicación: cierre y área */}
      {resultadoUbicacion && !ubicando && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 w-[26rem] max-w-[calc(100%-2rem)] bg-white/95 backdrop-blur-sm border border-emerald-300 shadow-lg rounded-xl p-3 pr-9 text-xs">
          <button onClick={() => setResultadoUbicacion(null)} className="absolute top-2 right-2 p-1 rounded hover:bg-slate-100" aria-label="Cerrar">
            <X className="w-4 h-4 text-slate-500" />
          </button>
          <p className="font-bold text-emerald-900">{resultadoUbicacion.codigo} quedó ubicado en el mapa</p>
          <p className="text-slate-700 mt-0.5">
            Cierre: {resultadoUbicacion.errorCierreM.toFixed(3)} m · Área calculada {resultadoUbicacion.areaM2.toFixed(2)} m²
            {resultadoUbicacion.areaEscrituraM2 > 0 &&
              ` (escritura ${resultadoUbicacion.areaEscrituraM2.toFixed(2)} m², ${(
                (Math.abs(resultadoUbicacion.areaM2 - resultadoUbicacion.areaEscrituraM2) / resultadoUbicacion.areaEscrituraM2) *
                100
              ).toFixed(2)} %)`}
          </p>
          <p className="text-slate-500 mt-0.5">
            {resultadoUbicacion.ubicadoPor === 'MAPA'
              ? 'Ubicación aproximada: arrastre el punto naranja de la esquina para ajustarla.'
              : 'Ubicación según la coordenada oficial del plano.'}
          </p>
        </div>
      )}

      {/* Map Container */}
      <div ref={mapContainerRef} className="flex-1 w-full h-full z-0" />

      {/* Slide-out Drawer for Lot Detail */}
      <Drawer
        isOpen={Boolean(selectedLote)}
        onClose={() => setSelectedLoteId(null)}
        title={
          selectedLote && (
            <div className="flex items-center gap-2">
              <span>{selectedLote.codigoLote} - {selectedLote.bloqueManzana}</span>
              <Badge estadoLote={selectedLote.estado} dot />
            </div>
          )
        }
        description={activeProyecto?.nombre}
        footer={
          selectedLote?.estado === 'VENDIDO' ? (
            <div className="flex items-center gap-2 w-full justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedLoteId(null);
                  onNavigate('finance');
                }}
              >
                Ver Plan Financiero
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setSelectedLoteId(null);
                  onNavigate('payments');
                }}
              >
                Registrar Cobro
              </Button>
            </div>
          ) : selectedLote?.estado === 'DISPONIBLE' ? (
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              onClick={() => {
                setSelectedLoteId(null);
                onNavigate('contracts');
              }}
            >
              Formalizar Promesa de Venta
            </Button>
          ) : undefined
        }
      >
        {selectedLote && (
          <div className="space-y-6">
            {/* Titular del Lote (Si está vendido) */}
            {selectedLote.estado === 'VENDIDO' && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2 text-slate-800 font-semibold text-xs uppercase tracking-wider">
                  <User className="w-4 h-4 text-emerald-600" />
                  <span>Titular del Inmueble</span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  {selectedLote.nombreCompradorLabel || selectedCliente?.nombreCompleto || 'No asignado'}
                </h3>
                {selectedCliente && (
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    <p>DNI: <span className="font-medium text-slate-800">{selectedCliente.dniIdentificacion}</span></p>
                    <p>Tel: <span className="font-medium text-slate-800">{selectedCliente.telefono}</span></p>
                    {selectedCliente.whatsapp && (
                      <div className="pt-2">
                        <a
                          href={`https://wa.me/${selectedCliente.whatsapp.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Contactar por WhatsApp</span>
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Ubicación en el mapa y descripción técnica (rumbos y distancias) */}
            {(selectedLote.descripcionTecnica?.tramos.length ?? 0) >= 3 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Ubicación en el mapa</h4>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2 text-slate-700">
                  <p>
                    {selectedLote.descripcionTecnica?.ubicadoPor
                      ? TEXTO_UBICACION[selectedLote.descripcionTecnica.ubicadoPor]
                      : (selectedLote.verticesPoligono?.length ?? 0) >= 3
                      ? 'Dibujado con las coordenadas del documento'
                      : 'Sin ubicar: falta la coordenada del primer punto'}
                    {' · '}
                    {selectedLote.descripcionTecnica?.tramos.length} tramos
                  </p>
                  {selectedLote.descripcionTecnica?.ubicadoPor === 'MAPA' && (
                    <p className="text-[11px] text-slate-500">
                      Para ajustarla, cierre este panel y arrastre el punto naranja de la esquina del lote.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => empezarUbicacion(selectedLote)} leftIcon={<Crosshair className="w-3.5 h-3.5" />}>
                      {(selectedLote.verticesPoligono?.length ?? 0) >= 3 ? 'Reubicar' : 'Ubicar en el mapa'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEditandoTramos((v) => !v)}>
                      {editandoTramos ? 'Cerrar tramos' : 'Corregir tramos'}
                    </Button>
                  </div>
                </div>
                {editandoTramos && (
                  <div className="mt-3">
                    <EditorTramosLote key={selectedLote.id} lote={selectedLote} onGuardado={() => setEditandoTramos(false)} />
                  </div>
                )}
              </div>
            )}

            {/* Ficha Técnica de Dimensiones */}
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Datos Catastrales y Superficie
              </h4>
              <PropertyList>
                <Property label="Identificador" value={selectedLote.codigoLote} />
                <Property label="Manzana / Bloque" value={selectedLote.bloqueManzana} />
                <Property label="Superficie Total" value={formatArea(selectedLote.areaM2)} />
                <Property
                  label="Precio de Lista"
                  value={formatCurrency(selectedLote.precioLista, activeProyecto?.moneda)}
                />
              </PropertyList>
            </div>

            {/* Colindancias y Linderos */}
            {selectedLote.linderos && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Linderos y Colindancias
                </h4>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1.5 text-slate-700">
                  {selectedLote.linderos.norte && (
                    <p><span className="font-bold text-slate-900">Norte:</span> {selectedLote.linderos.norte}</p>
                  )}
                  {selectedLote.linderos.sur && (
                    <p><span className="font-bold text-slate-900">Sur:</span> {selectedLote.linderos.sur}</p>
                  )}
                  {selectedLote.linderos.este && (
                    <p><span className="font-bold text-slate-900">Este:</span> {selectedLote.linderos.este}</p>
                  )}
                  {selectedLote.linderos.oeste && (
                    <p><span className="font-bold text-slate-900">Oeste:</span> {selectedLote.linderos.oeste}</p>
                  )}
                </div>
              </div>
            )}

            {/* Resumen Financiero del Contrato */}
            {selectedContrato && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Condiciones del Contrato
                </h4>
                <PropertyList>
                  <Property
                    label="Precio Pactado"
                    value={formatCurrency(selectedContrato.precioPactado, activeProyecto?.moneda)}
                  />
                  <Property
                    label="Prima Entregada"
                    value={formatCurrency(selectedContrato.primaEntregada, activeProyecto?.moneda)}
                  />
                  <Property
                    label="Saldo Financiado"
                    value={formatCurrency(selectedContrato.saldoFinanciado, activeProyecto?.moneda)}
                  />
                  <Property
                    label="Plazo Pactado"
                    value={`${selectedContrato.plazoMeses} Meses`}
                  />
                  <Property
                    label="Sistema"
                    value={selectedContrato.sistemaAmortizacion}
                  />
                </PropertyList>
              </div>
            )}

            {/* Gastos de la venta (plan 04.3) */}
            {selectedContrato && (() => {
              const gastosVenta = storage.getGastos().filter((g) => g.contratoId === selectedContrato.id);
              if (gastosVenta.length === 0) return null;
              const sucesion = gastosVenta.filter((g) => g.aCargoDe === 'SUCESION');
              const total = sucesion.reduce((acc, g) => acc + g.monto, 0);
              const reembolsado = sucesion.reduce((acc, g) => acc + storage.getReembolsadoDeGasto(g.id), 0);
              const comprador = gastosVenta.filter((g) => g.aCargoDe === 'COMPRADOR').reduce((acc, g) => acc + g.monto, 0);
              return (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Gastos de la Venta</h4>
                  <PropertyList>
                    <Property label="A cargo de la sucesión" value={formatCurrency(total, activeProyecto?.moneda)} />
                    <Property label="Reembolsado" value={formatCurrency(reembolsado, activeProyecto?.moneda)} />
                    {comprador > 0 && <Property label="A cargo del comprador" value={formatCurrency(comprador, activeProyecto?.moneda)} />}
                  </PropertyList>
                </div>
              );
            })()}
          </div>
        )}
      </Drawer>
    </div>
  );
};
