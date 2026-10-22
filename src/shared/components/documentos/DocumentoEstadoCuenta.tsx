import React, { forwardRef } from 'react';
import { EstadoCuentaBeneficiarios, dinero, fechaLarga } from '@/shared/documentos/documentos';
import { twMerge } from 'tailwind-merge';

interface DocumentoEstadoCuentaProps {
  documento: EstadoCuentaBeneficiarios;
  className?: string;
}

const Seccion: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <div className="mt-8 break-inside-avoid">
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-1.5">{titulo}</p>
    {children}
  </div>
);

const th = 'py-1.5 px-2 font-semibold text-left';
const thDer = 'py-1.5 px-2 font-semibold text-right';
const td = 'py-1.5 px-2';
const tdDer = 'py-1.5 px-2 text-right tabular-nums';

/**
 * Estado de cuenta de beneficiarios en hoja tamaño carta: saldos de cada lote vendido (por separado, para no
 * mezclar ventas), repartos de cada cobro y entregas.
 * Mismo estilo que DocumentoRecibo; se imprime solo con `imprimirElemento`.
 */
export const DocumentoEstadoCuenta = forwardRef<HTMLDivElement, DocumentoEstadoCuentaProps>(({ documento, className }, ref) => {
  const { emisor, titulo, lugarYFecha, ventas, totales, repartos, entregas, notas, firmas } = documento;

  return (
    <div
      ref={ref}
      className={twMerge(
        'hoja-documento relative w-full max-w-[816px] mx-auto bg-white text-slate-900 px-12 py-10 border border-slate-300 shadow-sm font-sans text-[13px] leading-relaxed',
        className
      )}
    >
      {/* Encabezado */}
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
          <p className="text-xs text-slate-600 mt-0.5">{lugarYFecha}</p>
        </div>
      </div>
      <div className="mt-5 border-t-2 border-slate-900" />
      <div className="mt-[3px] border-t border-slate-400" />

      {/* Resumen */}
      <div className="mt-6 grid grid-cols-4 border border-slate-900 divide-x divide-slate-900 text-center">
        {[
          ['Cobrado', totales.cobrado],
          ['Repartido', totales.repartido],
          ['Entregado', totales.entregado],
          ['Pendiente de entregar', totales.pendiente],
        ].map(([etiqueta, valor]) => (
          <div key={etiqueta as string} className="py-2 px-2">
            <p className="text-[9px] uppercase tracking-[0.15em] text-slate-500">{etiqueta}</p>
            <p className="text-base font-bold tabular-nums">{dinero(valor as number)}</p>
          </div>
        ))}
      </div>

      {/* Saldos por lote vendido: cada venta por separado */}
      {ventas.length === 0 && (
        <Seccion titulo="Saldos por lote vendido">
          <p className="text-xs text-slate-500">Todavía no hay cobros repartidos.</p>
        </Seccion>
      )}
      {ventas.length > 0 && (
        <p className="mt-8 -mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Saldos por lote vendido</p>
      )}
      {ventas.map((v, k) => (
        <div key={k} className="mt-6 break-inside-avoid">
          <div className="flex items-baseline justify-between gap-4 mb-1.5">
            <p className="text-sm font-bold">Lote {v.lote}</p>
            <p className="text-[11px] text-slate-600 text-right">
              {v.comprador && <>Comprador: {v.comprador} · </>}Cobrado {dinero(v.totales.cobrado)}
            </p>
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-y-2 border-slate-900">
                <th className={th}>Persona</th>
                <th className={thDer}>Participación</th>
                <th className={thDer}>Repartido</th>
                <th className={thDer}>Reembolsos</th>
                <th className={thDer}>Entregado</th>
                <th className={thDer}>Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {v.filas.map((s, i) => (
                <tr key={i} className="border-b border-slate-300">
                  <td className={td}>
                    <span className="font-medium">{s.nombre}</span>
                    {s.tipo !== 'Beneficiario' && <span className="text-slate-500"> · {s.tipo}</span>}
                  </td>
                  <td className={tdDer}>{s.participacion !== undefined ? `${s.participacion.toFixed(4)} %` : '—'}</td>
                  <td className={tdDer}>{dinero(s.repartido)}</td>
                  <td className={tdDer}>{dinero(s.reembolsos)}</td>
                  <td className={tdDer}>{dinero(s.entregado)}</td>
                  <td className={twMerge(tdDer, 'font-semibold', s.pendiente < 0 && 'text-red-700')}>
                    {s.pendiente < 0 ? `${dinero(-s.pendiente)} a devolver` : dinero(s.pendiente)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-900 font-bold">
                <td className={td}>Total del lote</td>
                <td className={tdDer} />
                <td className={tdDer}>{dinero(v.totales.repartido)}</td>
                <td className={tdDer}>{dinero(v.totales.reembolsos)}</td>
                <td className={tdDer}>{dinero(v.totales.entregado)}</td>
                <td className={tdDer}>{dinero(v.totales.pendiente)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ))}

      {/* Repartos por cobro */}
      <Seccion titulo="Repartos por cobro">
        {repartos.length === 0 ? (
          <p className="text-xs text-slate-500">Todavía no hay cobros repartidos.</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-y-2 border-slate-900">
                <th className={th}>Fecha</th>
                <th className={th}>Lote</th>
                <th className={th}>Cobro</th>
                <th className={thDer}>Cobrado</th>
                <th className={thDer}>Reembolsos</th>
                <th className={thDer}>Neto repartido</th>
              </tr>
            </thead>
            <tbody>
              {repartos.map((r, i) => (
                <tr key={i} className={twMerge('border-b border-slate-300', r.anulado && 'line-through text-slate-400')}>
                  <td className={td}>{fechaLarga(r.fecha)}</td>
                  <td className={td}>{r.lote}</td>
                  <td className={td}>
                    {r.cobro}
                    {r.anulado && ' (anulado)'}
                  </td>
                  <td className={tdDer}>{dinero(r.cobrado)}</td>
                  <td className={tdDer}>{dinero(r.reembolsos)}</td>
                  <td className={tdDer}>{dinero(r.neto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>

      {/* Entregas */}
      <Seccion titulo="Entregas de dinero">
        {entregas.length === 0 ? (
          <p className="text-xs text-slate-500">Todavía no se ha entregado dinero.</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-y-2 border-slate-900">
                <th className={th}>Folio</th>
                <th className={th}>Fecha</th>
                <th className={th}>Lote</th>
                <th className={th}>Destinatario</th>
                <th className={th}>Forma de entrega</th>
                <th className={thDer}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {entregas.map((e, i) => (
                <tr key={i} className="border-b border-slate-300">
                  <td className={twMerge(td, 'font-mono')}>{e.folio}</td>
                  <td className={td}>{fechaLarga(e.fecha)}</td>
                  <td className={td}>{e.lote}</td>
                  <td className={td}>{e.destinatario}</td>
                  <td className={td}>{e.metodo}</td>
                  <td className={tdDer}>{dinero(e.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>

      {/* Notas */}
      {notas.length > 0 && (
        <div className="mt-6 space-y-0.5 text-[11px] text-slate-500">
          {notas.map((nota, i) => (
            <p key={i}>{nota}</p>
          ))}
        </div>
      )}

      {/* Firma */}
      <div className="mt-16 grid gap-12 break-inside-avoid" style={{ gridTemplateColumns: `repeat(${Math.max(firmas.length, 2)}, minmax(0, 1fr))` }}>
        {firmas.map((firma, i) => (
          <div key={i} className="text-center">
            <div className="mx-4 mb-1.5 border-t border-slate-800" />
            <p className="text-xs font-semibold">{firma.etiqueta}</p>
            {firma.nombre && <p className="text-xs">{firma.nombre}</p>}
          </div>
        ))}
      </div>

      {/* Pie */}
      <div className="mt-12 pt-2 border-t border-slate-300 flex justify-between gap-4 text-[10px] text-slate-400">
        <span>{titulo}</span>
        <span>{lugarYFecha}</span>
      </div>
    </div>
  );
});

DocumentoEstadoCuenta.displayName = 'DocumentoEstadoCuenta';
