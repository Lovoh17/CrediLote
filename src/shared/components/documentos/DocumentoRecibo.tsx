import { forwardRef } from 'react';
import { DocumentoRecibo as DocumentoReciboType, dinero, fechaLarga } from '@/shared/documentos/documentos';
import { twMerge } from 'tailwind-merge';

interface DocumentoReciboProps {
  documento: DocumentoReciboType;
  className?: string;
}

/**
 * Recibo formal (prima, cuota o entrega de fondos) en hoja tamaño carta.
 * Se imprime solo con `imprimirElemento` (src/shared/utils/imprimir.ts), sin nada de la pantalla detrás.
 * No usa <header>, <nav> ni <button>: los estilos de impresión de la app los ocultan.
 */
export const DocumentoRecibo = forwardRef<HTMLDivElement, DocumentoReciboProps>(({ documento, className }, ref) => {
  const { emisor, titulo, folio, lugarYFecha, cantidad, cantidadEnLetras, cuerpo, detalle, tabla, notas, firmas, anulado } =
    documento;

  return (
    <div
      ref={ref}
      className={twMerge(
        'hoja-documento relative w-full max-w-[816px] mx-auto bg-white text-slate-900 px-12 py-10 border border-slate-300 shadow-sm font-sans text-[13px] leading-relaxed overflow-hidden',
        className
      )}
    >
      {/* Marca de agua si el recibo fue anulado */}
      {anulado && (
        <div className="pointer-events-none select-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-[24deg] text-[110px] font-black tracking-[0.2em] text-red-600/15 border-[10px] border-red-600/15 px-10">
            ANULADO
          </span>
        </div>
      )}

      {/* Encabezado: emisor a la izquierda; título, folio y monto a la derecha */}
      <div className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          <p className="text-[22px] font-bold uppercase tracking-tight leading-tight">{emisor.nombre}</p>
          {emisor.lineas.map((linea, i) => (
            <p key={i} className="text-xs text-slate-600 leading-snug">
              {linea}
            </p>
          ))}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{titulo}</p>
          <p className="font-mono text-[15px] font-bold mt-0.5">N.º {folio}</p>
          <div className="mt-3 inline-block border-2 border-slate-900 px-4 py-1.5 text-left">
            <p className="text-[9px] uppercase tracking-[0.2em] text-slate-500 leading-none">Por</p>
            <p className="text-xl font-bold tabular-nums leading-tight">US{dinero(cantidad)}</p>
          </div>
        </div>
      </div>

      {/* Doble línea */}
      <div className="mt-5 border-t-2 border-slate-900" />
      <div className="mt-[3px] border-t border-slate-400" />

      <p className="mt-3 text-right text-xs text-slate-600">{lugarYFecha}</p>

      {anulado && (
        <div className="mt-4 border border-red-300 bg-red-50 px-4 py-2 text-xs text-red-900">
          <span className="font-bold uppercase tracking-wide">Documento anulado</span>
          {anulado.fecha && <span> el {fechaLarga(anulado.fecha)}</span>}
          {anulado.motivo && <span>. Motivo: {anulado.motivo}</span>}
        </div>
      )}

      {/* Texto del recibo */}
      <p className="mt-7 font-serif text-[15px] leading-8 text-justify">
        Recibí de <strong>{cuerpo.recibiDe}</strong>
        {cuerpo.identificacion ? <>, {cuerpo.identificacion}</> : null}, la cantidad de{' '}
        <strong className="uppercase">{cantidadEnLetras}</strong> ({dinero(cantidad)}), en concepto de {cuerpo.concepto}.
      </p>

      {/* Detalle */}
      {detalle.length > 0 && (
        <div className="mt-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-1.5">Detalle</p>
          <div className="grid grid-cols-2 gap-x-10">
            {detalle.map((item, i) => (
              <div key={i} className="flex items-baseline justify-between gap-4 py-1.5 border-b border-dotted border-slate-400 text-xs">
                <span className="text-slate-600">{item.etiqueta}</span>
                <span className={twMerge('text-right tabular-nums', item.destacado ? 'font-bold' : 'font-medium')}>{item.valor}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla (p. ej. cuotas aplicadas en el pago) */}
      {tabla && (
        <div className="mt-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-1.5">{tabla.titulo}</p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-y-2 border-slate-900">
                {tabla.columnas.map((col, i) => (
                  <th
                    key={i}
                    className={twMerge('py-1.5 px-2 font-semibold text-left', tabla.alineacionDerecha?.includes(i) && 'text-right')}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {tabla.filas.map((fila, f) => (
                <tr key={f} className="border-b border-slate-300">
                  {fila.map((celda, c) => (
                    <td key={c} className={twMerge('py-1.5 px-2', tabla.alineacionDerecha?.includes(c) && 'text-right')}>
                      {celda}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notas */}
      {notas.length > 0 && (
        <div className="mt-6 space-y-0.5 text-[11px] text-slate-500">
          {notas.map((nota, i) => (
            <p key={i}>{nota}</p>
          ))}
        </div>
      )}

      {/* Firmas */}
      {firmas.length > 0 && (
        <div
          className="mt-20 grid gap-12"
          style={{ gridTemplateColumns: `repeat(${Math.min(firmas.length, 3)}, minmax(0, 1fr))` }}
        >
          {firmas.map((firma, i) => (
            <div key={i} className="text-center">
              <div className="mx-4 mb-1.5 border-t border-slate-800" />
              <p className="text-xs font-semibold">{firma.etiqueta}</p>
              {firma.nombre && <p className="text-xs">{firma.nombre}</p>}
              {firma.identificacion && <p className="text-[11px] text-slate-500">{firma.identificacion}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Pie */}
      <div className="mt-14 pt-2 border-t border-slate-300 flex justify-between gap-4 text-[10px] text-slate-400">
        <span>
          {titulo} N.º {folio}
        </span>
        <span>{emisor.nombre}</span>
      </div>
    </div>
  );
});

DocumentoRecibo.displayName = 'DocumentoRecibo';
