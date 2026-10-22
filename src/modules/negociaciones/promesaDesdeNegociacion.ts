/**
 * Permite que el módulo de negociaciones abra la ingesta de promesas ya vinculada a una negociación.
 * La ingesta lee la solicitud al montarse (sin consumirla, por el doble render del modo estricto) y luego la limpia.
 */
let negociacionSolicitada: string | null = null;

export function solicitarPromesaDeNegociacion(negociacionId: string): void {
  negociacionSolicitada = negociacionId;
}

export function consultarPromesaDeNegociacion(): string | null {
  return negociacionSolicitada;
}

export function limpiarPromesaDeNegociacion(): void {
  negociacionSolicitada = null;
}
