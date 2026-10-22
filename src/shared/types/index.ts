// Definiciones de tipos para el dominio de CrediLote

export type EstadoLote = 'DISPONIBLE' | 'RESERVADO' | 'VENDIDO' | 'FINIQUITADO';
export type SistemaAmortizacion = 'FRANCES' | 'DIRECTO_SIN_INTERES' | 'ALEMAN';
export type EstadoCuota = 'PENDIENTE' | 'PAGADO' | 'EN_MORA' | 'ABONO_PARCIAL';
export type MetodoPago = 'EFECTIVO' | 'TRANSFERENCIA' | 'DEPOSITO' | 'CHEQUE';

export interface CoordenadaGPS {
  lat: number;
  lng: number;
}

export interface Proyecto {
  id: string;
  nombre: string;
  descripcion?: string;
  ubicacion: string;
  centroMapa: CoordenadaGPS;
  zoomDefault: number;
  moneda: string; // ej. "USD", "HNL", "MXN"
  /** Propietario del terreno: propio o una sucesión con beneficiarios (plan 04.3). */
  tipoPropietario?: TipoPropietario;
  /** Persona que firma en nombre de la sucesión. */
  representante?: string;
  /** Prefijo de los folios de recibos (D5); si falta se deriva de las iniciales del nombre. */
  prefijoFolio?: string;
  createdAt: string;
}

// ---------- Sucesión, beneficiarios y gastos de venta (plan 04.3) ----------

export type TipoPropietario = 'PROPIO' | 'SUCESION';

export type CategoriaGasto =
  | 'GESTION_VENTA'
  | 'HONORARIOS_ABOGADO'
  | 'ESCRITURACION'
  | 'TOPOGRAFIA'
  | 'INSCRIPCION_CNR'
  | 'SOLVENCIAS_IMPUESTOS'
  | 'COMBUSTIBLE'
  | 'VIATICOS'
  | 'OTROS';

/**
 * Quién asume el gasto: la sucesión (se reembolsa y se descuenta del reparto), el comprador (solo control)
 * o el propio responsable (no se reembolsa; p. ej. al cancelar una negociación).
 */
export type ACargoDe = 'SUCESION' | 'COMPRADOR' | 'RESPONSABLE';

export interface Beneficiario {
  id: string;
  proyectoId: string;
  nombreCompleto: string;
  dui?: string;
  telefono?: string;
  cuentaBancaria?: string;
  /** Porcentaje de participación (los activos del proyecto suman 100). */
  porcentaje: number;
  activo: boolean;
  orden: number;
  createdAt: string;
}

/** Persona que hizo o adelantó un gasto y a quien se le reembolsa. */
export type ResponsableGasto =
  | { tipo: 'BENEFICIARIO'; beneficiarioId: string }
  | { tipo: 'EXTERNO'; nombre: string };

export interface GastoVenta {
  id: string;
  proyectoId: string;
  /** Lote y contrato de la venta. Vacíos mientras el gasto pertenece a una negociación abierta. */
  loteId?: string;
  contratoId?: string;
  /** Negociación en la que se originó el gasto (si aplica). */
  negociacionId?: string;
  categoria: CategoriaGasto;
  descripcion: string;
  monto: number;
  fecha: string;
  aCargoDe: ACargoDe;
  responsable: ResponsableGasto;
  referencia?: string;
  createdAt: string;
}

/** Reparto de un cobro (prima o cuota): reembolsos de gastos y partes de cada beneficiario. */
export interface DistribucionCobro {
  id: string;
  proyectoId: string;
  contratoId: string;
  loteId: string;
  origen: 'PRIMA' | 'CUOTA';
  /** Recibo de la cuota cobrada (solo para origen CUOTA). */
  reciboId?: string;
  fecha: string;
  montoCobrado: number;
  reembolsos: { gastoId: string; monto: number }[];
  /** Neto después de reembolsos (se reparte entre beneficiarios). */
  neto: number;
  partes: { beneficiarioId: string; monto: number }[];
  /** Se anula junto con el recibo del cobro; deja de contar en saldos y reembolsos. */
  anulada?: boolean;
  createdAt: string;
}

export type EstadoNegociacion = 'EN_NEGOCIACION' | 'ESPERANDO_PROMESA' | 'CONVERTIDA' | 'CANCELADA';

/** Negociación con un interesado antes de que exista la venta (plan 04.3, fase 8.7). */
export interface Negociacion {
  id: string;
  proyectoId: string;
  interesadoNombre: string;
  interesadoTelefono?: string;
  /** Lote existente que se negocia (se reserva al completar la negociación). */
  loteId?: string;
  /** Descripción libre del terreno cuando aún no existe como lote. */
  loteReferencia?: string;
  /** Quien negocia; es el responsable por defecto de los gastos. */
  responsable: ResponsableGasto;
  estado: EstadoNegociacion;
  fechaInicio: string;
  fechaCompletada?: string;
  fechaCierre?: string;
  precioAcordado?: number;
  primaAcordada?: number;
  notas?: string;
  /** Contrato creado al subir la promesa de venta. */
  contratoId?: string;
  /** Al cancelar: quién asume los gastos de la negociación. */
  gastosAsumidosPor?: 'SUCESION' | 'RESPONSABLE';
  motivoCancelacion?: string;
  createdAt: string;
}

/** Entrega de dinero a un beneficiario o a un responsable externo de gastos. */
export interface Liquidacion {
  id: string;
  /** Folio del comprobante de entrega (ej. "SLM-ENT-2026-0001"). */
  folio?: string;
  proyectoId: string;
  /**
   * Venta (contrato y lote) de la que sale el dinero: los saldos se llevan por lote vendido para no mezclar ventas.
   * Las entregas anteriores a este cambio no la tienen y se aplican a las ventas más antiguas con saldo.
   */
  contratoId?: string;
  loteId?: string;
  destinatario: ResponsableGasto;
  monto: number;
  fecha: string;
  metodo: MetodoPago;
  referencia?: string;
  notas?: string;
  createdAt: string;
}

/** Tramo de la descripción técnica: rumbo descompuesto (ej. S 45°10'20" W) y distancia en metros. */
export interface TramoDescripcion {
  inicio: 'N' | 'S';
  grados: number;
  minutos: number;
  segundos: number;
  fin: 'E' | 'W';
  distancia: number;
}

/**
 * Descripción técnica de la escritura guardada con el lote. Muchas promesas solo traen rumbos y distancias
 * (sin coordenadas): con los tramos guardados, el lote se puede ubicar después en el mapa (RN-G2).
 */
export interface DescripcionTecnicaLote {
  tramos: TramoDescripcion[];
  /** Punto de partida en coordenadas Lambert El Salvador, si la escritura o el plano del CNR lo trae. */
  puntoPartida?: { norte: number; este: number };
  /** Cómo nombra la escritura el punto de partida (ej. "vértice Nor Poniente"). */
  referenciaPartida?: string;
  /** Punto de partida en el mapa (WGS84). Sin él, el lote no tiene polígono. */
  origen?: CoordenadaGPS;
  /**
   * LAMBERT: calculado de la coordenada oficial. DOCUMENTO: desde la primera latitud/longitud escrita en el documento.
   * MAPA: marcado a mano por el administrador (aproximado).
   */
  ubicadoPor?: 'LAMBERT' | 'DOCUMENTO' | 'MAPA';
}

export interface Lote {
  id: string;
  proyectoId: string;
  codigoLote: string; // ej. "L-14"
  bloqueManzana: string; // ej. "Manzana C"
  areaM2: number;
  precioLista: number;
  estado: EstadoLote;
  verticesPoligono: CoordenadaGPS[];
  descripcionTecnica?: DescripcionTecnicaLote;
  compradorId?: string;
  nombreCompradorLabel?: string;
  linderos?: {
    norte?: string;
    sur?: string;
    este?: string;
    oeste?: string;
  };
  notas?: string;
}

export interface Cliente {
  id: string;
  nombreCompleto: string;
  dniIdentificacion: string;
  telefono: string;
  whatsapp?: string;
  email?: string;
  direccion?: string;
  createdAt: string;
}

export interface ContratoPromesa {
  id: string;
  loteId: string;
  compradorId: string;
  vendedorNombre: string;
  fechaFirma: string;
  precioPactado: number;
  primaEntregada: number;
  saldoFinanciado: number;
  plazoMeses: number;
  tasaInteresAnual: number;
  sistemaAmortizacion: SistemaAmortizacion;
  diaCortePago: number;
  documentoUrl?: string;
  nombreArchivoOriginal?: string;
  createdAt: string;
}

export interface Cuota {
  id: string;
  contratoId: string;
  numeroCuota: number;
  fechaVencimiento: string;
  montoCuota: number;
  abonoCapital: number;
  abonoInteres: number;
  saldoInsoluto: number;
  estado: EstadoCuota;
  /** Monto pagado acumulado (admite abonos parciales). Si falta y la cuota está PAGADO, se considera completa. */
  montoPagado?: number;
  /** Fecha en que la cuota quedó totalmente pagada. */
  fechaPagoReal?: string;
  /** Último recibo que abonó a la cuota. */
  reciboId?: string;
}

export interface ReciboPago {
  id: string;
  folio: string; // ej. "SLM-2026-0001" (prefijo del proyecto, año y correlativo; D5)
  /** PRIMA: anticipo al firmar la promesa. CUOTA: pago de cuotas. (Recibos antiguos sin valor = CUOTA.) */
  concepto?: 'PRIMA' | 'CUOTA';
  /** Primera cuota a la que se aplicó el pago (vacío en recibos de prima). */
  cuotaId?: string;
  /**
   * Cómo se repartió el pago entre cuotas (pago parcial, exacto o que cubre varias cuotas), con el desglose
   * de interés y capital calculado al emitir el recibo (el interés se cubre primero).
   */
  aplicaciones?: { cuotaId: string; monto: number; interes?: number; capital?: number; quedoPagada?: boolean }[];
  contratoId: string;
  clienteId: string;
  montoPagado: number;
  /** Puede faltar en el recibo de prima si no se indicó cómo se pagó. */
  metodoPago?: MetodoPago;
  referenciaBancaria?: string;
  fechaPago: string;
  /** Saldo total pendiente del contrato después de este pago (copia para el documento). */
  saldoPendienteDespues?: number;
  notas?: string;
  anulado?: boolean;
  motivoAnulacion?: string;
  fechaAnulacion?: string;
}

/** Qué tipo de documento notarial se subió (lo clasifica la extracción con IA). */
export type TipoDocumentoExtraido = 'PROMESA_COMPRAVENTA' | 'COMPRAVENTA' | 'REMEDICION' | 'SEGREGACION' | 'OTRO';

export interface ExtraerDatosPromesaResult {
  /** Tipo de documento detectado; si no es una promesa ni una compraventa, se avisa al administrador. */
  tipoDocumento?: TipoDocumentoExtraido;
  vendedorNombre: string;
  compradorNombre: string;
  compradorDni: string;
  compradorTelefono: string;
  proyectoNombre: string;
  codigoLote: string;
  bloqueManzana: string;
  areaM2: number;
  precioPactado: number;
  primaEntregada: number;
  plazoMeses: number;
  tasaInteresAnual: number;
  sistemaAmortizacion: SistemaAmortizacion;
  diaCortePago: number;
  /** Vértices directos en WGS84. Se usan solo cuando no hay punto de partida Lambert con tramos. */
  coordenadas: CoordenadaGPS[];
  /** Mojón 1 en coordenadas Lambert El Salvador (metros). */
  puntoPartida?: { norte: number; este: number };
  /** Tramos de la descripción técnica (rumbo descompuesto + distancia en metros). */
  tramos?: TramoDescripcion[];
  /** Cómo nombra la escritura el punto de partida (ej. "vértice Nor Poniente"). */
  referenciaPartida?: string;
  /** Total de tramos que el documento dice tener (suma por lindero), para compararlo con los leídos. */
  tramosDeclarados?: number;
  /** Linderos como texto ("10 tramos · Resto del Inmueble, calle de por medio"), para guardarlos en el lote. */
  linderos?: Lote['linderos'];
  /** Avisos de la extracción (p. ej. rumbos que no se pudieron interpretar). */
  avisos?: string[];
  confianza: {
    partes: number;
    financiero: number;
    coordenadas: number;
  };
}
