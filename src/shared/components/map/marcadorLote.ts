import L from 'leaflet';
import { COLORES_ESTADO_LOTE } from '@/shared/theme/status';

export { COLORES_ESTADO_LOTE };

export interface OpcionesMarcadorLote {
  codigo: string;
  /** Segunda línea opcional (p. ej. nombre del titular). */
  detalle?: string;
  color: string;
  /** Resalta el marcador (lote seleccionado o recién registrado). */
  destacado?: boolean;
}

/**
 * Crea un marcador tipo pin con el código del lote, visible a cualquier zoom.
 * El contenido se arma con textContent (sin HTML), así que no hay riesgo de inyección.
 */
export function crearMarcadorLote(
  posicion: L.LatLngExpression,
  { codigo, detalle, color, destacado = false }: OpcionesMarcadorLote
): L.Marker {
  const raiz = document.createElement('div');
  raiz.className = `credilote-pin${destacado ? ' credilote-pin--destacado' : ''}`;
  raiz.style.setProperty('--pin-color', color);

  const punto = document.createElement('span');
  punto.className = 'credilote-pin__punto';

  const etiqueta = document.createElement('span');
  etiqueta.className = 'credilote-pin__etiqueta';
  const titulo = document.createElement('strong');
  titulo.textContent = codigo;
  etiqueta.appendChild(titulo);
  if (detalle) {
    const linea = document.createElement('span');
    linea.textContent = detalle;
    etiqueta.appendChild(linea);
  }

  raiz.append(punto, etiqueta);

  return L.marker(posicion, {
    icon: L.divIcon({ html: raiz, className: 'credilote-pin-icono', iconSize: [0, 0], iconAnchor: [0, 0] }),
    riseOnHover: true,
    zIndexOffset: destacado ? 1000 : 0,
    title: detalle ? `${codigo} · ${detalle}` : codigo,
  });
}
