/**
 * Permite que otra vista (p. ej. el registro de una promesa) pida al mapa
 * centrarse en un lote al abrirse. El mapa lee la solicitud al montarse y luego la limpia.
 */
let loteSolicitado: string | null = null;

export function solicitarEnfoqueLote(loteId: string): void {
  loteSolicitado = loteId;
}

/** Lee la solicitud sin consumirla (seguro para el doble render del modo estricto). */
export function consultarEnfoqueLote(): string | null {
  return loteSolicitado;
}

export function limpiarEnfoqueLote(): void {
  loteSolicitado = null;
}
