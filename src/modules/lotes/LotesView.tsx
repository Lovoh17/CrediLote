import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader, CardBody } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Input } from '@/shared/components/ui/Input';
import { DataGrid, Column } from '@/shared/components/ui/DataGrid';
import { Drawer } from '@/shared/components/ui/Drawer';
import { PropertyList, Property } from '@/shared/components/ui/PropertyList';
import { storage, LoteVendido, DocumentoGuardado } from '@/shared/services/storage';
import { EstadoLote, Lote } from '@/shared/types';
import { formatCurrency, formatDate, formatArea } from '@/shared/utils/formatters';
import { ESTADOS_LOTE } from '@/shared/theme/status';
import { NavigationTab } from '@/app/Sidebar';
import { solicitarEnfoqueLote } from '@/modules/cartography/enfoqueLote';
import {
  Search,
  MapPin,
  FileText,
  Upload,
  Download,
  ExternalLink,
  Eye,
  AlertCircle,
  Loader2,
  Layers,
  DollarSign,
  Crosshair,
} from 'lucide-react';

/**
 * Vista única de lotes (antes "Catálogo de Lotes" y "Lotes Vendidos"): todos los lotes del proyecto con su estado y,
 * en los vendidos, el avance de los pagos y la promesa de venta (original o versión limpia del escaneo).
 */

interface LotesViewProps {
  onNavigate: (tab: NavigationTab) => void;
}

/** Un lote y, si tiene promesa de venta, los datos de la venta. */
interface FilaLote {
  lote: Lote;
  venta?: LoteVendido;
}

type Filtro = 'TODOS' | EstadoLote;

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const MIME_ACEPTADOS = '.pdf,.jpg,.jpeg,.png,.webp';
const ORDEN_ESTADOS: EstadoLote[] = ['VENDIDO', 'DISPONIBLE', 'RESERVADO', 'FINIQUITADO'];

const tieneTramos = (lote: Lote) => (lote.descripcionTecnica?.tramos.length ?? 0) >= 3;
const estaDibujado = (lote: Lote) => (lote.verticesPoligono?.length ?? 0) >= 3;

export const LotesView: React.FC<LotesViewProps> = ({ onNavigate }) => {
  const activeProyecto = storage.getActiveProyecto();
  const vendidos = activeProyecto ? storage.getLotesVendidos(activeProyecto.id) : [];
  const ventaPorLote = new Map(vendidos.map((v) => [v.lote.id, v]));
  const sinUbicar = new Set(storage.getLotesSinUbicar(activeProyecto?.id).map((l) => l.id));

  // Primero las ventas (de la más reciente a la más antigua) y después los lotes sin venta, por código
  const filas: FilaLote[] = [
    ...vendidos.map((v) => ({ lote: v.lote, venta: v })),
    ...storage
      .getLotes(activeProyecto?.id)
      .filter((l) => !ventaPorLote.has(l.id))
      .sort((a, b) => a.codigoLote.localeCompare(b.codigoLote, 'es', { numeric: true }))
      .map((lote) => ({ lote })),
  ];

  const [searchTerm, setSearchTerm] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const seleccionado = seleccionadoId ? filas.find((f) => f.lote.id === seleccionadoId) ?? null : null;
  const contratoSeleccionado = seleccionado?.venta?.contrato.id ?? null;

  // --- Estado del panel de documentos ---
  const [documentos, setDocumentos] = useState<DocumentoGuardado[]>([]);
  const [cargandoDocs, setCargandoDocs] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  const [versionLimpia, setVersionLimpia] = useState(true);
  const [preparandoLimpia, setPreparandoLimpia] = useState(false);
  const [errorLimpia, setErrorLimpia] = useState(false);

  const cargarDocumentos = useCallback(async (contratoId: string) => {
    setCargandoDocs(true);
    setErrorSubida(null);
    setErrorLimpia(false);
    setPreparandoLimpia(false);
    try {
      const docs = await storage.listarDocumentos(contratoId);
      setDocumentos(docs);
      if (docs.length > 0 && !docs[0].tieneVersionLimpia) setPreparandoLimpia(true);
    } catch {
      setDocumentos([]);
    } finally {
      setCargandoDocs(false);
    }
  }, []);

  useEffect(() => {
    setDocumentos([]);
    if (contratoSeleccionado) {
      setVersionLimpia(true);
      cargarDocumentos(contratoSeleccionado);
    }
  }, [contratoSeleccionado, cargarDocumentos]);

  // --- Filtros ---
  const conteo = (estado: EstadoLote) => filas.filter((f) => f.lote.estado === estado).length;
  const termino = searchTerm.trim().toLowerCase();
  const filtradas = filas.filter((f) => {
    if (filtro !== 'TODOS' && f.lote.estado !== filtro) return false;
    if (!termino) return true;
    const comprador = f.venta?.comprador?.nombreCompleto ?? f.lote.nombreCompradorLabel ?? '';
    return [f.lote.codigoLote, f.lote.bloqueManzana, comprador].some((t) => t.toLowerCase().includes(termino));
  });

  // --- Acciones ---
  const handleSubirArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!file || !contratoSeleccionado) return;
    if (file.size > MAX_FILE_SIZE) {
      setErrorSubida('El archivo supera el tamaño máximo de 15 MB.');
      return;
    }
    setSubiendo(true);
    setErrorSubida(null);
    const r = await storage.subirDocumento(contratoSeleccionado, file);
    if (r.ok) await cargarDocumentos(contratoSeleccionado);
    else setErrorSubida(r.mensaje ?? 'No se pudo subir el archivo.');
    setSubiendo(false);
  };

  /** Abre Cartografía en el lote (si no tiene dibujo pero sí tramos, en modo "Ubicar en el mapa"). */
  const irAlMapa = (lote: Lote) => {
    solicitarEnfoqueLote(lote.id);
    onNavigate('cartography');
  };

  // --- Versión limpia: se genera al pedirla; HEAD indica si está lista o si no se puede limpiar ---
  const docActivo = documentos[0];
  const urlVisor = docActivo
    ? versionLimpia
      ? storage.urlDocumentoLimpio(docActivo.id)
      : storage.urlDocumento(docActivo.id)
    : null;

  const handleVisorError = () => {
    if (versionLimpia) {
      setErrorLimpia(true);
      setVersionLimpia(false);
    }
  };

  useEffect(() => {
    if (!docActivo || !versionLimpia) return;
    if (docActivo.tieneVersionLimpia) {
      setPreparandoLimpia(false);
      return;
    }
    let cancelado = false;
    const fallar = () => {
      if (cancelado) return;
      setErrorLimpia(true);
      setVersionLimpia(false);
      setPreparandoLimpia(false);
    };
    setPreparandoLimpia(true);
    (async () => {
      try {
        const resp = await fetch(storage.urlDocumentoLimpio(docActivo.id), { method: 'HEAD' });
        if (cancelado) return;
        if (resp.ok) {
          setPreparandoLimpia(false);
        } else if (resp.status === 422 || resp.status === 404) {
          fallar();
        } else {
          // Reintentar una vez
          setTimeout(async () => {
            if (cancelado) return;
            try {
              const r2 = await fetch(storage.urlDocumentoLimpio(docActivo.id), { method: 'HEAD' });
              if (cancelado) return;
              if (r2.ok) setPreparandoLimpia(false);
              else fallar();
            } catch {
              fallar();
            }
          }, 10_000);
        }
      } catch {
        fallar();
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [docActivo, versionLimpia]);

  // --- Insignias de dibujo (llevan a Cartografía) ---
  const insigniaDibujo = (lote: Lote) => {
    if (estaDibujado(lote)) return null;
    const ubicable = sinUbicar.has(lote.id) || tieneTramos(lote);
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (ubicable) irAlMapa(lote);
        }}
        title={ubicable ? 'Ubicar en el mapa marcando su primer punto' : 'La promesa no trae tramos ni coordenadas'}
      >
        <Badge variant="warning" size="sm" dot>
          {ubicable ? 'Sin ubicar' : 'Sin dibujo'}
        </Badge>
      </button>
    );
  };

  // --- Columnas de la tabla ---
  const columns: Column<FilaLote>[] = [
    {
      key: 'lote',
      header: 'Lote',
      render: ({ lote }) => (
        <div>
          <span className="font-bold text-slate-900 tracking-tight">{lote.codigoLote}</span>
          {lote.bloqueManzana && <span className="text-slate-500 text-xs ml-1.5">{lote.bloqueManzana}</span>}
          <div className="text-[11px] text-slate-500 tabular-nums">{formatArea(lote.areaM2)}</div>
          {!estaDibujado(lote) && <div className="mt-1">{insigniaDibujo(lote)}</div>}
        </div>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      align: 'center',
      render: ({ lote }) => <Badge estadoLote={lote.estado} dot />,
    },
    {
      key: 'comprador',
      header: 'Comprador',
      render: ({ lote, venta }) =>
        venta ? (
          <div>
            <div className="text-slate-800 font-medium">{venta.comprador?.nombreCompleto ?? lote.nombreCompradorLabel ?? '—'}</div>
            <div className="text-[11px] text-slate-500">firmó el {formatDate(venta.contrato.fechaFirma)}</div>
          </div>
        ) : (
          <span className="text-slate-400 text-sm">—</span>
        ),
    },
    {
      key: 'precio',
      header: 'Precio',
      align: 'right',
      render: ({ lote, venta }) =>
        venta ? (
          <div className="tabular-nums">
            <div className="font-semibold text-slate-900">{formatCurrency(venta.contrato.precioPactado)}</div>
            <div className="text-xs text-slate-500">prima {formatCurrency(venta.contrato.primaEntregada)}</div>
          </div>
        ) : (
          <div className="tabular-nums">
            <div className="font-semibold text-slate-900">{formatCurrency(lote.precioLista)}</div>
            <div className="text-xs text-slate-500">de lista</div>
          </div>
        ),
    },
    {
      key: 'saldo',
      header: 'Saldo pendiente',
      align: 'right',
      render: ({ venta }) =>
        venta ? (
          <span className="font-semibold tabular-nums text-amber-700">{formatCurrency(venta.saldoPendiente)}</span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'pagos',
      header: 'Cuotas / próxima',
      render: ({ venta }) =>
        venta ? (
          <div className="text-xs tabular-nums">
            <div>
              <span className="font-semibold text-emerald-700">{venta.cuotasPagadas}</span>
              <span className="text-slate-400"> de {venta.cuotasTotales} pagadas</span>
            </div>
            {venta.proximaCuota ? (
              <div>
                <span className="text-slate-600">{formatDate(venta.proximaCuota.fechaVencimiento)}</span>
                <span className="text-slate-900 font-semibold ml-1.5">{formatCurrency(venta.proximaCuota.montoCuota)}</span>
              </div>
            ) : (
              <Badge variant="success" size="sm">Pagado</Badge>
            )}
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'acciones',
      header: '',
      align: 'right',
      render: ({ lote, venta }) => (
        <div className="flex items-center justify-end gap-1.5">
          {estaDibujado(lote) && (
            <Button
              size="xs"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                irAlMapa(lote);
              }}
              title="Ver en el mapa"
            >
              <MapPin className="w-3.5 h-3.5 text-slate-600" />
            </Button>
          )}
          {venta && (
            <Button
              size="xs"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate('finance');
              }}
              title="Ver plan de pagos"
            >
              <DollarSign className="w-3.5 h-3.5 text-slate-600" />
            </Button>
          )}
          <Button
            size="xs"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              setSeleccionadoId(lote.id);
            }}
            title={venta ? 'Ver promesa de venta' : 'Ver datos del lote'}
          >
            <Eye className="w-3.5 h-3.5 text-slate-600" />
          </Button>
        </div>
      ),
    },
  ];

  // --- Panel de un lote sin venta ---
  const renderPanelLote = (lote: Lote) => (
    <div className="space-y-5">
      <PropertyList>
        <Property label="Estado" value={<Badge estadoLote={lote.estado} dot />} />
        <Property label="Manzana / Bloque" value={lote.bloqueManzana || '—'} />
        <Property label="Superficie" value={formatArea(lote.areaM2)} />
        <Property label="Precio de lista" value={formatCurrency(lote.precioLista, activeProyecto?.moneda)} />
      </PropertyList>

      {lote.linderos && (
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Linderos</h4>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1 text-slate-700">
            {(['norte', 'sur', 'este', 'oeste'] as const).map((lado) =>
              lote.linderos?.[lado] ? (
                <p key={lado}>
                  <span className="font-bold text-slate-900 capitalize">{lado}:</span> {lote.linderos[lado]}
                </p>
              ) : null
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {estaDibujado(lote) ? (
          <Button variant="outline" size="sm" leftIcon={<MapPin className="w-3.5 h-3.5" />} onClick={() => irAlMapa(lote)}>
            Ver en el mapa
          </Button>
        ) : tieneTramos(lote) ? (
          <Button variant="outline" size="sm" leftIcon={<Crosshair className="w-3.5 h-3.5" />} onClick={() => irAlMapa(lote)}>
            Ubicar en el mapa
          </Button>
        ) : null}
        {lote.estado === 'DISPONIBLE' && (
          <Button variant="primary" size="sm" onClick={() => onNavigate('contracts')}>
            Registrar promesa de venta
          </Button>
        )}
      </div>
    </div>
  );

  // --- Panel de un lote vendido: la venta y su promesa ---
  const renderPanelPromesa = (venta: LoteVendido) => {
    const doc = documentos[0];
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <div>
            <span className="text-slate-500">Comprador:</span>{' '}
            <span className="font-medium text-slate-800">{venta.comprador?.nombreCompleto ?? '—'}</span>
          </div>
          <div>
            <span className="text-slate-500">Fecha de firma:</span>{' '}
            <span className="font-medium text-slate-800">{formatDate(venta.contrato.fechaFirma)}</span>
          </div>
          <div>
            <span className="text-slate-500">Precio:</span>{' '}
            <span className="font-semibold text-slate-900">{formatCurrency(venta.contrato.precioPactado)}</span>
          </div>
          <div>
            <span className="text-slate-500">Saldo:</span>{' '}
            <span className="font-semibold text-amber-700">{formatCurrency(venta.saldoPendiente)}</span>
          </div>
          <div>
            <span className="text-slate-500">Superficie:</span>{' '}
            <span className="font-medium text-slate-800">{formatArea(venta.lote.areaM2)}</span>
          </div>
          <div>
            <span className="text-slate-500">Cuotas:</span>{' '}
            <span className="font-medium text-slate-800">
              {venta.cuotasPagadas} de {venta.cuotasTotales} pagadas
            </span>
          </div>
        </div>

        <hr className="border-slate-200" />

        <div>
          <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-emerald-600" />
            Promesa de venta
          </h3>

          {cargandoDocs ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando documentos…
            </div>
          ) : documentos.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm text-slate-500">No hay PDF guardado de esta promesa</p>
              <label className="inline-block">
                <input type="file" accept={MIME_ACEPTADOS} onChange={handleSubirArchivo} className="hidden" disabled={subiendo} />
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 cursor-pointer transition-colors">
                  {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Subir promesa
                </span>
              </label>
              {errorSubida && (
                <p className="text-xs text-red-600 flex items-center gap-1 justify-center mt-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errorSubida}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-lg">
                <button
                  onClick={() => {
                    setVersionLimpia(true);
                    setErrorLimpia(false);
                  }}
                  disabled={errorLimpia}
                  className={`flex-1 text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                    versionLimpia && !errorLimpia ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  } ${errorLimpia ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Versión limpia
                </button>
                <button
                  onClick={() => setVersionLimpia(false)}
                  className={`flex-1 text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                    !versionLimpia ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Original
                </button>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50" style={{ minHeight: 400 }}>
                {preparandoLimpia && versionLimpia ? (
                  <div className="flex flex-col items-center justify-center h-[400px] gap-3 text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                    <p className="text-sm">Preparando versión limpia…</p>
                    <p className="text-xs text-slate-400">Esto puede tardar 10–15 segundos</p>
                  </div>
                ) : doc && urlVisor ? (
                  doc.mime.startsWith('image/') ? (
                    <img src={urlVisor} alt={doc.nombre} className="w-full h-auto" onError={handleVisorError} />
                  ) : (
                    <iframe src={urlVisor} title={doc.nombre} className="w-full border-0" style={{ height: 500 }} onError={handleVisorError} />
                  )
                ) : null}
              </div>

              {errorLimpia && (
                <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  Este documento no se puede limpiar
                </p>
              )}

              {doc && (
                <div className="flex items-center gap-2">
                  <a
                    href={urlVisor ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir en otra pestaña
                  </a>
                  <a
                    href={urlVisor ?? '#'}
                    download={doc.nombre}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Descargar
                  </a>
                </div>
              )}

              <p className="text-[11px] text-slate-400 leading-relaxed">
                La versión limpia es la misma imagen del documento con fondo blanco y más contraste; el original se
                conserva sin cambios.
              </p>

              <label className="inline-block">
                <input type="file" accept={MIME_ACEPTADOS} onChange={handleSubirArchivo} className="hidden" disabled={subiendo} />
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                  {subiendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Subir otro documento
                </span>
              </label>
              {errorSubida && (
                <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errorSubida}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // --- Filtro por estado (solo los estados que tienen lotes) ---
  const botonFiltro = (valor: Filtro, etiqueta: string, cantidad: number) => (
    <button
      key={valor}
      onClick={() => setFiltro(valor)}
      className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
        filtro === valor
          ? valor === 'TODOS'
            ? 'bg-white text-slate-900 shadow-xs'
            : ESTADOS_LOTE[valor].filterButtonActiveClass
          : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {etiqueta} ({cantidad})
    </button>
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Buscador y filtro por estado */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Input
            size="sm"
            placeholder="Buscar por lote, bloque o comprador..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 bg-slate-100/90 p-1 rounded-lg self-start lg:self-auto">
          {botonFiltro('TODOS', 'Todos', filas.length)}
          {ORDEN_ESTADOS.filter((e) => conteo(e) > 0).map((e) => botonFiltro(e, `${ESTADOS_LOTE[e].label}s`, conteo(e)))}
        </div>
      </div>

      {/* Tabla en escritorio */}
      <Card className="hidden md:block">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600" />
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Lotes — {activeProyecto?.nombre}</h2>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <DataGrid
            columns={columns}
            data={filtradas}
            keyExtractor={(f) => f.lote.id}
            striped
            onRowClick={(f) => setSeleccionadoId(f.lote.id)}
            emptyMessage={filas.length === 0 ? 'Todavía no hay lotes: registre una promesa de venta.' : 'No se encontraron lotes.'}
          />
        </CardBody>
      </Card>

      {/* Tarjetas en celular */}
      <div className="md:hidden space-y-3">
        {filtradas.length === 0 && <p className="text-center text-sm text-slate-500 py-8">No se encontraron lotes.</p>}
        {filtradas.map(({ lote, venta }) => (
          // Tarjeta con botones dentro: es un div con rol de botón (un <button> no puede contener otros botones)
          <div
            key={lote.id}
            role="button"
            tabIndex={0}
            onClick={() => setSeleccionadoId(lote.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSeleccionadoId(lote.id);
              }
            }}
            className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div>
                <span className="font-bold text-slate-900">{lote.codigoLote}</span>
                {lote.bloqueManzana && <span className="text-xs text-slate-500 ml-1.5">{lote.bloqueManzana}</span>}
              </div>
              <div className="flex items-center gap-1.5">
                {insigniaDibujo(lote)}
                {estaDibujado(lote) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      irAlMapa(lote);
                    }}
                    className="p-1 rounded text-slate-400 hover:text-emerald-600"
                    title="Ver en el mapa"
                  >
                    <MapPin className="w-4 h-4" />
                  </button>
                )}
                <Badge estadoLote={lote.estado} dot />
              </div>
            </div>
            {venta ? (
              <>
                <p className="text-sm text-slate-700 font-medium">{venta.comprador?.nombreCompleto ?? '—'}</p>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs tabular-nums">
                  <div>
                    <span className="text-slate-400">Precio:</span>{' '}
                    <span className="font-semibold text-slate-900">{formatCurrency(venta.contrato.precioPactado)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Saldo:</span>{' '}
                    <span className="font-semibold text-amber-700">{formatCurrency(venta.saldoPendiente)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Cuotas:</span>{' '}
                    <span className="font-semibold text-emerald-700">{venta.cuotasPagadas}</span> / {venta.cuotasTotales}
                  </div>
                  {venta.proximaCuota && (
                    <div>
                      <span className="text-slate-400">Próxima:</span> {formatDate(venta.proximaCuota.fechaVencimiento)}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {formatArea(lote.areaM2)} · {formatCurrency(lote.precioLista)} de lista
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Panel lateral: promesa de venta (lote vendido) o datos del lote */}
      <Drawer
        isOpen={!!seleccionado}
        onClose={() => setSeleccionadoId(null)}
        title={
          seleccionado && (
            <div className="flex items-center gap-2">
              <span>{seleccionado.lote.codigoLote}</span>
              <Badge estadoLote={seleccionado.lote.estado} dot />
            </div>
          )
        }
        description={
          seleccionado?.venta
            ? `Promesa de venta — ${seleccionado.venta.comprador?.nombreCompleto ?? 'Sin comprador'}`
            : activeProyecto?.nombre
        }
        size={seleccionado?.venta ? 'xl' : 'md'}
      >
        {seleccionado && (seleccionado.venta ? renderPanelPromesa(seleccionado.venta) : renderPanelLote(seleccionado.lote))}
      </Drawer>
    </div>
  );
};
