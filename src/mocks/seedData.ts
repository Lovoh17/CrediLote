import { Proyecto, Lote, Cliente, ContratoPromesa, Cuota, ReciboPago } from '@/shared/types';
import { generarTablaAmortizacion } from '@/modules/finance/engine/amortization';

export const SEED_PROYECTOS: Proyecto[] = [
  {
    id: 'proj-1',
    nombre: 'Residencial Campestre Los Pinos',
    descripcion: 'Desarrollo campestre de 32 parcelas con acceso pavimentado y agua potable.',
    ubicacion: 'Valle de Ángeles, Francisco Morazán',
    centroMapa: { lat: 14.1524, lng: -87.0385 },
    zoomDefault: 17,
    moneda: 'USD',
    createdAt: '2026-01-10',
  },
  {
    id: 'proj-2',
    nombre: 'Quintas del Valle - Etapa 1',
    descripcion: 'Terrenos campestres planos para cabañas y descanso.',
    ubicacion: 'Santa Ana, Francisco Morazán',
    centroMapa: { lat: 13.9295, lng: -87.2710 },
    zoomDefault: 16,
    moneda: 'USD',
    createdAt: '2026-03-01',
  },
];

export const SEED_CLIENTES: Cliente[] = [
  {
    id: 'cli-1',
    nombreCompleto: 'María Elena Soto Meza',
    dniIdentificacion: '0801-1988-14205',
    telefono: '+504 9876-5432',
    whatsapp: '+504 9876-5432',
    email: 'maria.soto@email.com',
    direccion: 'Col. Palmira, Tegucigalpa',
    createdAt: '2026-02-15',
  },
  {
    id: 'cli-2',
    nombreCompleto: 'Carlos Roberto Mendoza',
    dniIdentificacion: '0801-1979-05821',
    telefono: '+504 9912-3344',
    whatsapp: '+504 9912-3344',
    email: 'carlos.mendoza@email.com',
    direccion: 'Residencial Plaza, Tegucigalpa',
    createdAt: '2026-03-20',
  },
  {
    id: 'cli-3',
    nombreCompleto: 'Ana Lucía Fernández Cruz',
    dniIdentificacion: '0501-1992-09412',
    telefono: '+504 9550-8811',
    whatsapp: '+504 9550-8811',
    email: 'ana.fernandez@email.com',
    direccion: 'Barrio Guamilito, San Pedro Sula',
    createdAt: '2026-04-05',
  },
];

// Lotes del Proyecto 1 con polígonos GPS realistas (aproximados en Valle de Ángeles)
export const SEED_LOTES: Lote[] = [
  {
    id: 'lote-1',
    proyectoId: 'proj-1',
    codigoLote: 'L-01',
    bloqueManzana: 'Bloque A',
    areaM2: 320.50,
    precioLista: 19230.00,
    estado: 'VENDIDO',
    compradorId: 'cli-1',
    nombreCompradorLabel: 'María Elena Soto',
    verticesPoligono: [
      { lat: 14.1528, lng: -87.0392 },
      { lat: 14.1528, lng: -87.0388 },
      { lat: 14.1524, lng: -87.0388 },
      { lat: 14.1524, lng: -87.0392 },
    ],
    linderos: {
      norte: 'Calle de acceso principal (16.00 m)',
      sur: 'Lote 03 (16.00 m)',
      este: 'Lote 02 (20.00 m)',
      oeste: 'Área verde municipal (20.00 m)',
    },
  },
  {
    id: 'lote-2',
    proyectoId: 'proj-1',
    codigoLote: 'L-02',
    bloqueManzana: 'Bloque A',
    areaM2: 310.00,
    precioLista: 18600.00,
    estado: 'VENDIDO',
    compradorId: 'cli-2',
    nombreCompradorLabel: 'Carlos Mendoza',
    verticesPoligono: [
      { lat: 14.1528, lng: -87.0388 },
      { lat: 14.1528, lng: -87.0384 },
      { lat: 14.1524, lng: -87.0384 },
      { lat: 14.1524, lng: -87.0388 },
    ],
    linderos: {
      norte: 'Calle de acceso principal (15.50 m)',
      sur: 'Lote 04 (15.50 m)',
      este: 'Lote 05 (20.00 m)',
      oeste: 'Lote 01 (20.00 m)',
    },
  },
  {
    id: 'lote-3',
    proyectoId: 'proj-1',
    codigoLote: 'L-03',
    bloqueManzana: 'Bloque A',
    areaM2: 350.00,
    precioLista: 21000.00,
    estado: 'RESERVADO',
    compradorId: 'cli-3',
    nombreCompradorLabel: 'Ana Fernández (Reserva)',
    verticesPoligono: [
      { lat: 14.1524, lng: -87.0392 },
      { lat: 14.1524, lng: -87.0388 },
      { lat: 14.1520, lng: -87.0388 },
      { lat: 14.1520, lng: -87.0392 },
    ],
    linderos: {
      norte: 'Lote 01 (17.50 m)',
      sur: 'Servidumbre de paso (17.50 m)',
      este: 'Lote 04 (20.00 m)',
      oeste: 'Área verde (20.00 m)',
    },
  },
  {
    id: 'lote-4',
    proyectoId: 'proj-1',
    codigoLote: 'L-04',
    bloqueManzana: 'Bloque A',
    areaM2: 340.00,
    precioLista: 20400.00,
    estado: 'DISPONIBLE',
    verticesPoligono: [
      { lat: 14.1524, lng: -87.0388 },
      { lat: 14.1524, lng: -87.0384 },
      { lat: 14.1520, lng: -87.0384 },
      { lat: 14.1520, lng: -87.0388 },
    ],
    linderos: {
      norte: 'Lote 02 (17.00 m)',
      sur: 'Servidumbre de paso (17.00 m)',
      este: 'Lote 06 (20.00 m)',
      oeste: 'Lote 03 (20.00 m)',
    },
  },
  {
    id: 'lote-5',
    proyectoId: 'proj-1',
    codigoLote: 'L-05',
    bloqueManzana: 'Bloque B',
    areaM2: 290.00,
    precioLista: 17400.00,
    estado: 'DISPONIBLE',
    verticesPoligono: [
      { lat: 14.1528, lng: -87.0384 },
      { lat: 14.1528, lng: -87.0380 },
      { lat: 14.1524, lng: -87.0380 },
      { lat: 14.1524, lng: -87.0384 },
    ],
    linderos: {
      norte: 'Calle de acceso (14.50 m)',
      sur: 'Lote 06 (14.50 m)',
      este: 'Lote 07 (20.00 m)',
      oeste: 'Lote 02 (20.00 m)',
    },
  },
  {
    id: 'lote-6',
    proyectoId: 'proj-1',
    codigoLote: 'L-06',
    bloqueManzana: 'Bloque B',
    areaM2: 300.00,
    precioLista: 18000.00,
    estado: 'DISPONIBLE',
    verticesPoligono: [
      { lat: 14.1524, lng: -87.0380 },
      { lat: 14.1524, lng: -87.0384 },
      { lat: 14.1520, lng: -87.0384 },
      { lat: 14.1520, lng: -87.0380 },
    ],
  },
];

export const SEED_CONTRATOS: ContratoPromesa[] = [
  {
    id: 'cont-1',
    loteId: 'lote-1',
    compradorId: 'cli-1',
    vendedorNombre: 'Inversiones y Desarrollos Los Pinos S.A.',
    fechaFirma: '2026-02-15',
    precioPactado: 19200.00,
    primaEntregada: 3200.00,
    saldoFinanciado: 16000.00,
    plazoMeses: 36,
    tasaInteresAnual: 12.0,
    sistemaAmortizacion: 'FRANCES',
    diaCortePago: 15,
    createdAt: '2026-02-15',
  },
  {
    id: 'cont-2',
    loteId: 'lote-2',
    compradorId: 'cli-2',
    vendedorNombre: 'Inversiones y Desarrollos Los Pinos S.A.',
    fechaFirma: '2026-03-20',
    precioPactado: 18600.00,
    primaEntregada: 4200.00,
    saldoFinanciado: 14400.00,
    plazoMeses: 48,
    tasaInteresAnual: 0.0,
    sistemaAmortizacion: 'DIRECTO_SIN_INTERES',
    diaCortePago: 20,
    createdAt: '2026-03-20',
  },
];

// Generar cuotas iniciales con algunas pagadas para mostrar estado de cuenta
export function getInitialCuotas(): Cuota[] {
  const cuotas1 = generarTablaAmortizacion({
    precioTotal: 19200.00,
    prima: 3200.00,
    plazoMeses: 36,
    tasaInteresAnual: 12.0,
    sistema: 'FRANCES',
    fechaInicio: '2026-02-15',
    diaCortePago: 15,
    contratoId: 'cont-1',
  });

  // Marcar las primeras cuotas como pagadas
  if (cuotas1[0]) {
    cuotas1[0].estado = 'PAGADO';
    cuotas1[0].fechaPagoReal = '2026-03-14';
    cuotas1[0].reciboId = 'REC-2026-0001';
  }
  if (cuotas1[1]) {
    cuotas1[1].estado = 'PAGADO';
    cuotas1[1].fechaPagoReal = '2026-04-15';
    cuotas1[1].reciboId = 'REC-2026-0014';
  }
  if (cuotas1[2]) {
    cuotas1[2].estado = 'PAGADO';
    cuotas1[2].fechaPagoReal = '2026-05-12';
    cuotas1[2].reciboId = 'REC-2026-0028';
  }

  const cuotas2 = generarTablaAmortizacion({
    precioTotal: 18600.00,
    prima: 4200.00,
    plazoMeses: 48,
    tasaInteresAnual: 0.0,
    sistema: 'DIRECTO_SIN_INTERES',
    fechaInicio: '2026-03-20',
    diaCortePago: 20,
    contratoId: 'cont-2',
  });

  if (cuotas2[0]) {
    cuotas2[0].estado = 'PAGADO';
    cuotas2[0].fechaPagoReal = '2026-04-19';
    cuotas2[0].reciboId = 'REC-2026-0018';
  }

  return [...cuotas1, ...cuotas2];
}

export const SEED_RECIBOS: ReciboPago[] = [
  {
    id: 'rec-1',
    folio: 'REC-2026-0001',
    cuotaId: 'cont-1-c1',
    contratoId: 'cont-1',
    clienteId: 'cli-1',
    montoPagado: 531.43,
    metodoPago: 'TRANSFERENCIA',
    referenciaBancaria: 'BAC-7749102',
    fechaPago: '2026-03-14',
    notas: 'Liquidación oportuna cuota 1',
  },
  {
    id: 'rec-2',
    folio: 'REC-2026-0014',
    cuotaId: 'cont-1-c2',
    contratoId: 'cont-1',
    clienteId: 'cli-1',
    montoPagado: 531.43,
    metodoPago: 'DEPOSITO',
    referenciaBancaria: 'FICH-9921',
    fechaPago: '2026-04-15',
    notas: 'Liquidación en ventanilla cuota 2',
  },
];
