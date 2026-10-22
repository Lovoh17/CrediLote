import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ACargoDe, Beneficiario, CategoriaGasto, GastoVenta, ResponsableGasto } from '@/shared/types';
import { ETIQUETAS_CATEGORIA } from '@/modules/beneficiarios/engine/reparto';
import { formatCurrency, hoyISO } from '@/shared/utils/formatters';

export type BorradorGasto = Omit<GastoVenta, 'id' | 'proyectoId' | 'loteId' | 'contratoId' | 'createdAt'>;

const inputBase =
  'w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white';

export const borradorVacio = (): BorradorGasto => ({
  categoria: 'GESTION_VENTA',
  descripcion: '',
  monto: 0,
  fecha: hoyISO(),
  aCargoDe: 'SUCESION',
  responsable: { tipo: 'EXTERNO', nombre: '' },
});

/** Un gasto está completo si tiene monto y un responsable identificado. */
export function gastoCompleto(g: BorradorGasto): boolean {
  const responsableOk = g.responsable.tipo === 'BENEFICIARIO' ? !!g.responsable.beneficiarioId : g.responsable.nombre.trim().length > 0;
  return g.monto > 0 && responsableOk;
}

/** Selector del responsable del gasto: uno de los beneficiarios u otra persona (plan 04.3, B4). */
export const SelectorResponsable: React.FC<{
  beneficiarios: Beneficiario[];
  value: ResponsableGasto;
  onChange: (r: ResponsableGasto) => void;
}> = ({ beneficiarios, value, onChange }) => {
  const seleccion = value.tipo === 'BENEFICIARIO' ? value.beneficiarioId : '__externo__';
  return (
    <div className="space-y-1">
      <select
        value={seleccion}
        onChange={(e) =>
          onChange(
            e.target.value === '__externo__'
              ? { tipo: 'EXTERNO', nombre: value.tipo === 'EXTERNO' ? value.nombre : '' }
              : { tipo: 'BENEFICIARIO', beneficiarioId: e.target.value }
          )
        }
        className={inputBase}
      >
        {beneficiarios.map((b) => (
          <option key={b.id} value={b.id}>
            {b.nombreCompleto} (beneficiario)
          </option>
        ))}
        <option value="__externo__">Otra persona…</option>
      </select>
      {value.tipo === 'EXTERNO' && (
        <input
          type="text"
          value={value.nombre}
          onChange={(e) => onChange({ tipo: 'EXTERNO', nombre: e.target.value })}
          placeholder="Nombre de quien hizo el gasto"
          className={inputBase}
        />
      )}
    </div>
  );
};

/** Campos de un gasto (categoría, detalle, monto, fecha, a cargo de, responsable). */
export const CamposGasto: React.FC<{
  gasto: BorradorGasto;
  beneficiarios: Beneficiario[];
  onChange: (g: BorradorGasto) => void;
}> = ({ gasto, beneficiarios, onChange }) => (
  <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
    <div className="md:col-span-2">
      <label className="text-[11px] font-medium text-slate-600 block mb-0.5">Categoría</label>
      <select
        value={gasto.categoria}
        onChange={(e) => onChange({ ...gasto, categoria: e.target.value as CategoriaGasto })}
        className={inputBase}
      >
        {Object.entries(ETIQUETAS_CATEGORIA).map(([valor, etiqueta]) => (
          <option key={valor} value={valor}>
            {etiqueta}
          </option>
        ))}
      </select>
    </div>
    <div className="md:col-span-2">
      <label className="text-[11px] font-medium text-slate-600 block mb-0.5">Detalle</label>
      <input
        type="text"
        value={gasto.descripcion}
        onChange={(e) => onChange({ ...gasto, descripcion: e.target.value })}
        placeholder="ej. Honorarios por redacción de la promesa"
        className={inputBase}
      />
    </div>
    <div>
      <label className="text-[11px] font-medium text-slate-600 block mb-0.5">Monto ($)</label>
      <input
        type="number"
        min="0"
        step="0.01"
        value={gasto.monto || ''}
        onChange={(e) => onChange({ ...gasto, monto: Math.max(0, parseFloat(e.target.value) || 0) })}
        placeholder="0.00"
        className={`${inputBase} font-semibold`}
      />
    </div>
    <div>
      <label className="text-[11px] font-medium text-slate-600 block mb-0.5">Fecha</label>
      <input
        type="date"
        value={gasto.fecha}
        onChange={(e) => onChange({ ...gasto, fecha: e.target.value })}
        className={inputBase}
      />
    </div>
    <div className="md:col-span-2">
      <label className="text-[11px] font-medium text-slate-600 block mb-0.5">A cargo de</label>
      <select
        value={gasto.aCargoDe}
        onChange={(e) => onChange({ ...gasto, aCargoDe: e.target.value as ACargoDe })}
        className={inputBase}
      >
        <option value="SUCESION">La sucesión (se reembolsa)</option>
        <option value="COMPRADOR">El comprador (solo control)</option>
        <option value="RESPONSABLE">El propio responsable (no se reembolsa)</option>
      </select>
    </div>
    <div className="md:col-span-4">
      <label className="text-[11px] font-medium text-slate-600 block mb-0.5">
        Responsable {gasto.aCargoDe === 'SUCESION' ? '(recibe el reembolso)' : ''}
      </label>
      <SelectorResponsable
        beneficiarios={beneficiarios}
        value={gasto.responsable}
        onChange={(responsable) => onChange({ ...gasto, responsable })}
      />
    </div>
  </div>
);

/** Lista editable de gastos de una venta, usada al subir la promesa (plan 04.3, 8.3.3). */
export const EditorGastos: React.FC<{
  gastos: BorradorGasto[];
  beneficiarios: Beneficiario[];
  prima: number;
  onChange: (gastos: BorradorGasto[]) => void;
  /** Gastos ya registrados (p. ej. de la negociación vinculada) que también se reembolsan de esta prima. */
  gastosPrevios?: { total: number; etiqueta: string };
}> = ({ gastos, beneficiarios, prima, onChange, gastosPrevios }) => {
  const totalNuevos = gastos.filter((g) => g.aCargoDe === 'SUCESION').reduce((a, g) => a + g.monto, 0);
  const totalSucesion = totalNuevos + (gastosPrevios?.total ?? 0);
  const totalComprador = gastos.filter((g) => g.aCargoDe === 'COMPRADOR').reduce((a, g) => a + g.monto, 0);
  const reembolsoPrima = Math.min(totalSucesion, prima);
  const saldoGastos = Math.max(0, totalSucesion - prima);

  return (
    <div className="space-y-3">
      {gastos.length === 0 && (
        <p className="text-[11px] text-slate-500">
          Sin gastos registrados para esta venta. Agregue la comisión de gestión, honorarios de abogado u otros gastos.
        </p>
      )}
      {gastos.map((g, i) => (
        <div key={i} className="relative p-3 border border-slate-200 rounded-lg bg-slate-50/60">
          <button
            type="button"
            onClick={() => onChange(gastos.filter((_, j) => j !== i))}
            title="Quitar gasto"
            className="absolute top-2 right-2 p-1 text-slate-400 hover:text-rose-600"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <CamposGasto
            gasto={g}
            beneficiarios={beneficiarios}
            onChange={(nuevo) => onChange(gastos.map((x, j) => (j === i ? nuevo : x)))}
          />
          {!gastoCompleto(g) && (
            <p className="mt-1.5 text-[11px] text-amber-700">Indique el monto y el responsable del gasto.</p>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...gastos, borradorVacio()])}
        className="text-xs font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
      >
        <Plus className="w-3.5 h-3.5" /> Agregar gasto
      </button>

      {(gastos.length > 0 || totalSucesion > 0) && (
        <div className="text-[11px] text-slate-600 bg-white border border-slate-200 rounded-lg p-2.5 space-y-0.5">
          <p>
            Gastos a cargo de la sucesión: <strong>{formatCurrency(totalSucesion)}</strong>
            {gastosPrevios && gastosPrevios.total > 0 && (
              <> (incluye {formatCurrency(gastosPrevios.total)} de {gastosPrevios.etiqueta})</>
            )}{' '}
            · se reembolsan de la prima:{' '}
            <strong>{formatCurrency(reembolsoPrima)}</strong>
            {saldoGastos > 0 && (
              <span className="text-amber-700"> · {formatCurrency(saldoGastos)} se cubrirán con las cuotas siguientes</span>
            )}
          </p>
          <p>
            Neto de la prima a repartir: <strong>{formatCurrency(Math.max(0, prima - totalSucesion))}</strong>
            {totalComprador > 0 && <> · gastos a cargo del comprador (control): {formatCurrency(totalComprador)}</>}
          </p>
        </div>
      )}
    </div>
  );
};
