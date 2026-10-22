import {
  Proyecto,
  Lote,
  Cliente,
  ContratoPromesa,
  Cuota,
  ReciboPago,
  MetodoPago,
  Beneficiario,
  GastoVenta,
  DistribucionCobro,
  Liquidacion,
  Negociacion,
  ResponsableGasto,
  CoordenadaGPS,
  DescripcionTecnicaLote,
  TramoDescripcion,
} from '@/shared/types';
import {
  calcularDistribucion,
  gastosPendientesDeContrato,
  gastosPendientesDeNegociacionesCanceladas,
  porcentajesValidos,
  calcularSaldos,
  calcularSaldosPorVenta,
  clavePersona,
  SaldosDeVenta,
} from '@/modules/beneficiarios/engine/reparto';
import {
  aplicarPago,
  estadoSegunPagado,
  pagadoDeCuota,
  pendienteTotal,
  prefijoDeProyecto,
  claveContadorFolio,
  formatearFolio,
  TipoFolio,
} from '@/modules/finance/engine/pagos';
import { validarDUI, formatearDUI } from '@/shared/utils/validaciones';
import { hoyISO } from '@/shared/utils/formatters';
import {
  construirReciboDePago,
  construirComprobanteDeEntrega,
  construirEstadoCuentaBeneficiarios,
  DocumentoRecibo,
  EstadoCuentaBeneficiarios,
} from '@/shared/documentos/documentos';
import { pendienteDeCuota } from '@/modules/finance/engine/pagos';
import { generarTablaAmortizacion } from '@/modules/finance/engine/amortization';
import { SEED_PROYECTOS, SEED_LOTES } from '@/mocks/seedData';
import {
  centroidePoligono,
  calcularPoligonal,
  lambertElSalvadorToWGS84,
  esPuntoLambertValido,
  distanciaAproxKm,
  dentroDeElSalvador,
  ResultadoPoligonal,
} from '@/shared/utils/geoElSalvador';

// Identificadores de los datos de ejemplo (Honduras). Ya no se cargan; solo se usan para retirarlos
// de instalaciones que los tenían guardados.
const IDS_PROYECTOS_EJEMPLO = new Set(SEED_PROYECTOS.map((p) => p.id));
const IDS_LOTES_EJEMPLO = new Set(SEED_LOTES.map((l) => l.id));

const ESTADO_VACIO = (): CrediLoteState => ({
  proyectos: [],
  lotes: [],
  clientes: [],
  contratos: [],
  cuotas: [],
  recibos: [],
  beneficiarios: [],
  gastos: [],
  distribuciones: [],
  liquidaciones: [],
  negociaciones: [],
  rotacionReparto: {},
  contadoresFolio: {},
  activeProyectoId: '',
});

/**
 * Retira los datos de ejemplo conservando lo que registró el usuario:
 * - lotes de ejemplo sin contrato,
 * - proyectos de ejemplo sin lotes.
 * Si un proyecto de ejemplo conserva lotes del usuario, su mapa se centra en esos lotes.
 */
function retirarDatosDeEjemplo(state: CrediLoteState): boolean {
  const lotesConContrato = new Set(state.contratos.map((c) => c.loteId));
  const lotesAntes = state.lotes.length;
  state.lotes = state.lotes.filter((l) => !IDS_LOTES_EJEMPLO.has(l.id) || lotesConContrato.has(l.id));

  const proyectosAntes = state.proyectos.length;
  state.proyectos = state.proyectos.filter(
    (p) => !IDS_PROYECTOS_EJEMPLO.has(p.id) || state.lotes.some((l) => l.proyectoId === p.id)
  );

  let cambio = state.lotes.length !== lotesAntes || state.proyectos.length !== proyectosAntes;

  state.proyectos
    .filter((p) => IDS_PROYECTOS_EJEMPLO.has(p.id))
    .forEach((p) => {
      const centros = state.lotes
        .filter((l) => l.proyectoId === p.id && l.verticesPoligono?.length >= 3)
        .map((l) => centroidePoligono(l.verticesPoligono))
        .filter((c): c is { lat: number; lng: number } => c !== null);
      if (centros.length === 0) return;
      const centro = {
        lat: centros.reduce((acc, c) => acc + c.lat, 0) / centros.length,
        lng: centros.reduce((acc, c) => acc + c.lng, 0) / centros.length,
      };
      if (Math.abs(centro.lat - p.centroMapa.lat) > 1e-6 || Math.abs(centro.lng - p.centroMapa.lng) > 1e-6) {
        p.centroMapa = centro;
        cambio = true;
      }
    });

  if (!state.proyectos.some((p) => p.id === state.activeProyectoId)) {
    state.activeProyectoId = state.proyectos[0]?.id || '';
    cambio = true;
  }
  return cambio;
}

interface CrediLoteState {
  proyectos: Proyecto[];
  lotes: Lote[];
  clientes: Cliente[];
  contratos: ContratoPromesa[];
  cuotas: Cuota[];
  recibos: ReciboPago[];
  // Sucesión, beneficiarios y gastos de venta (plan 04.3)
  beneficiarios: Beneficiario[];
  gastos: GastoVenta[];
  distribuciones: DistribucionCobro[];
  liquidaciones: Liquidacion[];
  negociaciones: Negociacion[];
  /** Por proyecto: índice del beneficiario que recibe el próximo centavo sobrante (RN-B3). */
  rotacionReparto: Record<string, number>;
  /** Último número de folio por proyecto, tipo de documento y año (D5). */
  contadoresFolio: Record<string, number>;
  activeProyectoId: string;
}

/** Resultado de las operaciones que pueden rechazarse por una regla de negocio. */
export interface Resultado<T = undefined> {
  ok: boolean;
  mensaje?: string;
  valor?: T;
}

/** Datos para registrar una promesa de venta (ver registrarPromesaVenta). */
/** Fila de la vista "Lotes vendidos": el lote, su promesa y cómo va el pago. */
export interface LoteVendido {
  lote: Lote;
  contrato: ContratoPromesa;
  comprador?: Cliente;
  saldoPendiente: number;
  cuotasPagadas: number;
  cuotasTotales: number;
  /** Primera cuota que falta pagar (total o parcialmente). */
  proximaCuota?: Cuota;
  /** El lote tiene polígono en el mapa. */
  dibujado: boolean;
}

/** Documento guardado en Neon Storage (promesa escaneada u otro anexo del contrato). */
export interface DocumentoGuardado {
  id: string;
  nombre: string;
  mime: string;
  tamano: number;
  creadoEn: string;
  /** Ya se generó la versión limpia del escaneo (si no, se genera al pedirla). */
  tieneVersionLimpia?: boolean;
}

export interface DatosPromesaVenta {
  contrato: ContratoPromesa;
  cliente: Cliente;
  loteModificado: Lote;
  /** Gastos de esta venta capturados en la ingesta (plan 04.3, 8.3.3). */
  gastos?: Omit<GastoVenta, 'id' | 'proyectoId' | 'loteId' | 'contratoId' | 'createdAt'>[];
  /** Negociación que se convierte en esta venta (plan 04.3, 8.7): sus gastos pasan a la venta. */
  negociacionId?: string;
  /** Cómo se pagó la prima (para su recibo). */
  pagoPrima?: { metodo?: MetodoPago; referencia?: string };
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Código de lote comparable: sin tildes, mayúsculas y espacios simples ("Porción  uno" = "PORCIÓN UNO"). */
const claveLote = (codigo: string) =>
  codigo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

/** Revisa los tramos de una descripción técnica. Devuelve el motivo del rechazo o null si son válidos. */
function validarTramos(tramos: TramoDescripcion[]): string | null {
  const malo = tramos.findIndex(
    (t) =>
      !['N', 'S'].includes(t.inicio) ||
      !['E', 'W'].includes(t.fin) ||
      !(t.grados >= 0 && t.grados <= 90) ||
      !(t.minutos >= 0 && t.minutos < 60) ||
      !(t.segundos >= 0 && t.segundos < 60) ||
      !(t.distancia > 0 && Number.isFinite(t.distancia))
  );
  return malo >= 0 ? `El tramo ${malo + 1} de la descripción técnica no es válido. Revise su rumbo y distancia.` : null;
}

/**
 * Deja la descripción técnica en su forma guardada: si trae coordenada Lambert, calcula el punto de partida
 * en el mapa. Devuelve undefined si no hay tramos.
 */
function normalizarDescripcionTecnica(d?: DescripcionTecnicaLote): DescripcionTecnicaLote | undefined {
  if (!d || d.tramos.length === 0) return undefined;
  const tramos = d.tramos.map(({ inicio, grados, minutos, segundos, fin, distancia }) => ({
    inicio,
    grados,
    minutos,
    segundos,
    fin,
    distancia,
  }));
  const referenciaPartida = d.referenciaPartida?.trim() || undefined;
  if (esPuntoLambertValido(d.puntoPartida)) {
    const { norte, este } = d.puntoPartida;
    return { tramos, referenciaPartida, puntoPartida: { norte, este }, origen: lambertElSalvadorToWGS84(este, norte), ubicadoPor: 'LAMBERT' };
  }
  if (d.origen && dentroDeElSalvador(d.origen)) {
    return { tramos, referenciaPartida, origen: d.origen, ubicadoPor: d.ubicadoPor ?? 'MAPA' };
  }
  return { tramos, referenciaPartida };
}
const aCent = (monto: number) => Math.round(monto * 100);

const nuevoId = (prefijo: string) => `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const STORAGE_KEY = 'credilote_skeleton_v1';

// ---------------------------------------------------------------------------
// Sincronización con Neon (ADR-013). El estado vive en memoria y en localStorage (copia local) y se
// envía a la API del servidor (/api/estado), que lo guarda en Postgres con número de versión.
// ---------------------------------------------------------------------------
const META_SYNC_KEY = 'credilote_sync_meta';
const RESPALDO_CONFLICTO_PREFIJO = 'credilote_respaldo_local_';
const ESPERA_ENVIO_MS = 600;
const REINTENTO_MS = 30_000;

export type ModoSincronizacion = 'iniciando' | 'nube' | 'local';

export interface EstadoSincronizacion {
  modo: ModoSincronizacion;
  /** Hay cambios locales que todavía no están en la nube. */
  pendiente: boolean;
  /** Versión del estado en la nube con la que coincide la copia local. */
  version: number;
  ultimoGuardado?: string;
  /** Aviso para mostrar al usuario (p. ej. sin conexión o conflicto resuelto). */
  mensaje?: string;
}

interface MetaSincronizacion {
  versionBase: number;
  sucio: boolean;
}

function leerMeta(): MetaSincronizacion {
  try {
    const raw = localStorage.getItem(META_SYNC_KEY);
    if (raw) return { versionBase: 0, sucio: false, ...JSON.parse(raw) };
  } catch {
    /* sin almacenamiento local */
  }
  return { versionBase: 0, sucio: false };
}

function guardarMeta(meta: MetaSincronizacion) {
  try {
    localStorage.setItem(META_SYNC_KEY, JSON.stringify(meta));
  } catch {
    /* sin almacenamiento local */
  }
}

const tieneDatos = (st: CrediLoteState) =>
  st.proyectos.length > 0 || st.contratos.length > 0 || st.lotes.length > 0 || st.negociaciones.length > 0;

class StorageService {
  private state: CrediLoteState;
  private listeners: (() => void)[] = [];

  // Sincronización con la nube (solo en el navegador)
  private meta: MetaSincronizacion = { versionBase: 0, sucio: false };
  private sync: EstadoSincronizacion = { modo: 'local', pendiente: false, version: 0 };
  private generacion = 0;
  private enviando = false;
  private temporizadorEnvio: ReturnType<typeof setTimeout> | null = null;
  private temporizadorReintento: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.state = this.loadFromStorage();
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      this.meta = leerMeta();
      this.sync = { modo: 'iniciando', pendiente: this.meta.sucio, version: this.meta.versionBase };
      void this.iniciarSincronizacion();
    }
  }

  // --- Sincronización con Neon (ADR-013) ---

  public getEstadoSincronizacion(): EstadoSincronizacion {
    return this.sync;
  }

  /** Reintenta de inmediato el envío de cambios pendientes (p. ej. desde un botón "Sincronizar"). */
  public forzarSincronizacion() {
    if (this.sync.modo === 'iniciando') return;
    if (this.sync.modo === 'local') {
      void this.iniciarSincronizacion();
      return;
    }
    void this.enviarEstado();
  }

  private actualizarSync(cambios: Partial<EstadoSincronizacion>) {
    this.sync = { ...this.sync, ...cambios, pendiente: this.meta.sucio, version: this.meta.versionBase };
    this.listeners.forEach((l) => l());
  }

  private async iniciarSincronizacion() {
    try {
      const r = await fetch('/api/estado', { headers: { Accept: 'application/json' } });
      if (r.status === 404) {
        // La nube está vacía: si hay datos locales, se suben (primera migración)
        this.meta = { versionBase: 0, sucio: tieneDatos(this.state) };
        guardarMeta(this.meta);
        this.actualizarSync({ modo: 'nube', mensaje: undefined });
        if (this.meta.sucio) void this.enviarEstado();
        return;
      }
      if (!r.ok) throw new Error(await mensajeDeError(r));
      const remoto: { version: number; datos: CrediLoteState; actualizadoEn: string } = await r.json();
      this.adoptarRemoto(remoto);
    } catch (e) {
      this.pasarAModoLocal(e);
    }
  }

  /** Decide entre la copia local y la de la nube al iniciar o tras un conflicto. */
  private adoptarRemoto(remoto: { version: number; datos: CrediLoteState; actualizadoEn: string }) {
    let mensaje: string | undefined;
    if (remoto.version === this.meta.versionBase) {
      // Misma base: si hay cambios locales sin subir, se envían
      this.actualizarSync({ modo: 'nube', ultimoGuardado: remoto.actualizadoEn, mensaje: undefined });
      if (this.meta.sucio) void this.enviarEstado();
      return;
    }
    if (this.meta.sucio && tieneDatos(this.state)) {
      // Cambios locales y remotos a la vez: gana la nube y la copia local queda respaldada
      const clave = `${RESPALDO_CONFLICTO_PREFIJO}${new Date().toISOString().replace(/[:.]/g, '-')}`;
      try {
        localStorage.setItem(clave, JSON.stringify(this.state));
      } catch {
        /* sin espacio: se pierde solo la copia de respaldo */
      }
      mensaje = 'Había cambios en otro equipo: se cargaron los datos de la nube y la copia local quedó respaldada en este navegador.';
    }
    this.state = { ...ESTADO_VACIO(), ...remoto.datos };
    retirarDatosDeEjemplo(this.state);
    const migrado = this.emitirRecibosDePrimaFaltantes();
    this.meta = { versionBase: remoto.version, sucio: migrado };
    guardarMeta(this.meta);
    this.saveLocal(this.state);
    this.actualizarSync({ modo: 'nube', ultimoGuardado: remoto.actualizadoEn, mensaje });
    if (migrado) void this.enviarEstado();
  }

  private pasarAModoLocal(e: unknown) {
    const detalle = e instanceof Error ? e.message : String(e);
    this.actualizarSync({
      modo: 'local',
      mensaje: `Sin conexión con la base de datos: se trabaja con la copia local y se sincronizará después. (${detalle})`,
    });
    if (this.temporizadorReintento) clearTimeout(this.temporizadorReintento);
    this.temporizadorReintento = setTimeout(() => void this.iniciarSincronizacion(), REINTENTO_MS);
  }

  private programarEnvio() {
    if (typeof window === 'undefined' || this.sync.modo === 'iniciando') return;
    if (this.temporizadorEnvio) clearTimeout(this.temporizadorEnvio);
    this.temporizadorEnvio = setTimeout(() => void this.enviarEstado(), ESPERA_ENVIO_MS);
  }

  private async enviarEstado() {
    if (this.enviando) return;
    if (this.sync.modo === 'local') return; // el reintento periódico reanuda
    this.enviando = true;
    const generacionEnviada = this.generacion;
    try {
      const r = await fetch('/api/estado', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionEsperada: this.meta.versionBase, datos: this.state }),
      });
      if (r.status === 409) {
        // Otro equipo guardó antes: se descarga la versión de la nube y se resuelve
        const remoto = await fetch('/api/estado');
        if (!remoto.ok) throw new Error(await mensajeDeError(remoto));
        this.adoptarRemoto(await remoto.json());
        return;
      }
      if (!r.ok) throw new Error(await mensajeDeError(r));
      const { version } = await r.json();
      this.meta = { versionBase: version, sucio: this.generacion !== generacionEnviada };
      guardarMeta(this.meta);
      this.actualizarSync({ modo: 'nube', ultimoGuardado: new Date().toISOString(), mensaje: undefined });
    } catch (e) {
      this.pasarAModoLocal(e);
    } finally {
      this.enviando = false;
      if (this.meta.sucio && this.sync.modo === 'nube') this.programarEnvio();
    }
  }

  // --- Documentos en Neon Storage (ADR-013) ---

  /**
   * Sube el PDF o la imagen de una promesa al almacenamiento de documentos. Sin contrato (null) queda guardado y se
   * vincula al registrar la promesa. Si el mismo archivo ya estaba guardado, devuelve ese documento.
   */
  public async subirDocumento(contratoId: string | null, archivo: File): Promise<Resultado<{ id: string; nombre: string }>> {
    try {
      const url =
        `/api/documentos?nombre=${encodeURIComponent(archivo.name)}` +
        (contratoId ? `&contratoId=${encodeURIComponent(contratoId)}` : '');
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': archivo.type }, body: archivo });
      if (!r.ok) return { ok: false, mensaje: await mensajeDeError(r) };
      return { ok: true, valor: await r.json() };
    } catch (e) {
      return { ok: false, mensaje: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Vincula a un contrato un documento que se guardó antes de registrar la promesa. */
  public async vincularDocumento(documentoId: string, contratoId: string): Promise<Resultado> {
    try {
      const r = await fetch(
        `/api/documentos/${encodeURIComponent(documentoId)}/vincular?contratoId=${encodeURIComponent(contratoId)}`,
        { method: 'POST' }
      );
      return r.ok ? { ok: true } : { ok: false, mensaje: await mensajeDeError(r) };
    } catch (e) {
      return { ok: false, mensaje: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * Al registrar una promesa: vincula a su contrato el documento que se guardó al subirlo. Si esa subida había fallado
   * (p. ej. sin conexión), lo sube otra vez, ya con el contrato.
   */
  public async guardarDocumentoDeContrato(
    subida: Promise<Resultado<{ id: string; nombre: string }>> | null,
    contratoId: string,
    archivo: File
  ): Promise<Resultado> {
    const previa = subida ? await subida : null;
    if (previa?.ok && previa.valor) return this.vincularDocumento(previa.valor.id, contratoId);
    const nueva = await this.subirDocumento(contratoId, archivo);
    return nueva.ok ? { ok: true } : { ok: false, mensaje: nueva.mensaje };
  }

  /** Documentos subidos que no pertenecen a ningún contrato (promesas sin registrar o rechazadas). */
  public async listarDocumentosSinContrato(): Promise<DocumentoGuardado[]> {
    try {
      const r = await fetch('/api/documentos?sinContrato=1');
      return r.ok ? await r.json() : [];
    } catch {
      return [];
    }
  }

  /** Documentos guardados de un contrato (vacío si no hay conexión). */
  public async listarDocumentos(contratoId: string): Promise<DocumentoGuardado[]> {
    try {
      const r = await fetch(`/api/documentos?contratoId=${encodeURIComponent(contratoId)}`);
      return r.ok ? await r.json() : [];
    } catch {
      return [];
    }
  }

  /** URL para ver o descargar un documento guardado. */
  public urlDocumento(documentoId: string): string {
    return `/api/documentos/${documentoId}`;
  }

  /**
   * URL de la versión limpia de un escaneo (fondo blanco, sin sombras, más contraste). Es la misma imagen del
   * documento, no una transcripción. Responde 422 si el documento no es un escaneo que se pueda limpiar.
   */
  public urlDocumentoLimpio(documentoId: string): string {
    return `/api/documentos/${documentoId}/limpio`;
  }

  private loadFromStorage(): CrediLoteState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: CrediLoteState = { ...ESTADO_VACIO(), ...JSON.parse(raw) };

        // Asignar proyectoId a cualquier lote que haya quedado huérfano
        parsed.lotes.forEach((l) => {
          if (!l.proyectoId && parsed.activeProyectoId) {
            l.proyectoId = parsed.activeProyectoId;
          }
        });

        const cambioEjemplo = retirarDatosDeEjemplo(parsed);
        this.state = parsed;
        const cambioPrimas = this.emitirRecibosDePrimaFaltantes();
        if (cambioEjemplo || cambioPrimas) {
          this.saveToStorage(parsed);
        }
        return parsed;
      }
    } catch (e) {
      console.error('Error al cargar datos desde localStorage:', e);
    }

    // Sin datos guardados: la aplicación arranca vacía (ya no se cargan datos de ejemplo)
    const initialState = ESTADO_VACIO();
    this.saveToStorage(initialState);
    return initialState;
  }

  /**
   * Las ventas registradas antes de existir el recibo de prima no lo tienen: se emite con la fecha de firma
   * y se vincula al reparto de la prima si ya existía. Devuelve true si cambió algo.
   */
  private emitirRecibosDePrimaFaltantes(): boolean {
    let cambio = false;
    this.state.contratos.forEach((c) => {
      if (c.primaEntregada <= 0) return;
      if (this.state.recibos.some((r) => r.contratoId === c.id && r.concepto === 'PRIMA')) return;
      const recibo = this.crearReciboPrima(c);
      if (!recibo) return;
      const reparto = this.state.distribuciones.find((d) => d.contratoId === c.id && d.origen === 'PRIMA');
      const reciboExiste = reparto?.reciboId && this.state.recibos.some((r) => r.id === reparto.reciboId && r.id !== recibo.id);
      if (reparto && !reciboExiste) reparto.reciboId = recibo.id;
      cambio = true;
    });
    return cambio;
  }

  private crearReciboPrima(c: ContratoPromesa, pago?: { metodo?: MetodoPago; referencia?: string }): ReciboPago | null {
    const lote = this.state.lotes.find((l) => l.id === c.loteId);
    if (!lote) return null;
    const cuotas = this.state.cuotas.filter((q) => q.contratoId === c.id);
    const recibo: ReciboPago = {
      id: nuevoId('rec'),
      folio: this.siguienteFolio(lote.proyectoId, 'RECIBO', c.fechaFirma),
      concepto: 'PRIMA',
      contratoId: c.id,
      clienteId: c.compradorId,
      montoPagado: c.primaEntregada,
      metodoPago: pago?.metodo,
      referenciaBancaria: pago?.referencia,
      fechaPago: c.fechaFirma,
      saldoPendienteDespues: pendienteTotal(cuotas),
    };
    this.state.recibos.push(recibo);
    return recibo;
  }

  /** Folio consecutivo por proyecto, tipo y año (D5). Incrementa el contador; no llama a notify(). */
  private siguienteFolio(proyectoId: string, tipo: TipoFolio, fechaISO: string): string {
    const proyecto = this.state.proyectos.find((p) => p.id === proyectoId);
    const prefijo = proyecto?.prefijoFolio?.trim().toUpperCase() || prefijoDeProyecto(proyecto?.nombre ?? 'Recibo');
    const anio = Number((FECHA_ISO.test(fechaISO) ? fechaISO : hoyISO()).slice(0, 4));
    const clave = claveContadorFolio(proyectoId, tipo, anio);
    const numero = (this.state.contadoresFolio[clave] ?? 0) + 1;
    this.state.contadoresFolio[clave] = numero;
    return formatearFolio(prefijo, tipo, anio, numero);
  }

  /** Guarda la copia local y marca cambios pendientes de subir a la nube. */
  private saveToStorage(state: CrediLoteState) {
    this.saveLocal(state);
    if (typeof window === 'undefined') return;
    this.generacion++;
    if (!this.meta.sucio) {
      this.meta = { ...this.meta, sucio: true };
      guardarMeta(this.meta);
    }
    this.programarEnvio();
  }

  private saveLocal(state: CrediLoteState) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Error al guardar en localStorage:', e);
    }
  }

  private notify() {
    this.saveToStorage(this.state);
    this.listeners.forEach((l) => l());
  }

  public subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  // --- Proyectos ---
  public getProyectos(): Proyecto[] {
    return this.state.proyectos;
  }

  public getActiveProyecto(): Proyecto | undefined {
    return this.state.proyectos.find((p) => p.id === this.state.activeProyectoId) || this.state.proyectos[0];
  }

  public setActiveProyectoId(id: string) {
    this.state.activeProyectoId = id;
    this.notify();
  }

  public addProyecto(proyecto: Proyecto) {
    this.state.proyectos.push(proyecto);
    if (!this.state.activeProyectoId) {
      this.state.activeProyectoId = proyecto.id;
    }
    this.notify();
  }

  public updateProyecto(proyecto: Proyecto) {
    const idx = this.state.proyectos.findIndex((p) => p.id === proyecto.id);
    if (idx >= 0) {
      this.state.proyectos[idx] = proyecto;
      this.notify();
    }
  }

  public contarLotesDeProyecto(proyectoId: string): number {
    return this.state.lotes.filter((l) => l.proyectoId === proyectoId).length;
  }

  /**
   * Elimina un proyecto. Si tiene lotes, deben moverse a otro proyecto (`moverLotesA`);
   * sin destino, la eliminación se rechaza para no perder ventas registradas.
   */
  public deleteProyecto(proyectoId: string, moverLotesA?: string): { ok: boolean; mensaje?: string } {
    const tieneLotes = this.contarLotesDeProyecto(proyectoId) > 0;
    if (tieneLotes && !moverLotesA) {
      return { ok: false, mensaje: 'El proyecto tiene lotes: elija a qué proyecto moverlos antes de eliminarlo.' };
    }
    if (moverLotesA) {
      if (!this.state.proyectos.some((p) => p.id === moverLotesA) || moverLotesA === proyectoId) {
        return { ok: false, mensaje: 'Proyecto de destino no válido.' };
      }
      const mover = <T extends { proyectoId: string }>(lista: T[]) =>
        lista.forEach((x) => {
          if (x.proyectoId === proyectoId) x.proyectoId = moverLotesA;
        });
      mover(this.state.lotes);
      mover(this.state.gastos);
      mover(this.state.distribuciones);
      mover(this.state.liquidaciones);
      mover(this.state.negociaciones);
    }
    this.state.beneficiarios = this.state.beneficiarios.filter((b) => b.proyectoId !== proyectoId);
    delete this.state.rotacionReparto[proyectoId];
    this.state.proyectos = this.state.proyectos.filter((p) => p.id !== proyectoId);
    if (this.state.activeProyectoId === proyectoId) {
      this.state.activeProyectoId = moverLotesA || this.state.proyectos[0]?.id || '';
    }
    this.notify();
    return { ok: true };
  }

  // --- Lotes ---
  public getLotes(proyectoId?: string): Lote[] {
    const pId = proyectoId || this.state.activeProyectoId || this.state.proyectos[0]?.id;
    if (!pId) return this.state.lotes;

    // Solo los lotes del proyecto (antes, un proyecto vacío mostraba los lotes de todos los proyectos)
    return this.state.lotes.filter((l) => l.proyectoId === pId);
  }

  public getLoteById(id: string): Lote | undefined {
    return this.state.lotes.find((l) => l.id === id);
  }

  public updateLote(lote: Lote) {
    const idx = this.state.lotes.findIndex((l) => l.id === lote.id);
    if (idx >= 0) {
      this.state.lotes[idx] = lote;
      this.notify();
    }
  }

  public addLote(lote: Lote) {
    this.state.lotes.push(lote);
    this.notify();
  }

  /** Lote existente que corresponde al de una promesa nueva: por id o por código (sin distinguir tildes ni mayúsculas). */
  private buscarLoteDeRegistro(lote: Pick<Lote, 'id' | 'codigoLote'>): Lote | undefined {
    const clave = claveLote(lote.codigoLote ?? '');
    return this.state.lotes.find((l) => l.id === lote.id || (!!clave && claveLote(l.codigoLote) === clave));
  }

  /**
   * Ubica en el mapa un lote cuya escritura trae rumbos y distancias pero no coordenadas. El punto de
   * partida puede ser la coordenada Lambert (escritura o plano del CNR) o el punto que el administrador
   * marca en el mapa. Calcula el polígono desde ahí (RN-G2) y centra el mapa del proyecto si hace falta.
   */
  public ubicarLote(
    loteId: string,
    punto: { norte: number; este: number } | CoordenadaGPS
  ): Resultado<ResultadoPoligonal> {
    const lote = this.state.lotes.find((l) => l.id === loteId);
    if (!lote) return { ok: false, mensaje: 'No se encontró el lote.' };
    const descripcion = lote.descripcionTecnica;
    if (!descripcion || descripcion.tramos.length < 3) {
      return { ok: false, mensaje: 'El lote no tiene guardados los tramos de rumbo y distancia de su escritura.' };
    }

    let origen: CoordenadaGPS;
    if ('norte' in punto) {
      if (!esPuntoLambertValido(punto)) {
        return { ok: false, mensaje: 'La coordenada Lambert no es válida para El Salvador (Norte entre 100 000 y 400 000, Este entre 300 000 y 800 000).' };
      }
      origen = lambertElSalvadorToWGS84(punto.este, punto.norte);
    } else {
      if (!dentroDeElSalvador(punto)) return { ok: false, mensaje: 'El punto marcado está fuera de El Salvador.' };
      origen = { lat: punto.lat, lng: punto.lng };
    }

    const poligonal = calcularPoligonal(origen, descripcion.tramos);
    lote.verticesPoligono = poligonal.vertices;
    lote.descripcionTecnica = {
      ...descripcion,
      origen,
      ubicadoPor: 'norte' in punto ? 'LAMBERT' : 'MAPA',
      puntoPartida: 'norte' in punto ? { norte: punto.norte, este: punto.este } : undefined,
    };
    this.centrarProyectoEnSusLotes(lote.proyectoId);
    this.notify();
    return { ok: true, valor: poligonal };
  }

  /**
   * Guarda o corrige la descripción técnica de un lote ya registrado (p. ej. tramos que no se guardaron).
   * Si el lote ya estaba ubicado, redibuja el polígono desde el mismo punto de partida.
   */
  public guardarDescripcionTecnica(
    loteId: string,
    datos: Pick<DescripcionTecnicaLote, 'tramos' | 'puntoPartida' | 'referenciaPartida'>
  ): Resultado {
    const lote = this.state.lotes.find((l) => l.id === loteId);
    if (!lote) return { ok: false, mensaje: 'No se encontró el lote.' };
    const error = validarTramos(datos.tramos);
    if (error) return { ok: false, mensaje: error };
    if (datos.puntoPartida && !esPuntoLambertValido(datos.puntoPartida)) {
      return { ok: false, mensaje: 'La coordenada Lambert no es válida para El Salvador.' };
    }

    const anterior = lote.descripcionTecnica;
    const descripcion = normalizarDescripcionTecnica({
      ...datos,
      // Sin coordenada Lambert nueva, se conserva el punto marcado en el mapa
      origen: datos.puntoPartida ? undefined : anterior?.origen,
      ubicadoPor: datos.puntoPartida ? undefined : anterior?.ubicadoPor,
    });
    lote.descripcionTecnica = descripcion;
    if (descripcion?.origen && descripcion.tramos.length >= 3) {
      lote.verticesPoligono = calcularPoligonal(descripcion.origen, descripcion.tramos).vertices;
      this.centrarProyectoEnSusLotes(lote.proyectoId);
    }
    this.notify();
    return { ok: true };
  }

  /** Lotes del proyecto con tramos guardados pero sin polígono: falta ubicarlos en el mapa. */
  public getLotesSinUbicar(proyectoId?: string): Lote[] {
    return this.getLotes(proyectoId).filter(
      (l) => (l.descripcionTecnica?.tramos.length ?? 0) >= 3 && (l.verticesPoligono?.length ?? 0) < 3
    );
  }

  /**
   * Si el centro del mapa del proyecto está lejos (más de 20 km) de todos sus lotes dibujados —por ejemplo,
   * se quedó en el valor por defecto—, lo mueve al centro de esos lotes.
   */
  private centrarProyectoEnSusLotes(proyectoId: string) {
    const proyecto = this.state.proyectos.find((p) => p.id === proyectoId);
    if (!proyecto) return;
    const centros = this.state.lotes
      .filter((l) => l.proyectoId === proyectoId && (l.verticesPoligono?.length ?? 0) >= 3)
      .map((l) => centroidePoligono(l.verticesPoligono))
      .filter((c): c is CoordenadaGPS => c !== null);
    if (centros.length === 0 || centros.some((c) => distanciaAproxKm(c, proyecto.centroMapa) <= 20)) return;
    proyecto.centroMapa = {
      lat: centros.reduce((a, c) => a + c.lat, 0) / centros.length,
      lng: centros.reduce((a, c) => a + c.lng, 0) / centros.length,
    };
  }

  // --- Clientes ---
  public getClientes(): Cliente[] {
    return this.state.clientes;
  }

  public getClienteById(id: string): Cliente | undefined {
    return this.state.clientes.find((c) => c.id === id);
  }

  public addCliente(cliente: Cliente): Cliente {
    this.state.clientes.push(cliente);
    this.notify();
    return cliente;
  }

  // --- Contratos y Promesas ---
  public getContratos(): ContratoPromesa[] {
    return this.state.contratos;
  }

  public getContratoByLoteId(loteId: string): ContratoPromesa | undefined {
    return this.state.contratos.find((c) => c.loteId === loteId);
  }

  /**
   * Valida una promesa antes de registrarla. Devuelve el motivo del rechazo o null si es válida.
   * Evita, por ejemplo, registrar una venta de $0 cuando el documento subido no traía el precio.
   */
  public validarPromesaVenta(data: DatosPromesaVenta): string | null {
    const { contrato: c, cliente, loteModificado: lote } = data;
    if (!cliente.nombreCompleto?.trim()) return 'Indique el nombre del comprador.';
    if (!lote.codigoLote?.trim()) return 'Indique el código o nombre del lote.';
    if (!Number.isFinite(c.precioPactado) || !(c.precioPactado > 0)) {
      return 'El precio de venta debe ser mayor que cero. Si el documento no lo trae, ingréselo antes de confirmar.';
    }
    if (!Number.isFinite(c.primaEntregada) || c.primaEntregada < 0) return 'La prima no puede ser negativa.';
    if (aCent(c.primaEntregada) > aCent(c.precioPactado)) return 'La prima no puede ser mayor que el precio de venta.';
    if (!FECHA_ISO.test(c.fechaFirma)) return 'Indique la fecha de firma de la promesa.';
    if (aCent(c.precioPactado) > aCent(c.primaEntregada)) {
      if (!Number.isInteger(c.plazoMeses) || c.plazoMeses < 1 || c.plazoMeses > 600) {
        return 'El plazo debe ser un número entero de meses (al menos 1).';
      }
      if (!Number.isInteger(c.diaCortePago) || c.diaCortePago < 1 || c.diaCortePago > 31) {
        return 'El día de pago debe estar entre 1 y 31.';
      }
      if (!Number.isFinite(c.tasaInteresAnual) || c.tasaInteresAnual < 0) return 'La tasa de interés no puede ser negativa.';
    }

    // Un lote no se vende dos veces (mismo criterio con que registrarPromesaVenta lo busca)
    const loteExistente = this.buscarLoteDeRegistro(lote);
    if (loteExistente && this.state.contratos.some((k) => k.loteId === loteExistente.id)) {
      return `El lote ${loteExistente.codigoLote} ya tiene una promesa de venta registrada.`;
    }

    // La misma promesa subida otra vez con el código del lote leído distinto: mismo comprador, precio y área
    const dui = formatearDUI(cliente.dniIdentificacion ?? '');
    const repetida = dui
      ? this.state.contratos.find((k) => {
          const comprador = this.state.clientes.find((x) => x.id === k.compradorId);
          const loteK = this.state.lotes.find((l) => l.id === k.loteId);
          return (
            !!comprador &&
            !!loteK &&
            formatearDUI(comprador.dniIdentificacion ?? '') === dui &&
            aCent(k.precioPactado) === aCent(c.precioPactado) &&
            Math.abs(loteK.areaM2 - lote.areaM2) < 1
          );
        })
      : undefined;
    if (repetida) {
      const loteR = this.state.lotes.find((l) => l.id === repetida.loteId)!;
      return `Esta promesa ya está registrada en el lote ${loteR.codigoLote} (mismo comprador, precio y área).`;
    }

    if (data.negociacionId) {
      const n = this.state.negociaciones.find((x) => x.id === data.negociacionId);
      if (!n) return 'No se encontró la negociación vinculada.';
      if (n.estado !== 'EN_NEGOCIACION' && n.estado !== 'ESPERANDO_PROMESA') {
        return 'La negociación vinculada ya fue convertida en venta o cancelada.';
      }
    }

    const errorTramos = validarTramos(data.loteModificado.descripcionTecnica?.tramos ?? []);
    if (errorTramos) return errorTramos;

    for (const g of data.gastos ?? []) {
      const error = this.validarGasto(g, this.state.activeProyectoId);
      if (error) return `Gasto "${g.descripcion.trim() || g.categoria}": ${error}`;
    }
    return null;
  }

  /**
   * Registra una promesa de venta: cliente, contrato, lote, plan de pagos, gastos y recibo de la prima.
   * Si los datos no son válidos (validarPromesaVenta) no guarda nada y devuelve el motivo.
   */
  public registrarPromesaVenta(data: DatosPromesaVenta): Resultado<ContratoPromesa> {
    const error = this.validarPromesaVenta(data);
    if (error) return { ok: false, mensaje: error };

    // 1. Asegurar que haya un proyecto activo válido (si no hay ninguno, se crea uno centrado en el lote)
    if (!this.state.activeProyectoId) {
      if (this.state.proyectos.length === 0) {
        const centro = centroidePoligono(data.loteModificado.verticesPoligono ?? []) ?? { lat: 13.6929, lng: -89.2182 };
        this.state.proyectos.push({
          id: `proj-${Date.now()}`,
          nombre: 'Proyecto principal',
          ubicacion: 'Ubicación no especificada',
          centroMapa: centro,
          zoomDefault: 17,
          moneda: 'USD',
          createdAt: hoyISO(),
        });
      }
      this.state.activeProyectoId = this.state.proyectos[0].id;
    }

    const currentProjectId = this.state.activeProyectoId;
    data.loteModificado.proyectoId = currentProjectId;
    data.contrato.loteId = data.loteModificado.id;

    // 2. Un lote sin vértices queda sin polígono: no se dibuja una figura inventada (RN-G2, tarea 7.5).
    // La descripción técnica se guarda aunque falte el punto de partida, para ubicar el lote después.
    const descripcion = normalizarDescripcionTecnica(data.loteModificado.descripcionTecnica);
    data.loteModificado.descripcionTecnica = descripcion;
    const verticesRecibidos = data.loteModificado.verticesPoligono ?? [];
    if (descripcion?.origen && verticesRecibidos.length < 3) {
      data.loteModificado.verticesPoligono = calcularPoligonal(descripcion.origen, descripcion.tramos).vertices;
    } else if (descripcion && !descripcion.origen && verticesRecibidos.length >= 3) {
      // El polígono ya viene calculado desde la primera latitud/longitud del documento: ese primer vértice es el
      // punto de partida. Si el lote ya estaba dibujado, se conserva cómo se ubicó.
      const anterior = this.buscarLoteDeRegistro(data.loteModificado);
      if (anterior?.descripcionTecnica?.origen) {
        descripcion.origen = anterior.descripcionTecnica.origen;
        descripcion.ubicadoPor = anterior.descripcionTecnica.ubicadoPor;
      } else if ((anterior?.verticesPoligono?.length ?? 0) < 3) {
        descripcion.origen = verticesRecibidos[0];
        descripcion.ubicadoPor = 'DOCUMENTO';
      }
    }

    // 3. Verificar o crear cliente
    let cliente = this.state.clientes.find(
      (c) => c.dniIdentificacion === data.cliente.dniIdentificacion
    );
    if (!cliente) {
      this.state.clientes.push(data.cliente);
      cliente = data.cliente;
    }

    // 4. Guardar contrato
    this.state.contratos.push(data.contrato);

    // 5. Actualizar o agregar el lote
    const existente = this.buscarLoteDeRegistro(data.loteModificado);
    const loteIdx = existente ? this.state.lotes.indexOf(existente) : -1;
    if (existente) {
      data.loteModificado.id = existente.id;
      data.contrato.loteId = existente.id;
    }

    if (loteIdx >= 0) {
      const anterior = this.state.lotes[loteIdx];
      this.state.lotes[loteIdx] = {
        ...anterior,
        ...data.loteModificado,
        // Un lote del catálogo ya dibujado conserva su polígono si la promesa no trae uno (p. ej. lotificaciones)
        verticesPoligono:
          (data.loteModificado.verticesPoligono?.length ?? 0) >= 3 ? data.loteModificado.verticesPoligono : anterior.verticesPoligono,
        linderos: data.loteModificado.linderos ?? anterior.linderos,
        descripcionTecnica: data.loteModificado.descripcionTecnica ?? anterior.descripcionTecnica,
        estado: 'VENDIDO',
        compradorId: cliente.id,
        nombreCompradorLabel: cliente.nombreCompleto,
      };
    } else {
      this.state.lotes.push({
        ...data.loteModificado,
        estado: 'VENDIDO',
        compradorId: cliente.id,
        nombreCompradorLabel: cliente.nombreCompleto,
      });
    }

    this.centrarProyectoEnSusLotes(currentProjectId);

    // 6. Generar tabla de amortización
    const cuotasGeneradas = generarTablaAmortizacion({
      precioTotal: data.contrato.precioPactado,
      prima: data.contrato.primaEntregada,
      plazoMeses: data.contrato.plazoMeses,
      tasaInteresAnual: data.contrato.tasaInteresAnual,
      sistema: data.contrato.sistemaAmortizacion,
      fechaInicio: data.contrato.fechaFirma,
      diaCortePago: data.contrato.diaCortePago,
      contratoId: data.contrato.id,
    });

    this.state.cuotas.push(...cuotasGeneradas);

    // 7. Gastos de la venta (plan 04.3)
    const ahora = new Date().toISOString();
    (data.gastos ?? [])
      .filter((g) => !this.validarGasto(g, currentProjectId))
      .forEach((g) =>
      this.state.gastos.push({
        ...g,
        responsable: this.normalizarResponsable(g.responsable),
        descripcion: g.descripcion.trim(),
        id: nuevoId('gas'),
        proyectoId: currentProjectId,
        loteId: data.loteModificado.id,
        contratoId: data.contrato.id,
        createdAt: ahora,
      })
    );

    // 7b. Negociación convertida en venta: sus gastos pasan a esta venta (RN-N2)
    // Solo se convierte una negociación abierta o en espera (no una ya convertida o cancelada)
    const negociacion = data.negociacionId
      ? this.state.negociaciones.find(
          (n) => n.id === data.negociacionId && (n.estado === 'EN_NEGOCIACION' || n.estado === 'ESPERANDO_PROMESA')
        )
      : undefined;
    if (negociacion) {
      // Si la negociación reservó otro lote distinto al vendido, se libera esa reserva
      if (negociacion.loteId && negociacion.loteId !== data.loteModificado.id) {
        this.liberarLote(negociacion.loteId);
      }
      negociacion.estado = 'CONVERTIDA';
      negociacion.contratoId = data.contrato.id;
      negociacion.loteId = data.loteModificado.id;
      negociacion.fechaCierre = hoyISO();
      this.state.gastos
        .filter((g) => g.negociacionId === negociacion.id && !g.contratoId)
        .forEach((g) => {
          g.contratoId = data.contrato.id;
          g.loteId = data.loteModificado.id;
          g.proyectoId = currentProjectId;
        });
    }

    // 8. La prima es el primer cobro: se emite su recibo, reembolsa los gastos y se reparte (RN-B1, RN-B2)
    if (data.contrato.primaEntregada > 0) {
      const reciboPrima = this.crearReciboPrima(data.contrato, data.pagoPrima);
      this.distribuirCobro({
        contratoId: data.contrato.id,
        origen: 'PRIMA',
        reciboId: reciboPrima?.id,
        monto: data.contrato.primaEntregada,
        fecha: data.contrato.fechaFirma,
      });
    }

    this.notify();
    return { ok: true, valor: data.contrato };
  }

  // --- Cuotas ---
  public getCuotasByContratoId(contratoId: string): Cuota[] {
    return this.state.cuotas
      .filter((c) => c.contratoId === contratoId)
      .sort((a, b) => a.numeroCuota - b.numeroCuota);
  }

  public getCuotasPendientes(): Cuota[] {
    return this.state.cuotas.filter((c) => c.estado !== 'PAGADO');
  }

  /** Lotes con promesa de venta, del más reciente al más antiguo, con el avance de sus pagos. */
  public getLotesVendidos(proyectoId?: string): LoteVendido[] {
    return this.state.contratos
      .flatMap((contrato) => {
        const lote = this.state.lotes.find((l) => l.id === contrato.loteId);
        if (!lote || (proyectoId && lote.proyectoId !== proyectoId)) return [];
        const cuotas = this.getCuotasByContratoId(contrato.id);
        return [
          {
            lote,
            contrato,
            comprador: this.state.clientes.find((c) => c.id === contrato.compradorId),
            saldoPendiente: this.getSaldoPendienteContrato(contrato.id),
            cuotasPagadas: cuotas.filter((c) => c.estado === 'PAGADO').length,
            cuotasTotales: cuotas.length,
            proximaCuota: cuotas.find((c) => c.estado !== 'PAGADO'),
            dibujado: (lote.verticesPoligono?.length ?? 0) >= 3,
          },
        ];
      })
      .sort((a, b) => b.contrato.fechaFirma.localeCompare(a.contrato.fechaFirma) || b.contrato.id.localeCompare(a.contrato.id));
  }

  // --- Cobranza y Recibos ---

  /** Saldo pendiente total de un contrato (suma de lo que falta de cada cuota). */
  public getSaldoPendienteContrato(contratoId: string): number {
    return pendienteTotal(this.state.cuotas.filter((c) => c.contratoId === contratoId));
  }

  /**
   * Registra un pago de cuotas (RN-C1, modelo v1 sin recargos): se aplica a la cuota pendiente más antigua
   * del contrato y, si sobra, a las siguientes. Un pago menor que la cuota queda como abono parcial.
   * Se rechaza si supera todo lo pendiente. Emite un recibo con folio (D5) y reparte el cobro (RN-B1).
   */
  public registrarPagoCuota(params: {
    cuotaId: string;
    monto: number;
    metodo: MetodoPago;
    referencia?: string;
    fechaPago: string;
    notas?: string;
  }): Resultado<ReciboPago> {
    const cuota = this.state.cuotas.find((c) => c.id === params.cuotaId);
    const contrato = cuota && this.state.contratos.find((c) => c.id === cuota.contratoId);
    const lote = contrato && this.state.lotes.find((l) => l.id === contrato.loteId);
    if (!cuota || !contrato || !lote) return { ok: false, mensaje: 'No se encontró la cuota o su contrato.' };
    if (!(params.monto > 0)) return { ok: false, mensaje: 'El monto debe ser mayor que cero.' };
    if (!FECHA_ISO.test(params.fechaPago)) return { ok: false, mensaje: 'Indique la fecha del pago.' };

    const cuotasContrato = this.state.cuotas.filter((c) => c.contratoId === contrato.id);
    const { aplicaciones, sobrante } = aplicarPago(cuotasContrato, params.monto);
    if (sobrante > 0) {
      return {
        ok: false,
        mensaje: `El pago supera el saldo pendiente del contrato (${pendienteTotal(cuotasContrato).toFixed(2)}).`,
      };
    }

    const recibo: ReciboPago = {
      id: nuevoId('rec'),
      folio: this.siguienteFolio(lote.proyectoId, 'RECIBO', params.fechaPago),
      concepto: 'CUOTA',
      cuotaId: aplicaciones[0]?.cuotaId,
      aplicaciones,
      contratoId: contrato.id,
      clienteId: contrato.compradorId,
      montoPagado: Math.round(params.monto * 100) / 100,
      metodoPago: params.metodo,
      referenciaBancaria: params.referencia?.trim() || undefined,
      fechaPago: params.fechaPago,
      notas: params.notas?.trim() || undefined,
    };

    aplicaciones.forEach((a) => {
      const c = this.state.cuotas.find((q) => q.id === a.cuotaId)!;
      // Desglose para el recibo: el pago cubre primero el interés pendiente de la cuota y luego el capital
      const previo = aCent(pagadoDeCuota(c));
      const interesPendiente = Math.max(0, aCent(c.abonoInteres) - previo);
      const interes = Math.min(aCent(a.monto), interesPendiente);
      Object.assign(a, { interes: interes / 100, capital: (aCent(a.monto) - interes) / 100 });
      c.montoPagado = (previo + aCent(a.monto)) / 100;
      c.estado = estadoSegunPagado(c.montoCuota, c.montoPagado);
      c.reciboId = recibo.id;
      if (c.estado === 'PAGADO') c.fechaPagoReal = params.fechaPago;
      (a as { quedoPagada?: boolean }).quedoPagada = c.estado === 'PAGADO';
    });
    recibo.saldoPendienteDespues = pendienteTotal(cuotasContrato);
    this.state.recibos.push(recibo);

    // Reparto del cobro entre beneficiarios (RN-B1)
    this.distribuirCobro({
      contratoId: contrato.id,
      origen: 'CUOTA',
      reciboId: recibo.id,
      monto: recibo.montoPagado,
      fecha: params.fechaPago,
    });

    this.notify();
    return { ok: true, valor: recibo };
  }

  /**
   * RN-C4: anula el último recibo de cuotas vigente de un contrato. Revierte lo aplicado a las cuotas y anula
   * su reparto (los reembolsos y partes dejan de contar). El recibo conserva su folio. La prima no se anula
   * por esta vía.
   */
  public anularRecibo(reciboId: string, motivo: string): Resultado {
    const recibo = this.state.recibos.find((r) => r.id === reciboId);
    if (!recibo) return { ok: false, mensaje: 'No se encontró el recibo.' };
    if (recibo.anulado) return { ok: false, mensaje: 'El recibo ya está anulado.' };
    if (recibo.concepto === 'PRIMA') {
      return { ok: false, mensaje: 'El recibo de prima no se puede anular: forma parte del registro de la promesa.' };
    }
    if (!motivo.trim()) return { ok: false, mensaje: 'Indique el motivo de la anulación.' };

    const vigentes = this.state.recibos.filter(
      (r) => r.contratoId === recibo.contratoId && !r.anulado && r.concepto !== 'PRIMA'
    );
    if (vigentes[vigentes.length - 1]?.id !== recibo.id) {
      return { ok: false, mensaje: 'Solo se puede anular el último cobro vigente del contrato. Anule primero los posteriores.' };
    }

    // Recibos antiguos sin aplicaciones: se asume que todo se aplicó a su cuota
    const aplicaciones = recibo.aplicaciones ?? (recibo.cuotaId ? [{ cuotaId: recibo.cuotaId, monto: recibo.montoPagado }] : []);
    aplicaciones.forEach((a) => {
      const c = this.state.cuotas.find((q) => q.id === a.cuotaId);
      if (!c) return;
      c.montoPagado = Math.max(0, aCent(pagadoDeCuota(c)) - aCent(a.monto)) / 100;
      c.estado = estadoSegunPagado(c.montoCuota, c.montoPagado);
      if (c.estado !== 'PAGADO') delete c.fechaPagoReal;
      if (c.reciboId === recibo.id) {
        const anterior = [...vigentes].reverse().find((r) => r.id !== recibo.id && r.aplicaciones?.some((x) => x.cuotaId === c.id));
        c.reciboId = c.montoPagado > 0 ? anterior?.id : undefined;
      }
    });

    recibo.anulado = true;
    recibo.motivoAnulacion = motivo.trim();
    recibo.fechaAnulacion = hoyISO();
    this.state.distribuciones.filter((d) => d.reciboId === recibo.id).forEach((d) => (d.anulada = true));

    this.notify();
    return { ok: true };
  }

  /** Recibos (prima y cuotas, incluidos los anulados) de los contratos del proyecto activo. */
  public getRecibos(proyectoId?: string): ReciboPago[] {
    const pId = proyectoId || this.getActiveProyecto()?.id;
    if (!pId) return this.state.recibos;
    const lotes = new Set(this.state.lotes.filter((l) => l.proyectoId === pId).map((l) => l.id));
    const contratos = new Set(this.state.contratos.filter((c) => lotes.has(c.loteId)).map((c) => c.id));
    return this.state.recibos.filter((r) => contratos.has(r.contratoId));
  }

  /** Lo que falta por pagar de una cuota (para proponer el monto al registrar un pago). */
  public getPendienteDeCuota(cuotaId: string): number {
    const c = this.state.cuotas.find((q) => q.id === cuotaId);
    return c ? pendienteDeCuota(c) : 0;
  }

  /**
   * Totales de cobranza del proyecto sin contar recibos anulados. Las primas se separan de las cuotas
   * para no sumarlas dos veces con los indicadores de primas.
   */
  public getResumenCobranza(proyectoId?: string) {
    const recibos = this.getRecibos(proyectoId);
    const vigentes = recibos.filter((r) => !r.anulado);
    const suma = (lista: ReciboPago[]) => lista.reduce((acc, r) => acc + aCent(r.montoPagado), 0) / 100;
    const primas = vigentes.filter((r) => r.concepto === 'PRIMA');
    const cuotas = vigentes.filter((r) => r.concepto !== 'PRIMA');
    return {
      primasCobradas: suma(primas),
      cuotasCobradas: suma(cuotas),
      totalCobrado: suma(vigentes),
      recibosDeCuotas: cuotas.length,
      recibosVigentes: vigentes.length,
      recibosAnulados: recibos.length - vigentes.length,
    };
  }

  /** Contenido del recibo (prima o cuotas) listo para mostrar o imprimir. */
  public getDocumentoRecibo(reciboId: string): DocumentoRecibo | null {
    const recibo = this.getReciboById(reciboId);
    const contrato = recibo && this.getContratoById(recibo.contratoId);
    const lote = contrato && this.state.lotes.find((l) => l.id === contrato.loteId);
    const proyecto = lote && this.state.proyectos.find((p) => p.id === lote.proyectoId);
    if (!recibo || !contrato || !proyecto) return null;
    return construirReciboDePago({
      recibo,
      contrato,
      cliente: this.getClienteById(recibo.clienteId),
      lote,
      proyecto,
      cuotas: this.getCuotasByContratoId(contrato.id),
    });
  }

  /** Contenido del comprobante de entrega a un beneficiario o responsable de gastos. */
  /** Estado de cuenta de beneficiarios del proyecto, listo para imprimir (saldos, repartos y entregas). */
  public getEstadoCuentaBeneficiarios(proyectoId?: string): EstadoCuentaBeneficiarios | null {
    const proyecto = this.state.proyectos.find((p) => p.id === (proyectoId || this.getActiveProyecto()?.id));
    if (!proyecto) return null;
    return construirEstadoCuentaBeneficiarios({
      proyecto,
      fecha: hoyISO(),
      ventas: this.getSaldosPorVenta(proyecto.id),
      beneficiarios: this.getBeneficiarios(proyecto.id),
      distribuciones: this.getDistribuciones(proyecto.id),
      liquidaciones: this.getLiquidaciones(proyecto.id),
      lotes: this.getLotes(proyecto.id),
      contratos: this.state.contratos,
      clientes: this.state.clientes,
    });
  }

  public getDocumentoEntrega(liquidacionId: string): DocumentoRecibo | null {
    const liquidacion = this.state.liquidaciones.find((l) => l.id === liquidacionId);
    const proyecto = liquidacion && this.state.proyectos.find((p) => p.id === liquidacion.proyectoId);
    if (!liquidacion || !proyecto) return null;
    return construirComprobanteDeEntrega({
      liquidacion,
      proyecto,
      beneficiarios: this.getBeneficiarios(proyecto.id),
      gastos: this.getGastos(proyecto.id),
      distribuciones: this.getDistribuciones(proyecto.id),
      liquidaciones: this.getLiquidaciones(proyecto.id),
      lotes: this.getLotes(proyecto.id),
    });
  }

  public getReciboById(id: string): ReciboPago | undefined {
    return this.state.recibos.find((r) => r.id === id);
  }

  public getContratoById(id: string): ContratoPromesa | undefined {
    return this.state.contratos.find((c) => c.id === id);
  }

  // --- Beneficiarios (plan 04.3) ---
  public getBeneficiarios(proyectoId?: string): Beneficiario[] {
    const pId = proyectoId || this.getActiveProyecto()?.id;
    return this.state.beneficiarios.filter((b) => b.proyectoId === pId).sort((a, b) => a.orden - b.orden);
  }

  /** Reemplaza la lista de beneficiarios del proyecto. Los activos deben sumar 100 % (RN-B4). */
  public guardarBeneficiarios(proyectoId: string, lista: Beneficiario[]): Resultado {
    // Normalizar: nombres sin espacios sobrantes, DUI con formato 00000000-0, inactivos sin porcentaje
    const normalizada = lista.map((b, i) => ({
      ...b,
      proyectoId,
      orden: i,
      nombreCompleto: b.nombreCompleto.trim().replace(/\s+/g, ' '),
      dui: b.dui?.trim() ? formatearDUI(b.dui) : undefined,
      telefono: b.telefono?.trim() || undefined,
      cuentaBancaria: b.cuentaBancaria?.trim() || undefined,
      porcentaje: b.activo ? Number(b.porcentaje) || 0 : 0,
    }));

    const sinNombre = normalizada.find((b) => !b.nombreCompleto);
    if (sinNombre) return { ok: false, mensaje: 'Todos los beneficiarios deben tener nombre.' };
    const duiInvalido = normalizada.find((b) => b.dui && !validarDUI(b.dui).valido);
    if (duiInvalido) return { ok: false, mensaje: `El DUI de ${duiInvalido.nombreCompleto} no es válido.` };
    const duis = normalizada.filter((b) => b.dui).map((b) => b.dui);
    if (new Set(duis).size !== duis.length) return { ok: false, mensaje: 'Hay dos beneficiarios con el mismo DUI.' };
    if (normalizada.length > 0 && !porcentajesValidos(normalizada)) {
      return { ok: false, mensaje: 'Los porcentajes de los beneficiarios activos deben sumar 100 %.' };
    }

    // No se elimina a quien ya tiene movimientos (repartos, gastos a su nombre o entregas): se desactiva
    const conMovimientos = new Set<string>([
      ...this.state.distribuciones.flatMap((d) => d.partes.map((p) => p.beneficiarioId)),
      ...this.state.gastos.flatMap((g) => (g.responsable.tipo === 'BENEFICIARIO' ? [g.responsable.beneficiarioId] : [])),
      ...this.state.liquidaciones.flatMap((l) => (l.destinatario.tipo === 'BENEFICIARIO' ? [l.destinatario.beneficiarioId] : [])),
      ...this.state.negociaciones.flatMap((n) => (n.responsable.tipo === 'BENEFICIARIO' ? [n.responsable.beneficiarioId] : [])),
    ]);
    const eliminados = this.state.beneficiarios.filter(
      (b) => b.proyectoId === proyectoId && !normalizada.some((n) => n.id === b.id)
    );
    const bloqueado = eliminados.find((b) => conMovimientos.has(b.id));
    if (bloqueado) {
      return {
        ok: false,
        mensaje: `No se puede eliminar a ${bloqueado.nombreCompleto}: tiene repartos, gastos o entregas registrados. Desactívelo en su lugar.`,
      };
    }

    this.state.beneficiarios = [...this.state.beneficiarios.filter((b) => b.proyectoId !== proyectoId), ...normalizada];
    this.notify();
    return { ok: true };
  }

  // --- Gastos de venta (plan 04.3) ---
  public getGastos(proyectoId?: string): GastoVenta[] {
    const pId = proyectoId || this.getActiveProyecto()?.id;
    return this.state.gastos.filter((g) => g.proyectoId === pId);
  }

  /** Valida un gasto antes de guardarlo. Devuelve el motivo del rechazo o null si es válido. */
  public validarGasto(
    gasto: Pick<GastoVenta, 'monto' | 'fecha' | 'responsable' | 'aCargoDe'>,
    proyectoId: string
  ): string | null {
    if (!(gasto.monto > 0) || !Number.isFinite(gasto.monto)) return 'El monto del gasto debe ser mayor que cero.';
    if (!FECHA_ISO.test(gasto.fecha)) return 'Indique la fecha del gasto.';
    if (gasto.responsable.tipo === 'EXTERNO' && !gasto.responsable.nombre.trim()) {
      return 'Indique quién hizo el gasto.';
    }
    if (gasto.responsable.tipo === 'BENEFICIARIO') {
      const id = gasto.responsable.beneficiarioId;
      if (!this.state.beneficiarios.some((b) => b.id === id && b.proyectoId === proyectoId)) {
        return 'El responsable no es un beneficiario de este proyecto.';
      }
    }
    return null;
  }

  private normalizarResponsable(r: ResponsableGasto): ResponsableGasto {
    return r.tipo === 'EXTERNO' ? { tipo: 'EXTERNO', nombre: r.nombre.trim().replace(/\s+/g, ' ') } : r;
  }

  public addGasto(gasto: Omit<GastoVenta, 'id' | 'createdAt' | 'proyectoId' | 'loteId'>): GastoVenta | null {
    const contrato = this.state.contratos.find((c) => c.id === gasto.contratoId);
    const lote = contrato && this.state.lotes.find((l) => l.id === contrato.loteId);
    if (!contrato || !lote) return null;
    if (this.validarGasto(gasto, lote.proyectoId)) return null;
    gasto = { ...gasto, responsable: this.normalizarResponsable(gasto.responsable), descripcion: gasto.descripcion.trim() };
    const nuevo: GastoVenta = {
      ...gasto,
      id: nuevoId('gas'),
      proyectoId: lote.proyectoId,
      loteId: lote.id,
      createdAt: new Date().toISOString(),
    };
    this.state.gastos.push(nuevo);
    this.notify();
    return nuevo;
  }

  /** Corrige un gasto que todavía no se ha reembolsado (monto, categoría, detalle, fecha, responsable…). */
  public actualizarGasto(
    gastoId: string,
    cambios: Partial<Pick<GastoVenta, 'categoria' | 'descripcion' | 'monto' | 'fecha' | 'aCargoDe' | 'responsable' | 'referencia'>>
  ): Resultado {
    const gasto = this.state.gastos.find((g) => g.id === gastoId);
    if (!gasto) return { ok: false, mensaje: 'No se encontró el gasto.' };
    if (this.getReembolsadoDeGasto(gastoId) > 0) {
      return { ok: false, mensaje: 'Este gasto ya se reembolsó (total o parcialmente) y no se puede modificar.' };
    }
    const actualizado = { ...gasto, ...cambios };
    const error = this.validarGasto(actualizado, gasto.proyectoId);
    if (error) return { ok: false, mensaje: error };
    Object.assign(gasto, actualizado, {
      responsable: this.normalizarResponsable(actualizado.responsable),
      descripcion: actualizado.descripcion.trim(),
    });
    this.notify();
    return { ok: true };
  }

  /** Monto ya reembolsado de un gasto (sin contar repartos anulados). */
  public getReembolsadoDeGasto(gastoId: string): number {
    const centavos = this.state.distribuciones
      .filter((d) => !d.anulada)
      .flatMap((d) => d.reembolsos)
      .filter((r) => r.gastoId === gastoId)
      .reduce((acc, r) => acc + Math.round(r.monto * 100), 0);
    return centavos / 100;
  }

  /** Solo se puede eliminar un gasto que aún no se ha reembolsado. */
  public deleteGasto(gastoId: string): { ok: boolean; mensaje?: string } {
    if (this.getReembolsadoDeGasto(gastoId) > 0) {
      return { ok: false, mensaje: 'Este gasto ya se reembolsó (total o parcialmente) y no se puede eliminar.' };
    }
    this.state.gastos = this.state.gastos.filter((g) => g.id !== gastoId);
    this.notify();
    return { ok: true };
  }

  // --- Repartos y entregas (plan 04.3) ---
  public getDistribuciones(proyectoId?: string): DistribucionCobro[] {
    const pId = proyectoId || this.getActiveProyecto()?.id;
    return this.state.distribuciones.filter((d) => d.proyectoId === pId);
  }

  public getLiquidaciones(proyectoId?: string): Liquidacion[] {
    const pId = proyectoId || this.getActiveProyecto()?.id;
    return this.state.liquidaciones.filter((l) => l.proyectoId === pId);
  }

  /** Saldos por persona del proyecto (repartido + reembolsos − entregado), sin repartos anulados. */
  public getSaldosPorPersona(proyectoId?: string) {
    const pId = proyectoId || this.getActiveProyecto()?.id || '';
    return calcularSaldos(
      this.getBeneficiarios(pId),
      this.getGastos(pId),
      this.getDistribuciones(pId),
      this.getLiquidaciones(pId)
    );
  }

  /**
   * Saldos por lote vendido: cada venta con lo que le corresponde a cada persona de sus cobros, lo entregado
   * de esa venta y lo pendiente. Evita mezclar el dinero de una venta con el de otra.
   */
  public getSaldosPorVenta(proyectoId?: string): SaldosDeVenta[] {
    const pId = proyectoId || this.getActiveProyecto()?.id || '';
    return calcularSaldosPorVenta(
      this.getBeneficiarios(pId),
      this.getGastos(pId),
      this.getDistribuciones(pId),
      this.getLiquidaciones(pId)
    );
  }

  /**
   * RN-B5: registra una entrega; no puede superar lo pendiente de esa persona. Asigna folio de entrega.
   * Con `contratoId`, la entrega sale de esa venta y no puede superar lo pendiente de la persona en esa venta.
   */
  public addLiquidacion(liq: Omit<Liquidacion, 'id' | 'createdAt' | 'folio'>): Resultado<Liquidacion> {
    const r = this.crearLiquidacion(liq);
    if (r.ok) this.notify();
    return r;
  }

  private crearLiquidacion(liq: Omit<Liquidacion, 'id' | 'createdAt' | 'folio'>): Resultado<Liquidacion> {
    if (!(liq.monto > 0)) return { ok: false, mensaje: 'El monto debe ser mayor que cero.' };
    if (!FECHA_ISO.test(liq.fecha)) return { ok: false, mensaje: 'Indique la fecha de la entrega.' };
    let loteId = liq.loteId;
    let saldo;
    if (liq.contratoId) {
      const venta = this.getSaldosPorVenta(liq.proyectoId).find((v) => v.contratoId === liq.contratoId);
      if (!venta) return { ok: false, mensaje: 'Esa venta no tiene cobros repartidos.' };
      loteId = loteId || venta.loteId;
      saldo = venta.saldos.find((x) => x.clave === clavePersona(liq.destinatario));
    } else {
      saldo = this.getSaldosPorPersona(liq.proyectoId).find((x) => x.clave === clavePersona(liq.destinatario));
    }
    if (!saldo || aCent(liq.monto) > aCent(saldo.pendiente)) {
      return { ok: false, mensaje: `La entrega supera lo pendiente (${(saldo?.pendiente ?? 0).toFixed(2)}).` };
    }
    const nueva: Liquidacion = {
      ...liq,
      ...(liq.contratoId ? { loteId } : {}),
      monto: aCent(liq.monto) / 100,
      id: nuevoId('liq'),
      folio: this.siguienteFolio(liq.proyectoId, 'ENTREGA', liq.fecha),
      createdAt: new Date().toISOString(),
    };
    this.state.liquidaciones.push(nueva);
    return { ok: true, valor: nueva };
  }

  /**
   * Entrega a cada persona con saldo pendiente todo lo que le corresponde, por lote vendido: una entrega y un
   * folio por persona y por venta. Con `contratoId`, solo la de esa venta.
   */
  public registrarEntregasATodos(datos: {
    fecha: string;
    metodo: MetodoPago;
    referencia?: string;
    notas?: string;
    contratoId?: string;
  }): Resultado<Liquidacion[]> {
    const proyectoId = this.getActiveProyecto()?.id;
    if (!proyectoId) return { ok: false, mensaje: 'No hay proyecto activo.' };
    const { contratoId, ...entrega } = datos;
    const pendientes = this.getSaldosPorVenta(proyectoId)
      .filter((v) => !contratoId || v.contratoId === contratoId)
      .flatMap((v) => v.saldos.filter((s) => s.pendiente > 0).map((s) => ({ venta: v, s })));
    if (pendientes.length === 0) return { ok: false, mensaje: 'No hay saldos pendientes de entregar.' };
    const creadas: Liquidacion[] = [];
    for (const { venta, s } of pendientes) {
      const r = this.crearLiquidacion({
        proyectoId,
        contratoId: venta.contratoId,
        loteId: venta.loteId,
        destinatario: s.persona,
        monto: s.pendiente,
        ...entrega,
      });
      if (!r.ok) {
        this.state.liquidaciones = this.state.liquidaciones.filter((l) => !creadas.includes(l));
        return { ok: false, mensaje: r.mensaje };
      }
      creadas.push(r.valor!);
    }
    this.notify();
    return { ok: true, valor: creadas };
  }

  /**
   * Cobros que aún no tienen reparto: primas y recibos registrados antes de configurar beneficiarios,
   * o mientras los porcentajes no sumaban 100 %.
   */
  public getCobrosSinRepartir(proyectoId?: string): {
    contratoId: string;
    loteId: string;
    origen: 'PRIMA' | 'CUOTA';
    reciboId?: string;
    monto: number;
    fecha: string;
  }[] {
    const pId = proyectoId || this.getActiveProyecto()?.id;
    const lotesProyecto = new Set(this.state.lotes.filter((l) => l.proyectoId === pId).map((l) => l.id));
    const contratos = this.state.contratos.filter((c) => lotesProyecto.has(c.loteId));
    const distribuidos = this.state.distribuciones;
    const resultado: ReturnType<StorageService['getCobrosSinRepartir']> = [];

    contratos.forEach((c) => {
      const primaRepartida = distribuidos.some((d) => d.contratoId === c.id && d.origen === 'PRIMA');
      if (c.primaEntregada > 0 && !primaRepartida) {
        const reciboPrima = this.state.recibos.find((r) => r.contratoId === c.id && r.concepto === 'PRIMA');
        resultado.push({ contratoId: c.id, loteId: c.loteId, origen: 'PRIMA', reciboId: reciboPrima?.id, monto: c.primaEntregada, fecha: c.fechaFirma });
      }
      this.state.recibos
        .filter(
          (r) =>
            r.contratoId === c.id &&
            r.concepto !== 'PRIMA' &&
            !r.anulado &&
            !distribuidos.some((d) => d.reciboId === r.id)
        )
        .forEach((r) =>
          resultado.push({ contratoId: c.id, loteId: c.loteId, origen: 'CUOTA', reciboId: r.id, monto: r.montoPagado, fecha: r.fechaPago })
        );
    });
    return resultado.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  /** Reparte, en orden de fecha, todos los cobros pendientes del proyecto activo. */
  public repartirTodosLosPendientes(): Resultado<number> {
    const pendientes = this.getCobrosSinRepartir();
    if (pendientes.length === 0) return { ok: true, valor: 0 };
    let repartidos = 0;
    for (const cobro of pendientes) {
      if (!this.distribuirCobro(cobro)) break;
      repartidos++;
    }
    if (repartidos === 0) {
      return { ok: false, mensaje: 'Configure beneficiarios cuyos porcentajes sumen 100 % antes de repartir.' };
    }
    this.notify();
    return { ok: true, valor: repartidos };
  }

  /** Reparte manualmente un cobro pendiente (ver getCobrosSinRepartir). */
  public repartirCobroPendiente(cobro: { contratoId: string; origen: 'PRIMA' | 'CUOTA'; reciboId?: string; monto: number; fecha: string }): { ok: boolean; mensaje?: string } {
    const hecho = this.distribuirCobro(cobro);
    if (!hecho) {
      return { ok: false, mensaje: 'Configure beneficiarios cuyos porcentajes sumen 100 % antes de repartir.' };
    }
    this.notify();
    return { ok: true };
  }

  /**
   * RN-B1 a RN-B3: reembolsa los gastos pendientes del contrato (primero, desde la prima) y reparte
   * el neto entre los beneficiarios activos. Si el proyecto no tiene beneficiarios válidos, no hace nada
   * y el cobro queda "sin repartir". Devuelve true si registró el reparto. No llama a notify().
   */
  private distribuirCobro(cobro: {
    contratoId: string;
    origen: 'PRIMA' | 'CUOTA';
    reciboId?: string;
    monto: number;
    fecha: string;
  }): boolean {
    const contrato = this.state.contratos.find((c) => c.id === cobro.contratoId);
    const lote = contrato && this.state.lotes.find((l) => l.id === contrato.loteId);
    if (!contrato || !lote) return false;

    const ya = this.state.distribuciones.some((d) =>
      cobro.origen === 'PRIMA' ? d.contratoId === contrato.id && d.origen === 'PRIMA' : d.reciboId === cobro.reciboId
    );
    if (ya) return false;

    const beneficiarios = this.state.beneficiarios
      .filter((b) => b.proyectoId === lote.proyectoId && b.activo)
      .sort((a, b) => a.orden - b.orden);
    if (!porcentajesValidos(beneficiarios)) return false;

    const pendientesVenta = gastosPendientesDeContrato(this.state.gastos, this.state.distribuciones, contrato.id);
    // RN-N3: la prima también reembolsa gastos de negociaciones canceladas que asumió la sucesión
    const canceladasPorSucesion = new Set(
      this.state.negociaciones
        .filter((n) => n.proyectoId === lote.proyectoId && n.estado === 'CANCELADA' && n.gastosAsumidosPor === 'SUCESION')
        .map((n) => n.id)
    );
    const pendientesProyecto =
      cobro.origen === 'PRIMA'
        ? gastosPendientesDeNegociacionesCanceladas(this.state.gastos, this.state.distribuciones, canceladasPorSucesion)
        : [];

    const resultado = calcularDistribucion({
      monto: cobro.monto,
      gastosPendientes: [...pendientesVenta, ...pendientesProyecto],
      beneficiarios,
      indiceRotacion: this.state.rotacionReparto[lote.proyectoId] ?? 0,
    });

    this.state.distribuciones.push({
      id: nuevoId('dis'),
      proyectoId: lote.proyectoId,
      contratoId: contrato.id,
      loteId: lote.id,
      origen: cobro.origen,
      reciboId: cobro.reciboId,
      fecha: cobro.fecha || hoyISO(),
      montoCobrado: cobro.monto,
      reembolsos: resultado.reembolsos,
      neto: resultado.neto,
      partes: resultado.partes,
      createdAt: new Date().toISOString(),
    });
    this.state.rotacionReparto[lote.proyectoId] = resultado.siguienteIndiceRotacion;
    return true;
  }

  // --- Negociaciones (plan 04.3, fase 8.7) ---
  public getNegociaciones(proyectoId?: string): Negociacion[] {
    const pId = proyectoId || this.getActiveProyecto()?.id;
    return this.state.negociaciones.filter((n) => n.proyectoId === pId);
  }

  public getNegociacionById(id: string): Negociacion | undefined {
    return this.state.negociaciones.find((n) => n.id === id);
  }

  public crearNegociacion(
    datos: Pick<Negociacion, 'interesadoNombre' | 'interesadoTelefono' | 'loteId' | 'loteReferencia' | 'responsable' | 'notas' | 'precioAcordado' | 'primaAcordada'>
  ): Negociacion | null {
    const proyecto = this.getActiveProyecto();
    if (!proyecto) return null;
    const nueva: Negociacion = {
      ...datos,
      id: nuevoId('neg'),
      proyectoId: proyecto.id,
      estado: 'EN_NEGOCIACION',
      fechaInicio: hoyISO(),
      createdAt: new Date().toISOString(),
    };
    this.state.negociaciones.push(nueva);
    this.notify();
    return nueva;
  }

  public actualizarNegociacion(negociacion: Negociacion) {
    const idx = this.state.negociaciones.findIndex((n) => n.id === negociacion.id);
    if (idx < 0) return;
    const anterior = this.state.negociaciones[idx];
    // Si cambia el lote de una negociación que espera promesa, se mueve la reserva (RN-N4)
    if (anterior.estado === 'ESPERANDO_PROMESA' && anterior.loteId !== negociacion.loteId) {
      this.liberarLote(anterior.loteId);
      this.reservarLote(negociacion.loteId, negociacion.interesadoNombre);
    }
    this.state.negociaciones[idx] = negociacion;
    this.notify();
  }

  public getGastosDeNegociacion(negociacionId: string): GastoVenta[] {
    return this.state.gastos.filter((g) => g.negociacionId === negociacionId);
  }

  public addGastoNegociacion(
    negociacionId: string,
    gasto: Omit<GastoVenta, 'id' | 'createdAt' | 'proyectoId' | 'loteId' | 'contratoId' | 'negociacionId'>
  ): GastoVenta | null {
    const n = this.getNegociacionById(negociacionId);
    if (!n || n.estado === 'CANCELADA') return null;
    if (this.validarGasto(gasto, n.proyectoId)) return null;
    const nuevo: GastoVenta = {
      ...gasto,
      responsable: this.normalizarResponsable(gasto.responsable),
      descripcion: gasto.descripcion.trim(),
      id: nuevoId('gas'),
      proyectoId: n.proyectoId,
      negociacionId,
      // Si la negociación ya se convirtió, el gasto pertenece a la venta
      contratoId: n.estado === 'CONVERTIDA' ? n.contratoId : undefined,
      loteId: n.estado === 'CONVERTIDA' ? n.loteId : undefined,
      createdAt: new Date().toISOString(),
    };
    this.state.gastos.push(nuevo);
    this.notify();
    return nuevo;
  }

  /** RN-N1: marcar como completada; queda esperando la promesa y reserva el lote si hay uno. */
  public completarNegociacion(id: string) {
    const n = this.getNegociacionById(id);
    if (!n || n.estado !== 'EN_NEGOCIACION') return;
    n.estado = 'ESPERANDO_PROMESA';
    n.fechaCompletada = hoyISO();
    this.reservarLote(n.loteId, n.interesadoNombre);
    this.notify();
  }

  /** Vuelve a "en negociación" (p. ej. si se marcó completada por error) y libera la reserva. */
  public reabrirNegociacion(id: string) {
    const n = this.getNegociacionById(id);
    if (!n || n.estado !== 'ESPERANDO_PROMESA') return;
    n.estado = 'EN_NEGOCIACION';
    n.fechaCompletada = undefined;
    this.liberarLote(n.loteId);
    this.notify();
  }

  /**
   * RN-N3: cancelar. Si la sucesión asume los gastos, se reembolsan de la próxima prima del proyecto;
   * si los asume el responsable, no se reembolsan.
   */
  public cancelarNegociacion(id: string, asume: 'SUCESION' | 'RESPONSABLE', motivo?: string) {
    const n = this.getNegociacionById(id);
    if (!n || n.estado === 'CONVERTIDA' || n.estado === 'CANCELADA') return;
    if (n.estado === 'ESPERANDO_PROMESA') this.liberarLote(n.loteId);
    n.estado = 'CANCELADA';
    n.fechaCierre = hoyISO();
    n.gastosAsumidosPor = asume;
    n.motivoCancelacion = motivo;
    this.state.gastos
      .filter((g) => g.negociacionId === id && !g.contratoId && g.aCargoDe !== 'COMPRADOR')
      .forEach((g) => {
        g.aCargoDe = asume === 'SUCESION' ? 'SUCESION' : 'RESPONSABLE';
      });
    this.notify();
  }

  private reservarLote(loteId: string | undefined, interesado: string) {
    const lote = loteId ? this.state.lotes.find((l) => l.id === loteId) : undefined;
    if (lote && lote.estado === 'DISPONIBLE') {
      lote.estado = 'RESERVADO';
      lote.nombreCompradorLabel = interesado;
    }
  }

  private liberarLote(loteId: string | undefined) {
    const lote = loteId ? this.state.lotes.find((l) => l.id === loteId) : undefined;
    const tieneContrato = lote && this.state.contratos.some((c) => c.loteId === lote.id);
    if (lote && lote.estado === 'RESERVADO' && !tieneContrato) {
      lote.estado = 'DISPONIBLE';
      delete lote.nombreCompradorLabel;
    }
  }

  // --- Limpieza de datos ---
  public clearAllData() {
    this.state = ESTADO_VACIO();
    this.saveToStorage(this.state);
    this.notify();
  }

  /**
   * Borra las ventas y todo lo que depende de ellas (lotes, clientes, contratos, cuotas, recibos, gastos, negociaciones,
   * repartos y entregas) y reinicia folios y turnos de reparto. Conserva los proyectos y los beneficiarios (su
   * configuración). Se sincroniza con la nube como una versión nueva: el historial permite recuperar lo anterior.
   */
  public limpiarConservandoBeneficiarios() {
    const { proyectos, beneficiarios, activeProyectoId } = this.state;
    this.state = { ...ESTADO_VACIO(), proyectos, beneficiarios, activeProyectoId };
    this.saveToStorage(this.state);
    this.notify();
  }
}

async function mensajeDeError(r: Response): Promise<string> {
  try {
    const cuerpo = await r.json();
    return cuerpo?.error ?? `Error ${r.status}`;
  } catch {
    return `Error ${r.status}`;
  }
}

export const storage = new StorageService();
