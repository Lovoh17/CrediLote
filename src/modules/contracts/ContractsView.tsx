import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Card, CardHeader, CardBody } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { storage } from '@/shared/services/storage';
import { SistemaAmortizacion, ExtraerDatosPromesaResult, TipoDocumentoExtraido } from '@/shared/types';
import { formatCurrency, hoyISO } from '@/shared/utils/formatters';
import { NavigationTab } from '@/app/Sidebar';
import {
  UploadCloud,
  FileText,
  CheckCircle,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  MapPin,
  DollarSign,
  Sparkles,
  Loader2,
  Eye,
  XCircle,
  Cloud,
  CloudOff,
} from 'lucide-react';
import { extraerDatosPromesaConGemini } from './services/contractExtractor';
import { DescripcionTecnica, calcularGeometriaFormulario } from './components/DescripcionTecnica';
import { validarDUI, formatearDUI, validarTelefonoSV } from '@/shared/utils/validaciones';
import { solicitarEnfoqueLote } from '@/modules/cartography/enfoqueLote';
import { EditorGastos, BorradorGasto, gastoCompleto } from '@/modules/gastos/components/EditorGastos';
import { porcentajesValidos } from '@/modules/beneficiarios/engine/reparto';
import { consultarPromesaDeNegociacion, limpiarPromesaDeNegociacion } from '@/modules/negociaciones/promesaDesdeNegociacion';
import { Handshake } from 'lucide-react';

// Archivos admitidos para la extracción (01.4 §5)
const TIPOS_ADMITIDOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const TAMANO_MAXIMO_MB = 15;

interface ContractsViewProps {
  onNavigate: (tab: NavigationTab) => void;
}

/** Cómo se nombra cada tipo de documento que no es una promesa (para el aviso destacado). */
const NOMBRE_TIPO_DOCUMENTO: Partial<Record<TipoDocumentoExtraido, string>> = {
  REMEDICION: 'un acta de remedición',
  SEGREGACION: 'una escritura de segregación',
  OTRO: 'otro tipo de documento',
};

export const ContractsView: React.FC<ContractsViewProps> = ({ onNavigate }) => {
  const activeProyecto = storage.getActiveProyecto();
  const lotesDisponibles = storage.getLotes().filter((l) => l.estado === 'DISPONIBLE');

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Archivo de la promesa: se guarda en Neon Storage en cuanto se sube y se vincula al contrato al registrar
  const archivoOriginal = useRef<File | null>(null);
  const documentoSubido = useRef<ReturnType<typeof storage.subirDocumento> | null>(null);
  const [estadoNube, setEstadoNube] = useState<'subiendo' | 'guardado' | 'error' | null>(null);

  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    size: string;
    type: string;
    previewUrl?: string;
  } | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [registroExitoso, setRegistroExitoso] = useState<string | null>(null);
  const [loteRegistradoId, setLoteRegistradoId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSampleMode, setIsSampleMode] = useState(false);

  // Form State
  const [formData, setFormData] = useState<ExtraerDatosPromesaResult>({
    vendedorNombre: '',
    compradorNombre: '',
    compradorDni: '',
    compradorTelefono: '',
    proyectoNombre: activeProyecto?.nombre || '',
    codigoLote: lotesDisponibles[0]?.codigoLote || '',
    bloqueManzana: '',
    areaM2: 0,
    precioPactado: 0,
    primaEntregada: 0,
    plazoMeses: 12,
    tasaInteresAnual: 0,
    sistemaAmortizacion: 'FRANCES',
    diaCortePago: 15,
    coordenadas: [],
    confianza: {
      partes: 0,
      financiero: 0,
      coordenadas: 0,
    },
  });

  // Geometría del lote (RN-G2, RN-G3): se recalcula al editar el punto de partida o los tramos
  const geometria = useMemo(
    () => calcularGeometriaFormulario(formData),
    [formData.puntoPartida, formData.tramos, formData.coordenadas, formData.areaM2]
  );
  const [geometriaAceptada, setGeometriaAceptada] = useState(false);

  // Gastos de esta venta (plan 04.3): se reembolsan de la prima a su responsable
  const [gastosVenta, setGastosVenta] = useState<BorradorGasto[]>([]);
  const beneficiarios = storage.getBeneficiarios().filter((b) => b.activo);
  const hayReparto = porcentajesValidos(beneficiarios);
  const gastosIncompletos = gastosVenta.some((g) => !gastoCompleto(g));

  // Negociación que se convierte en esta venta (plan 04.3, 8.7)
  const [negociacionId, setNegociacionId] = useState<string | null>(() => consultarPromesaDeNegociacion());
  const negociacion = negociacionId ? storage.getNegociacionById(negociacionId) : undefined;
  const negociacionesEnEspera = storage
    .getNegociaciones()
    .filter((n) => n.estado === 'ESPERANDO_PROMESA' || n.id === negociacionId);
  const gastosNegociacion = negociacion
    ? storage.getGastosDeNegociacion(negociacion.id).filter((g) => g.aCargoDe === 'SUCESION' && !g.contratoId)
    : [];
  const totalGastosNegociacion = gastosNegociacion.reduce((a, g) => a + g.monto, 0);

  // Al vincular una negociación, precargar los datos del interesado (la extracción del PDF los puede reemplazar)
  const vincularNegociacion = (id: string | null) => {
    setNegociacionId(id);
    const n = id ? storage.getNegociacionById(id) : undefined;
    if (!n) return;
    const lote = n.loteId ? storage.getLoteById(n.loteId) : undefined;
    setFormData((f) => ({
      ...f,
      compradorNombre: f.compradorNombre || n.interesadoNombre,
      compradorTelefono: f.compradorTelefono || n.interesadoTelefono || '',
      codigoLote: lote?.codigoLote ?? f.codigoLote,
      precioPactado: f.precioPactado || n.precioAcordado || 0,
      primaEntregada: f.primaEntregada || n.primaAcordada || 0,
    }));
  };

  useEffect(() => {
    const id = consultarPromesaDeNegociacion();
    limpiarPromesaDeNegociacion();
    if (id) vincularNegociacion(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Validaciones de identificación (RN-I3)
  const validacionDUI = validarDUI(formData.compradorDni);
  const validacionTelefono = formData.compradorTelefono ? validarTelefonoSV(formData.compradorTelefono) : null;

  // Liberar la URL de vista previa al reemplazar el archivo o salir de la vista
  const previewUrlActual = uploadedFile?.previewUrl;
  useEffect(() => {
    return () => {
      if (previewUrlActual) URL.revokeObjectURL(previewUrlActual);
    };
  }, [previewUrlActual]);

  // Procesar archivo con Gemini
  const processFile = async (file: File) => {
    if (!TIPOS_ADMITIDOS.includes(file.type)) {
      setErrorMessage('Formato no admitido. Cargue un PDF o una imagen JPG, PNG o WebP.');
      return;
    }
    if (file.size > TAMANO_MAXIMO_MB * 1024 * 1024) {
      setErrorMessage(`El archivo supera el máximo de ${TAMANO_MAXIMO_MB} MB.`);
      return;
    }

    archivoOriginal.current = file;
    const subida = storage.subirDocumento(null, file); // en paralelo con la lectura de Gemini
    documentoSubido.current = subida;
    setEstadoNube('subiendo');
    void subida.then((r) => {
      if (documentoSubido.current === subida) setEstadoNube(r.ok ? 'guardado' : 'error');
    });
    setIsProcessing(true);
    setErrorMessage(null);
    setIsSampleMode(false);
    setRegistroExitoso(null);
    setGeometriaAceptada(false);
    setGastosVenta([]);

    const sizeFormatted =
      file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;

    const previewUrl = URL.createObjectURL(file);

    setUploadedFile({
      name: file.name,
      size: sizeFormatted,
      type: file.type,
      previewUrl,
    });

    try {
      const resultado = await extraerDatosPromesaConGemini(file, (msg) => {
        setProcessingStatus(msg);
      });

      // Desde una negociación, lo que el documento no trae se conserva de lo precargado
      setFormData((f) => ({
        ...resultado,
        compradorDni: formatearDUI(resultado.compradorDni),
        proyectoNombre: resultado.proyectoNombre || activeProyecto?.nombre || '',
        ...(negociacionId && {
          compradorNombre: resultado.compradorNombre || f.compradorNombre,
          compradorTelefono: resultado.compradorTelefono || f.compradorTelefono,
          precioPactado: resultado.precioPactado || f.precioPactado,
          primaEntregada: resultado.primaEntregada || f.primaEntregada,
        }),
      }));
    } catch (err: any) {
      console.error('Error al procesar contrato:', err);
      setErrorMessage(
        err.message || 'Ocurrió un error al procesar el archivo. Verifique el formato e intente nuevamente.'
      );
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Carga demostrativa asistida (Muestra de El Salvador)
  const handleLoadSampleContract = () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setIsSampleMode(true);
    archivoOriginal.current = null;
    documentoSubido.current = null;
    setEstadoNube(null);
    setGeometriaAceptada(false);
    setGastosVenta([]);
    setUploadedFile({
      name: 'Promesa_Compraventa_Lote_A04_SantaElena_Firmado.pdf',
      size: '1.2 MB',
      type: 'application/pdf',
    });

    setTimeout(() => {
      setFormData({
        vendedorNombre: 'Desarrollos e Inversiones Los Pinos S.A. de C.V.',
        compradorNombre: 'Sofía Isabel Reyes Castillo',
        compradorDni: '04512378-8',
        compradorTelefono: '+503 7450-2211',
        proyectoNombre: activeProyecto?.nombre || 'Residencial Campestre Los Pinos',
        codigoLote: 'L-04',
        bloqueManzana: 'Bloque A',
        areaM2: 340.0,
        precioPactado: 20400.0,
        primaEntregada: 4400.0,
        plazoMeses: 36,
        tasaInteresAnual: 12.0,
        sistemaAmortizacion: 'FRANCES',
        diaCortePago: 15,
        // Rectángulo de 20 × 17 m (340 m²) del ejemplo RN-G2 de 03.2
        coordenadas: [
          { lat: 13.692, lng: -89.218 },
          { lat: 13.6921769, lng: -89.2179679 },
          { lat: 13.6921504, lng: -89.2178131 },
          { lat: 13.6919735, lng: -89.2178452 },
        ],
        confianza: {
          partes: 98,
          financiero: 100,
          coordenadas: 95,
        },
      });
      setIsProcessing(false);
    }, 600);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleConfirmRegistration = () => {
    const loteExistente = storage.getLotes().find((l) => l.codigoLote === formData.codigoLote);
    const targetLoteId = loteExistente ? loteExistente.id : `lote-${Date.now()}`;

    const clienteId = `cli-${Date.now()}`;
    const nuevoCliente = {
      id: clienteId,
      nombreCompleto: formData.compradorNombre,
      dniIdentificacion: formData.compradorDni,
      telefono: formData.compradorTelefono,
      whatsapp: formData.compradorTelefono,
      createdAt: hoyISO(),
    };

    const nuevoContrato = {
      id: `cont-${Date.now()}`,
      loteId: targetLoteId,
      compradorId: clienteId,
      vendedorNombre: formData.vendedorNombre,
      fechaFirma: hoyISO(),
      precioPactado: formData.precioPactado,
      primaEntregada: formData.primaEntregada,
      saldoFinanciado: Math.max(0, formData.precioPactado - formData.primaEntregada),
      plazoMeses: formData.plazoMeses,
      tasaInteresAnual: formData.tasaInteresAnual,
      sistemaAmortizacion: formData.sistemaAmortizacion,
      diaCortePago: formData.diaCortePago,
      nombreArchivoOriginal: uploadedFile?.name || 'Documento_Escaneado.pdf',
      createdAt: hoyISO(),
    };

    // Vértices calculados (poligonal desde el mojón 1 o coordenadas directas). Si no hay polígono
    // válido y el lote ya existía con coordenadas, se preservan.
    let coordenadasFinales = geometria.vertices;
    if (
      (!coordenadasFinales || coordenadasFinales.length < 3) &&
      loteExistente?.verticesPoligono &&
      loteExistente.verticesPoligono.length >= 3
    ) {
      coordenadasFinales = loteExistente.verticesPoligono;
    }

    const currentProj = storage.getActiveProyecto();

    const loteModificado = {
      id: targetLoteId,
      proyectoId: currentProj?.id || 'proj-1',
      codigoLote: formData.codigoLote,
      bloqueManzana: formData.bloqueManzana,
      areaM2: formData.areaM2,
      precioLista: formData.precioPactado,
      estado: 'VENDIDO' as const,
      verticesPoligono: coordenadasFinales,
      nombreCompradorLabel: formData.compradorNombre,
      linderos: formData.linderos ?? loteExistente?.linderos,
      // Los tramos se guardan aunque falte el punto de partida: el lote se ubica después en Cartografía
      descripcionTecnica: formData.tramos?.length
        ? { tramos: formData.tramos, puntoPartida: formData.puntoPartida, referenciaPartida: formData.referenciaPartida }
        : undefined,
    };

    // Si los datos no son válidos (p. ej. precio $0) no se guarda nada y se muestra el motivo
    const resultado = storage.registrarPromesaVenta({
      contrato: nuevoContrato,
      cliente: nuevoCliente,
      loteModificado,
      gastos: gastosVenta,
      negociacionId: negociacionId ?? undefined,
    });
    if (!resultado.ok) {
      setErrorMessage(resultado.mensaje ?? 'No se pudo registrar la promesa de venta.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setErrorMessage(null);
    setGastosVenta([]);
    setNegociacionId(null);

    // El documento ya se guardó al subirlo: ahora se vincula al contrato (si falla, la venta ya quedó registrada)
    const archivo = archivoOriginal.current;
    if (archivo && !isSampleMode && resultado.valor) {
      void storage.guardarDocumentoDeContrato(documentoSubido.current, resultado.valor.id, archivo).then((r) => {
        if (!r.ok) setErrorMessage(`La promesa quedó registrada, pero el PDF no se pudo vincular en la nube: ${r.mensaje}`);
      });
    }

    setRegistroExitoso(formData.codigoLote);
    setLoteRegistradoId(targetLoteId);
  };

  const saldoCalculado = Math.max(0, formData.precioPactado - formData.primaEntregada);

  // Lo que falta para poder confirmar (la validación completa la hace storage.registrarPromesaVenta)
  const motivoBloqueo = !(formData.precioPactado > 0)
    ? 'Ingrese el precio de venta.'
    : formData.primaEntregada > formData.precioPactado
    ? 'La prima no puede ser mayor que el precio.'
    : null;

  const getConfidenceBadge = (val: number) => {
    // Umbrales RN-I2: ≥ 85 confiable, 60–84 revisar, < 60 capturar a mano
    if (val >= 85) return <Badge variant="available" size="sm">{val}%</Badge>;
    if (val >= 60) return <Badge variant="reserved" size="sm">{val}%</Badge>;
    return <Badge variant="overdue" size="sm">{val}%</Badge>;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Banner de Éxito al Registrar */}
      {registroExitoso && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-900">
                Promesa de Venta registrada con éxito para el {registroExitoso}
              </p>
              <p className="text-xs text-emerald-700">
                El lote ha sido asignado al comprador, proyectado al mapa satelital y se generó el plan de pagos.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (loteRegistradoId) solicitarEnfoqueLote(loteRegistradoId);
                onNavigate('cartography');
              }}
              leftIcon={<MapPin className="w-3.5 h-3.5 text-emerald-600" />}
            >
              Ver en Mapa
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => onNavigate('finance')}
              leftIcon={<DollarSign className="w-3.5 h-3.5" />}
            >
              Ver Plan de Pagos
            </Button>
          </div>
        </div>
      )}

      {/* Banner de Error si falló la extracción */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-rose-800 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setErrorMessage(null)}>
            Cerrar
          </Button>
        </div>
      )}

      {/* Split-Screen Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Document Uploader & Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card>
            <CardHeader className="py-3">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-500" />
                Documento Contractual Fuente
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadSampleContract}
                  leftIcon={<Sparkles className="w-3.5 h-3.5 text-emerald-600" />}
                >
                  Muestra
                </Button>
              </div>
            </CardHeader>
            <CardBody className="p-4 space-y-4">
              {/* Input oculto para selección de archivos */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="application/pdf,image/png,image/jpeg,image/webp"
                className="hidden"
              />

              {/* Dropzone Area interactiva */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer group ${
                  isDragOver
                    ? 'border-emerald-500 bg-emerald-50/40 scale-[0.99]'
                    : 'border-slate-300 hover:border-emerald-500 bg-slate-50/50 hover:bg-emerald-50/20'
                }`}
              >
                {isProcessing ? (
                  <div className="py-2 space-y-2">
                    <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
                    <p className="text-xs font-semibold text-emerald-800">
                      {processingStatus || 'Procesando documento con Gemini Vision...'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Extrayendo cláusulas notariales, montos en USD y coordenadas
                    </p>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="w-10 h-10 text-slate-400 group-hover:text-emerald-600 mx-auto transition-colors" />
                    <p className="mt-2 text-xs font-semibold text-slate-800">
                      Arrastre aquí la promesa de venta (PDF o Imagen)
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      o haga clic para seleccionar desde su equipo
                    </p>
                  </>
                )}

                {uploadedFile && !isProcessing && (
                  <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 shadow-sm">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <span className="truncate max-w-[200px]">{uploadedFile.name}</span>
                    <span className="text-slate-400 text-[10px]">({uploadedFile.size})</span>
                    {estadoNube === 'subiendo' && (
                      <span className="flex items-center gap-1 text-[10px] text-slate-500">
                        <Loader2 className="w-3 h-3 animate-spin" /> Guardando en la nube…
                      </span>
                    )}
                    {estadoNube === 'guardado' && (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-700">
                        <Cloud className="w-3 h-3" /> Guardado en la nube
                      </span>
                    )}
                    {estadoNube === 'error' && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-700" title="Se intentará otra vez al registrar la promesa">
                        <CloudOff className="w-3 h-3" /> No se guardó en la nube
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Visor de Documento */}
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-inner">
                <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                    {uploadedFile?.previewUrl && !isSampleMode
                      ? 'Vista previa del archivo'
                      : uploadedFile
                      ? 'Transcripción notarial analizada'
                      : 'Visor de documento'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
                      className="p-1 hover:bg-slate-200 rounded text-slate-600"
                      title="Reducir"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] font-mono px-1">{zoomLevel}%</span>
                    <button
                      onClick={() => setZoomLevel((z) => Math.min(150, z + 10))}
                      className="p-1 hover:bg-slate-200 rounded text-slate-600"
                      title="Aumentar"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {!uploadedFile ? (
                  <div className="p-12 text-center text-slate-400 min-h-[380px] flex flex-col items-center justify-center">
                    <FileText className="w-12 h-12 text-slate-300 mb-3" />
                    <p className="text-xs font-semibold text-slate-600">No hay documento cargado</p>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                      Cargue un archivo PDF o imagen de promesa de venta para previsualizarlo y extraer sus datos automáticamente con IA.
                    </p>
                  </div>
                ) : uploadedFile.previewUrl && !isSampleMode && uploadedFile.type === 'application/pdf' ? (
                  <div className="w-full h-[460px] bg-slate-900">
                    <iframe
                      src={uploadedFile.previewUrl}
                      className="w-full h-full border-0"
                      title="Visor PDF"
                    />
                  </div>
                ) : uploadedFile.previewUrl && !isSampleMode && uploadedFile.type.startsWith('image/') ? (
                  <div className="p-4 overflow-auto max-h-[460px] flex justify-center bg-slate-100">
                    <img
                      src={uploadedFile.previewUrl}
                      alt="Documento escaneado"
                      style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
                      className="max-w-full h-auto object-contain rounded shadow"
                    />
                  </div>
                ) : (
                  <div
                    style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top left' }}
                    className="p-6 font-serif text-[11px] text-slate-800 leading-relaxed space-y-3 bg-white min-h-[380px]"
                  >
                    <div className="text-center font-bold tracking-wider text-xs border-b pb-2">
                      CONTRATO PRIVADO DE PROMESA DE COMPRAVENTA DE INMUEBLE
                    </div>
                    <p>
                      En la ciudad de San Salvador, a las diez horas del día quince de septiembre del año dos mil
                      veintiséis. Ante mí, Notario, comparecen: por una parte la entidad mercantil denominada{' '}
                      <strong>{formData.vendedorNombre || 'DESARROLLOS LOS PINOS S.A. DE C.V.'}</strong>, en su calidad de
                      PROMITENTE VENDEDORA; y por otra parte la señora{' '}
                      <mark className="bg-amber-100 px-1 font-semibold">
                        {formData.compradorNombre || 'SOFÍA ISABEL REYES CASTILLO'}
                      </mark>
                      , con Documento Único de Identidad número{' '}
                      <mark className="bg-amber-100 px-1 font-semibold">
                        {formData.compradorDni || '04512378-8'}
                      </mark>
                      , y teléfono de contacto{' '}
                      <mark className="bg-amber-100 px-1 font-semibold">
                        {formData.compradorTelefono || '+503 7450-2211'}
                      </mark>
                      , en calidad de PROMITENTE COMPRADORA...
                    </p>
                    <p>
                      <strong>CLÁUSULA PRIMERA (DEL INMUEBLE):</strong> La Vendedora promete vender y dar enajenación
                      el lote de terreno denominado catastralmente como{' '}
                      <mark className="bg-emerald-100 px-1 font-semibold">
                        {formData.codigoLote || 'L-04'}
                      </mark>
                      , situado en el {formData.bloqueManzana || 'Bloque A'}, del proyecto habitacional{' '}
                      {formData.proyectoNombre || 'Residencial Campestre Los Pinos'}, con una extensión superficial de{' '}
                      <mark className="bg-emerald-100 px-1 font-semibold">
                        {formData.areaM2} metros cuadrados
                      </mark>
                      .
                    </p>
                    <p>
                      <strong>CLÁUSULA SEGUNDA (PRECIO Y CONDICIONES):</strong> El precio de la venta prometida es por
                      la suma de{' '}
                      <mark className="bg-blue-100 px-1 font-semibold">
                        {formatCurrency(formData.precioPactado)}
                      </mark>
                      , de la cual la Compradora cancela en este acto en calidad de prima la cantidad de{' '}
                      <mark className="bg-blue-100 px-1 font-semibold">
                        {formatCurrency(formData.primaEntregada)}
                      </mark>
                      , conviniéndose financiar el saldo de {formatCurrency(saldoCalculado)} mediante crédito directo a
                      un plazo de {formData.plazoMeses} meses bajo el sistema de cuota nivelada (Francés) con tasa de{' '}
                      {formData.tasaInteresAnual}% anual, exigibles los días {formData.diaCortePago} de cada mes.
                    </p>
                    <p>
                      <strong>CLÁUSULA TERCERA (LINDEROS Y VÉRTICES):</strong> La delimitación perimetral queda
                      establecida por los linderos y vértices georreferenciados en coordenadas geográficas satelitales.
                    </p>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Right Side: Extracted Fields & Validation Form (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <Card>
            <CardHeader className="py-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Campos Detectados (Validación Humana)</h2>
                <p className="text-xs text-slate-500">
                  Revise y ajuste los datos extraídos automáticamente por la IA antes de ratificar
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-[11px] flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">Partes:</span>
                  {getConfidenceBadge(formData.confianza.partes)}
                </div>
                <div className="text-[11px] flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">Financiero:</span>
                  {getConfidenceBadge(formData.confianza.financiero)}
                </div>
                {formData.coordenadas.length > 0 && (
                  <div className="text-[11px] flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium">GPS:</span>
                    {getConfidenceBadge(formData.confianza.coordenadas)}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardBody className="p-6 space-y-5">
              {/* Negociación vinculada (plan 04.3, 8.7) */}
              {(negociacionesEnEspera.length > 0 || negociacion) && (
                <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Handshake className="w-4 h-4 text-blue-600 shrink-0" />
                    <label className="text-xs font-semibold text-slate-700">Viene de la negociación:</label>
                    <select
                      value={negociacionId ?? ''}
                      onChange={(e) => vincularNegociacion(e.target.value || null)}
                      className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white min-w-[220px]"
                    >
                      <option value="">— Ninguna (venta directa) —</option>
                      {negociacionesEnEspera.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.interesadoNombre}
                          {n.loteReferencia ? ` · ${n.loteReferencia}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {negociacion && (
                    <p className="text-[11px] text-slate-600">
                      Al confirmar, la negociación con <strong>{negociacion.interesadoNombre}</strong> pasa a "Convertida en venta"
                      {gastosNegociacion.length > 0 && (
                        <>
                          {' '}y sus <strong>{gastosNegociacion.length} gasto(s) por {formatCurrency(totalGastosNegociacion)}</strong> se reembolsan de la prima.
                        </>
                      )}
                      {gastosNegociacion.length === 0 && '.'}
                    </p>
                  )}
                </div>
              )}

              {/* El archivo no parece una promesa (p. ej. un acta de remedición) */}
              {formData.tipoDocumento && NOMBRE_TIPO_DOCUMENTO[formData.tipoDocumento] && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-lg flex items-start gap-2">
                  <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-rose-900">Este archivo no parece una promesa de venta</p>
                    <p className="text-xs text-rose-800">
                      Parece {NOMBRE_TIPO_DOCUMENTO[formData.tipoDocumento]}. Verifique que subió el archivo correcto antes de registrar.
                    </p>
                  </div>
                </div>
              )}

              {/* Avisos de la extracción automática */}
              {formData.avisos && formData.avisos.length > 0 && (
                <ul className="space-y-1 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  {formData.avisos.map((aviso, i) => (
                    <li key={i} className="text-[11px] text-amber-800 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                      {aviso}
                    </li>
                  ))}
                </ul>
              )}

              {/* Sección 1: Partes Contratantes */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 border-b pb-1">
                  1. Partes Contratantes
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1">
                      Nombre del Comprador
                    </label>
                    <input
                      type="text"
                      value={formData.compradorNombre}
                      onChange={(e) => setFormData({ ...formData, compradorNombre: e.target.value })}
                      placeholder="Nombre y apellidos"
                      className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 focus:outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1">
                      DUI del Comprador (El Salvador)
                    </label>
                    <input
                      type="text"
                      value={formData.compradorDni}
                      onChange={(e) => setFormData({ ...formData, compradorDni: e.target.value })}
                      placeholder="00000000-0"
                      className={`w-full text-xs border rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 focus:outline-none font-mono font-medium ${
                        formData.compradorDni && !validacionDUI.valido ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                      }`}
                    />
                    {formData.compradorDni && !validacionDUI.valido && (
                      <p className="mt-1 text-[11px] text-rose-700">{validacionDUI.mensaje}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1">
                      Teléfono de Contacto (+503)
                    </label>
                    <input
                      type="text"
                      value={formData.compradorTelefono}
                      onChange={(e) => setFormData({ ...formData, compradorTelefono: e.target.value })}
                      placeholder="+503 0000-0000"
                      className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                    {validacionTelefono && !validacionTelefono.valido && (
                      <p className="mt-1 text-[11px] text-amber-700">{validacionTelefono.mensaje}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1">
                      Entidad Vendedora / Desarrollador
                    </label>
                    <input
                      type="text"
                      value={formData.vendedorNombre}
                      onChange={(e) => setFormData({ ...formData, vendedorNombre: e.target.value })}
                      className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-slate-50"
                    />
                  </div>
                </div>
              </div>

              {/* Sección 2: Datos del Lote */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 border-b pb-1">
                  2. Identificación del Lote y Superficie
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1">
                      Código de Lote
                    </label>
                    <input
                      type="text"
                      value={formData.codigoLote}
                      onChange={(e) => setFormData({ ...formData, codigoLote: e.target.value })}
                      placeholder="ej. L-04"
                      className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 focus:outline-none font-semibold text-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1">
                      Bloque / Polígono / Manzana
                    </label>
                    <input
                      type="text"
                      value={formData.bloqueManzana}
                      onChange={(e) => setFormData({ ...formData, bloqueManzana: e.target.value })}
                      placeholder="ej. Bloque A"
                      className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1">
                      Área Total (m²)
                    </label>
                    <input
                      type="number"
                      value={formData.areaM2 || ''}
                      onChange={(e) => setFormData({ ...formData, areaM2: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 focus:outline-none font-medium"
                    />
                  </div>
                </div>

              </div>

              {/* Sección 2b: Descripción técnica (punto de partida, tramos y verificación geométrica) */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1 border-b pb-1">
                  Descripción Técnica y Polígono
                </h3>
                {!formData.puntoPartida && !formData.tramos?.length && formData.coordenadas.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-200">
                      <span className="font-semibold text-emerald-700">Coordenadas GPS directas:</span>{' '}
                      {formData.coordenadas.length} vértices.
                    </div>
                    {geometria.avisos.map((a, i) => (
                      <p
                        key={i}
                        className={`text-[11px] px-2 py-1 rounded ${
                          a.nivel === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {a.mensaje}
                      </p>
                    ))}
                  </div>
                ) : (
                  <DescripcionTecnica
                    datos={formData}
                    geometria={geometria}
                    onChange={(cambios) => {
                      setFormData({ ...formData, ...cambios });
                      setGeometriaAceptada(false);
                    }}
                  />
                )}

                {geometria.requiereConfirmacion && (
                  <label className="mt-2 flex items-center gap-2 text-[11px] text-amber-800">
                    <input
                      type="checkbox"
                      checked={geometriaAceptada}
                      onChange={(e) => setGeometriaAceptada(e.target.checked)}
                    />
                    Revisé los avisos de la geometría y confirmo que el polígono es correcto.
                  </label>
                )}
              </div>

              {/* Sección 3: Condiciones Financieras */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 border-b pb-1">
                  3. Condiciones Financieras (Dólares USD)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1">
                      Precio Total Pactado ($)
                    </label>
                    <input
                      type="number"
                      value={formData.precioPactado || ''}
                      onChange={(e) => setFormData({ ...formData, precioPactado: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 focus:outline-none font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1">
                      Prima / Anticipo ($)
                    </label>
                    <input
                      type="number"
                      value={formData.primaEntregada || ''}
                      onChange={(e) => setFormData({ ...formData, primaEntregada: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 focus:outline-none font-bold text-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1">
                      Saldo a Financiar ($)
                    </label>
                    <div className="text-xs font-bold text-slate-900 bg-slate-100 rounded-lg px-3 py-2 border border-slate-200">
                      {formatCurrency(saldoCalculado)}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1">
                      Plazo (Meses)
                    </label>
                    <input
                      type="number"
                      value={formData.plazoMeses || ''}
                      onChange={(e) => setFormData({ ...formData, plazoMeses: parseInt(e.target.value) || 1 })}
                      placeholder="36"
                      className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 focus:outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1">
                      Tasa Interés Anual (%)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={formData.tasaInteresAnual}
                      onChange={(e) => setFormData({ ...formData, tasaInteresAnual: parseFloat(e.target.value) || 0 })}
                      placeholder="12.0"
                      className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1">
                      Sistema Amortización
                    </label>
                    <select
                      value={formData.sistemaAmortizacion}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          sistemaAmortizacion: e.target.value as SistemaAmortizacion,
                        })
                      }
                      className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white"
                    >
                      <option value="FRANCES">Francés (Cuota Fija)</option>
                      <option value="DIRECTO_SIN_INTERES">Directo (Sin Intereses)</option>
                      <option value="ALEMAN">Alemán (Capital Fijo)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1">
                      Día de Corte Mensual
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={formData.diaCortePago || 15}
                      onChange={(e) => setFormData({ ...formData, diaCortePago: parseInt(e.target.value) || 15 })}
                      className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Sección 4: Gastos de la venta (plan 04.3) */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 border-b pb-1">
                  4. Gastos de esta Venta
                </h3>
                <EditorGastos
                  gastos={gastosVenta}
                  beneficiarios={beneficiarios}
                  prima={formData.primaEntregada}
                  onChange={setGastosVenta}
                  gastosPrevios={
                    negociacion ? { total: totalGastosNegociacion, etiqueta: `la negociación con ${negociacion.interesadoNombre}` } : undefined
                  }
                />
                <p className="mt-2 text-[11px] text-slate-500">
                  {hayReparto
                    ? 'Al confirmar, la prima reembolsa estos gastos a su responsable y el resto se reparte entre los beneficiarios.'
                    : 'El proyecto no tiene beneficiarios configurados: la prima quedará "sin repartir" hasta configurarlos en el módulo Beneficiarios.'}
                </p>
              </div>

              {/* Botón de Confirmación y Registro */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                {motivoBloqueo ? (
                  <div className="flex items-center gap-2 text-xs font-medium text-rose-700">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>{motivoBloqueo}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Al confirmar, el lote pasará a estado VENDIDO y se generará la tabla de pagos.</span>
                  </div>
                )}

                <Button
                  variant="primary"
                  onClick={handleConfirmRegistration}
                  disabled={
                    !formData.compradorNombre ||
                    !formData.codigoLote ||
                    !validacionDUI.valido ||
                    gastosIncompletos ||
                    isProcessing ||
                    !!motivoBloqueo ||
                    (geometria.requiereConfirmacion && !geometriaAceptada)
                  }
                  isLoading={isProcessing}
                >
                  Confirmar y Registrar Promesa
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
};
