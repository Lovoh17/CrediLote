import { describe, it, expect, vi } from 'vitest';
import { consultarGemini, normalizeExtractedData, aNumero, aGradosDecimales } from './contractExtractor';
import { lambertElSalvadorToWGS84 } from '@/shared/utils/geoElSalvador';

/** Respuesta simulada de la API de Gemini. */
function respuesta(estado: number, cuerpo: unknown, cabeceras: Record<string, string> = {}): Response {
  return new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status: estado, headers: cabeceras });
}
const ok = (texto: string) => respuesta(200, { candidates: [{ content: { parts: [{ text: texto }] } }] });
const saturado = () => respuesta(503, { error: { code: 503, status: 'UNAVAILABLE', message: 'high demand' } });

/** fetch simulado que responde según el modelo de la URL y registra las llamadas. */
function fetchSimulado(respuestasPorModelo: Record<string, (() => Response)[]>) {
  const llamadas: string[] = [];
  const fn = vi.fn(async (url: string) => {
    const modelo = /models\/([^:]+):/.exec(url)![1];
    llamadas.push(modelo);
    const cola = respuestasPorModelo[modelo] ?? [];
    return (cola.shift() ?? saturado)();
  });
  return { fn: fn as unknown as typeof fetch, llamadas };
}

const opciones = (f: typeof fetch, extra = {}) => ({
  modelos: ['m1', 'm2', 'm3'],
  fetch: f,
  esperar: async () => {},
  ...extra,
});

describe('consultarGemini: reintentos y cascada de modelos', () => {
  it('reintenta el mismo modelo saturado y responde cuando se libera', async () => {
    const { fn, llamadas } = fetchSimulado({ m1: [saturado, () => ok('{"a":1}')] });
    await expect(consultarGemini({}, undefined, opciones(fn))).resolves.toBe('{"a":1}');
    expect(llamadas).toEqual(['m1', 'm1']);
  });

  it('pasa al siguiente modelo cuando uno sigue saturado', async () => {
    const { fn, llamadas } = fetchSimulado({ m1: [saturado, saturado], m2: [() => ok('{"b":2}')] });
    await expect(consultarGemini({}, undefined, opciones(fn))).resolves.toBe('{"b":2}');
    expect(llamadas).toEqual(['m1', 'm1', 'm2']);
  });

  it('salta sin reintentar un modelo que no existe (404)', async () => {
    const { fn, llamadas } = fetchSimulado({ m1: [() => respuesta(404, 'not found')], m2: [() => ok('{}')] });
    await consultarGemini({}, undefined, opciones(fn));
    expect(llamadas).toEqual(['m1', 'm2']);
  });

  it('se detiene ante un error que otro modelo no resolvería (403)', async () => {
    const { fn, llamadas } = fetchSimulado({ m1: [() => respuesta(403, { error: { message: 'API key invalid' } })] });
    await expect(consultarGemini({}, undefined, opciones(fn))).rejects.toThrow(/rechazó la solicitud \(403\)/);
    expect(llamadas).toEqual(['m1']);
  });

  it('si todos están saturados, explica qué pasó con cada modelo', async () => {
    const { fn, llamadas } = fetchSimulado({});
    const error = await consultarGemini({}, undefined, opciones(fn)).catch((e: Error) => e);
    expect(llamadas).toHaveLength(6); // 3 modelos × 2 intentos
    expect((error as Error).message).toMatch(/servidores de Google están saturados/);
    expect((error as Error).message).toMatch(/m1 saturado \(503\); m2 saturado \(503\); m3 saturado \(503\)/);
  });

  it('avisa si el problema es el límite de uso de la clave (429)', async () => {
    const limite = () => respuesta(429, { error: { code: 429, details: [{ retryDelay: '7s' }] } });
    const { fn } = fetchSimulado({ m1: [limite, limite], m2: [limite, limite], m3: [limite, limite] });
    const esperas: number[] = [];
    const error = await consultarGemini({}, undefined, opciones(fn, { esperar: async (ms: number) => void esperas.push(ms) })).catch((e: Error) => e);
    expect((error as Error).message).toMatch(/límite de uso de la clave/);
    expect(esperas[0]).toBe(7000); // respeta la espera sugerida por Google
  });

  it('un modelo que no responde a tiempo se abandona y se prueba el siguiente', async () => {
    const lento = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('m1')) {
        return new Promise<Response>((_, rechazar) =>
          init?.signal?.addEventListener('abort', () => rechazar(Object.assign(new Error('abortado'), { name: 'AbortError' })))
        );
      }
      return ok('{"c":3}');
    }) as unknown as typeof fetch;
    await expect(consultarGemini({}, undefined, opciones(lento, { tiempoMaximoMs: 20 }))).resolves.toBe('{"c":3}');
  });

  it('une las partes de texto de la respuesta e ignora las de razonamiento', async () => {
    const partes = respuesta(200, { candidates: [{ content: { parts: [{ text: 'pensando…', thought: true }, { text: '{"x":' }, { text: '1}' }] } }] });
    const { fn } = fetchSimulado({ m1: [() => partes] });
    await expect(consultarGemini({}, undefined, opciones(fn))).resolves.toBe('{"x":1}');
  });
});

describe('normalizeExtractedData: documentos incompletos o que no son promesas', () => {
  // Respuesta como la de un acta de remedición (datos ficticios): sin comprador, precio ni mojón 1, con tramos
  const remedicion = {
    tipoDocumento: 'REMEDICION',
    compradorNombre: null,
    precioPactado: null,
    primaEntregada: null,
    plazoMeses: null,
    diaCortePago: null,
    areaM2: 3122.6,
    puntoPartidaLambert: null,
    referenciaPartida: 'vértice Nor Poniente',
    tramosRumbosYDistancias: [
      { inicio: 'N', grados: 10, minutos: 0, segundos: 0, fin: 'E', distancia: 20 },
      { inicio: 'S', grados: 80, minutos: 0, segundos: 0, fin: 'E', distancia: 15 },
    ],
    coordenadasWGS84: [],
    confianza: { partes: 0.9, financiero: 0, coordenadas: 0.95 },
  };

  it('avisa que no es una promesa y que falta el precio; conserva tramos y referencia del punto de partida', () => {
    const r = normalizeExtractedData(remedicion);
    expect(r.tipoDocumento).toBe('REMEDICION');
    expect(r.precioPactado).toBe(0);
    expect(r.avisos!.join(' ')).toMatch(/acta de remedición de inmueble, no una promesa de venta/);
    expect(r.avisos!.join(' ')).toMatch(/no indica el precio de venta/);
    // El aviso de "falta el punto de partida" lo da una sola vez la revisión de geometría del formulario
    expect(r.avisos!.join(' ')).not.toMatch(/punto de partida/);
    expect(r.referenciaPartida).toBe('vértice Nor Poniente');
    expect(r.tramos).toHaveLength(2);
    expect(r.coordenadas).toEqual([]);
  });

  it('convierte la confianza en fracción a porcentaje; sin precio la financiera es 0 y sin polígono la de coordenadas también', () => {
    expect(normalizeExtractedData(remedicion).confianza).toEqual({ partes: 90, financiero: 0, coordenadas: 0 });
    const conPunto = normalizeExtractedData({
      ...remedicion,
      puntoPartidaLambert: { norte: 250120.5, este: 580340.25 },
      tramosRumbosYDistancias: [...remedicion.tramosRumbosYDistancias, { inicio: 'S', grados: 60, minutos: 0, segundos: 0, fin: 'W', distancia: 25 }],
    });
    expect(conPunto.confianza!.coordenadas).toBe(95);
  });

  it('una promesa completa no genera avisos de tipo ni de precio', () => {
    const r = normalizeExtractedData({ tipoDocumento: 'Promesa de compraventa', precioPactado: '$20,400.00', primaEntregada: '4400', plazoMeses: 36, diaCortePago: 15 });
    expect(r).toMatchObject({ tipoDocumento: 'PROMESA_COMPRAVENTA', precioPactado: 20400, primaEntregada: 4400 });
    expect(r.avisos!.join(' ')).not.toMatch(/promesa de venta\.|precio de venta/);
  });

  it('aNumero interpreta montos con formato y descarta lo que no es número', () => {
    expect(aNumero('$20,400.50')).toBe(20400.5);
    expect(aNumero('12 meses')).toBe(12);
    expect(aNumero(null)).toBe(0);
    expect(aNumero('veinte mil')).toBe(0);
    expect(aNumero(Number.NaN)).toBe(0);
  });
});

describe('normalizeExtractedData: tramos declarados por lindero frente a tramos leídos', () => {
  const tramo = { inicio: 'S', grados: 32, minutos: 0, segundos: 0, fin: 'E', distancia: 10 };
  const linderos = [
    { nombre: 'Norte', tramosDeclarados: 1 },
    { nombre: 'ORIENTE', tramosDeclarados: '8' },
    { nombre: 'SUR', tramosDeclarados: 6 },
    { nombre: 'PONIENTE', tramosDeclarados: 6 },
  ];

  it('avisa que falta una página cuando se leyeron menos tramos de los que dice el documento', () => {
    const r = normalizeExtractedData({ linderos, tramosRumbosYDistancias: Array(15).fill(tramo) });
    expect(r.tramosDeclarados).toBe(21);
    expect(r.avisos!.join(' ')).toMatch(
      /dice que la descripción tiene 21 tramos \(NORTE: 1, ORIENTE: 8, SUR: 6, PONIENTE: 6\), pero solo se leyeron 15\. Puede faltar una página/
    );
  });

  it('avisa si se leyeron más tramos de los declarados (tramos repetidos)', () => {
    const r = normalizeExtractedData({ linderos, tramosRumbosYDistancias: Array(22).fill(tramo) });
    expect(r.avisos!.join(' ')).toMatch(/Se leyeron 22 tramos, pero el documento dice que son 21/);
  });

  it('no avisa cuando coinciden o cuando el documento no declara cuántos son', () => {
    const completo = normalizeExtractedData({ linderos, tramosRumbosYDistancias: Array(21).fill(tramo) });
    const sinLinderos = normalizeExtractedData({ tramosRumbosYDistancias: Array(15).fill(tramo) });
    for (const r of [completo, sinLinderos]) expect(r.avisos!.join(' ')).not.toMatch(/tramos \(|dice que son/);
    expect(sinLinderos.tramosDeclarados).toBeUndefined();
  });
});

describe('normalizeExtractedData: el primer punto con coordenadas es el punto de partida', () => {
  // Rectángulo ficticio de 17 × 20 m y coordenadas ficticias
  const tramos = [
    { inicio: 'N', grados: 0, minutos: 0, segundos: 0, fin: 'E', distancia: 17 },
    { inicio: 'N', grados: 90, minutos: 0, segundos: 0, fin: 'E', distancia: 20 },
    { inicio: 'S', grados: 0, minutos: 0, segundos: 0, fin: 'E', distancia: 17 },
    { inicio: 'S', grados: 90, minutos: 0, segundos: 0, fin: 'W', distancia: 20 },
  ];
  const P1 = { norte: 250120.5, este: 580340.25 };
  const inicio = lambertElSalvadorToWGS84(P1.este, P1.norte);

  it('sin "puntoPartidaLambert", toma el primer vértice de la tabla de coordenadas', () => {
    const r = normalizeExtractedData({ verticesLambert: [P1, { norte: 250137.5, este: 580340.25 }], tramosRumbosYDistancias: tramos });
    expect(r.puntoPartida).toEqual(P1);
    expect(r.coordenadas![0]).toEqual(inicio);
  });

  it('acepta Y/X y corrige Norte y Este intercambiados, con aviso', () => {
    expect(normalizeExtractedData({ puntoPartidaLambert: { y: '250,120.50', x: '580,340.25' } }).puntoPartida).toEqual(P1);
    const r = normalizeExtractedData({ puntoPartidaLambert: { norte: P1.este, este: P1.norte }, tramosRumbosYDistancias: tramos });
    expect(r.puntoPartida).toEqual(P1);
    expect(r.avisos!.join(' ')).toMatch(/Norte y Este intercambiados/);
  });

  it('sin tramos, dibuja el polígono con la tabla de coordenadas de los vértices', () => {
    const tabla = [P1, { norte: 250137.5, este: 580340.25 }, { norte: 250137.5, este: 580360.25 }, { norte: 250120.5, este: 580360.25 }];
    const r = normalizeExtractedData({ verticesLambert: tabla });
    expect(r.coordenadas).toHaveLength(4);
    expect(r.coordenadas![0]).toEqual(inicio);
    expect(r.avisos!.join(' ')).not.toMatch(/Solo se detectó el mojón/);
  });

  it('con tramos y solo latitud/longitud, el polígono sale de la primera coordenada', () => {
    const primera = { lat: 13.35, lng: -87.98 };
    const r = normalizeExtractedData({ coordenadasWGS84: [primera], tramosRumbosYDistancias: tramos });
    expect(r.coordenadas).toHaveLength(4);
    expect(r.coordenadas![0]).toEqual(primera);
  });
});

describe('coordenadas en grados, minutos y segundos (como un convertidor GPS)', () => {
  it('convierte a grados decimales: grados + minutos/60 + segundos/3600, negativo al Sur y al Oeste', () => {
    expect(aGradosDecimales(`13°18'12.9" N`)).toBeCloseTo(13.303583, 6);
    expect(aGradosDecimales(`87°59'20.3" O`)).toBeCloseTo(-87.988972, 6);
    expect(aGradosDecimales('87 59 20,3 Oeste')).toBeCloseTo(-87.988972, 6);
    expect(aGradosDecimales('-87.98897')).toBe(-87.98897);
    expect(aGradosDecimales(13.3)).toBe(13.3);
    expect(aGradosDecimales('sin dato')).toBeNaN();
  });

  it('el punto de partida en grados, minutos y segundos dibuja el polígono desde ahí', () => {
    const tramos = [
      { inicio: 'N', grados: 0, minutos: 0, segundos: 0, fin: 'E', distancia: 17 },
      { inicio: 'N', grados: 90, minutos: 0, segundos: 0, fin: 'E', distancia: 20 },
      { inicio: 'S', grados: 0, minutos: 0, segundos: 0, fin: 'E', distancia: 17 },
    ];
    const r = normalizeExtractedData({ coordenadasWGS84: [{ lat: `13°18'12.9" N`, lng: `87°59'20.3" O` }], tramosRumbosYDistancias: tramos });
    expect(r.coordenadas![0].lat).toBeCloseTo(13.303583, 6);
    expect(r.coordenadas![0].lng).toBeCloseTo(-87.988972, 6);
    expect(r.coordenadas).toHaveLength(3);
  });

  it('corrige la longitud sin el signo del Oeste y la latitud/longitud intercambiadas, con aviso', () => {
    const sinSigno = normalizeExtractedData({ coordenadasWGS84: [{ lat: 13.3, lng: 87.98 }] });
    expect(sinSigno.coordenadas).toEqual([{ lat: 13.3, lng: -87.98 }]);
    expect(sinSigno.avisos!.join(' ')).toMatch(/sin el signo del Oeste/);
    expect(normalizeExtractedData({ coordenadasWGS84: [{ lat: -87.98, lng: 13.3 }] }).coordenadas).toEqual([{ lat: 13.3, lng: -87.98 }]);
  });
});

describe('normalizeExtractedData: linderos para guardar en el lote', () => {
  it('describe cada lindero con sus tramos y con qué colinda (datos ficticios)', () => {
    const r = normalizeExtractedData({
      linderos: [
        { nombre: 'LINDERO NORTE', tramosDeclarados: 10, colindante: 'Resto del Inmueble, calle de por medio' },
        { nombre: 'Oriente', tramosDeclarados: 1, colindante: null },
        { nombre: 'SUR', tramosDeclarados: null, colindante: 'Persona Ficticia, cerco de púas' },
        { nombre: 'PONIENTE', tramosDeclarados: 9 },
      ],
    });
    expect(r.linderos).toEqual({
      norte: '10 tramos · Resto del Inmueble, calle de por medio',
      este: '1 tramo',
      sur: 'Persona Ficticia, cerco de púas',
      oeste: '9 tramos',
    });
    expect(normalizeExtractedData({}).linderos).toBeUndefined();
  });

  it('si un lindero no declara cuántos tramos tiene, no compara una suma parcial', () => {
    const tramo = { inicio: 'S', grados: 32, minutos: 0, segundos: 0, fin: 'E', distancia: 10 };
    const r = normalizeExtractedData({
      linderos: [{ nombre: 'NORTE', tramosDeclarados: 1 }, { nombre: 'SUR', tramosDeclarados: null }],
      tramosRumbosYDistancias: Array(4).fill(tramo),
    });
    expect(r.tramosDeclarados).toBeUndefined();
    expect(r.avisos!.join(' ')).not.toMatch(/dice que son|solo se leyeron/);
  });
});

describe('normalizeExtractedData: documento sin descripción técnica ni coordenadas (lotificación)', () => {
  it('avisa que no hay con qué dibujar y no muestra confianza en coordenadas que no existen', () => {
    const r = normalizeExtractedData({
      tipoDocumento: 'PROMESA_COMPRAVENTA',
      codigoLote: '16',
      bloqueManzana: 'Polígono F',
      areaM2: 324.35,
      precioPactado: 20000,
      primaEntregada: 10000,
      tramosRumbosYDistancias: [],
      coordenadasWGS84: [],
      confianza: { partes: 100, financiero: 100, coordenadas: 100 },
    });
    expect(r.confianza!.coordenadas).toBe(0);
    expect(r.confianza!.financiero).toBe(100);
    expect(r.avisos!.join(' ')).toMatch(/no trae descripción técnica \(rumbos y distancias\) ni coordenadas/);
  });

  it('con tramos no da ese aviso (el de falta del primer punto lo da la revisión de geometría)', () => {
    const r = normalizeExtractedData({ tramosRumbosYDistancias: [{ inicio: 'N', grados: 0, minutos: 0, segundos: 0, fin: 'E', distancia: 17 }] });
    expect(r.avisos!.join(' ')).not.toMatch(/no trae descripción técnica/);
  });
});
