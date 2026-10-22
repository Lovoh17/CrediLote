import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  MapPin,
  FileText,
  Calculator,
  Receipt,
  Layers,
  Plus,
  Check,
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
  LandPlot,
  Pencil,
  Wallet,
  Users,
  Handshake,
} from 'lucide-react';
import { Proyecto } from '@/shared/types';
import { clsx } from 'clsx';
import { ProyectoFormModal } from './ProyectoFormModal';
import { storage } from '@/shared/services/storage';

export type NavigationTab =
  | 'dashboard'
  | 'cartography'
  | 'contracts'
  | 'finance'
  | 'payments'
  | 'lotes'
  | 'expenses'
  | 'beneficiaries'
  | 'negotiations';

interface SidebarProps {
  currentTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  proyectos: Proyecto[];
  activeProyecto?: Proyecto;
  onSelectProyecto: (id: string) => void;
}

const NAV_ITEMS: { id: NavigationTab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Tablero de Control', icon: LayoutDashboard },
  { id: 'cartography', label: 'Cartografía y Lotes', icon: MapPin },
  { id: 'negotiations', label: 'Negociaciones', icon: Handshake },
  { id: 'contracts', label: 'Ingesta de Promesas', icon: FileText },
  { id: 'finance', label: 'Motor Financiero', icon: Calculator },
  { id: 'payments', label: 'Cobranza y Recibos', icon: Receipt },
  { id: 'lotes', label: 'Lotes', icon: Layers },
  { id: 'expenses', label: 'Gastos de Venta', icon: Wallet },
  { id: 'beneficiaries', label: 'Beneficiarios', icon: Users },
];

// Preferencia de la barra colapsada: solo comodidad por navegador (puede no estar disponible).
const CLAVE_COLAPSADA = 'credilote_sidebar_colapsada';

function leerColapsada(): boolean {
  try {
    return localStorage.getItem(CLAVE_COLAPSADA) === '1';
  } catch {
    return false;
  }
}

function iniciales(nombre: string): string {
  return (
    nombre
      .split(/\s+/)
      .filter((p) => p.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(p))
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || 'P'
  );
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  proyectos,
  activeProyecto,
  onSelectProyecto,
}) => {
  const [colapsada, setColapsada] = useState(leerColapsada);
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  // Formulario de proyecto: undefined = cerrado, null = nuevo, Proyecto = edición
  const [proyectoEnFormulario, setProyectoEnFormulario] = useState<Proyecto | null | undefined>(undefined);

  const alternarColapsada = () => {
    setColapsada((c) => {
      try {
        localStorage.setItem(CLAVE_COLAPSADA, c ? '0' : '1');
      } catch {
        /* sin almacenamiento: solo dura la sesión */
      }
      return !c;
    });
    setSelectorAbierto(false);
  };

  // Cerrar el selector de proyectos al hacer clic fuera o con Escape
  useEffect(() => {
    if (!selectorAbierto) return;
    const alClic = (e: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) setSelectorAbierto(false);
    };
    const alTecla = (e: KeyboardEvent) => e.key === 'Escape' && setSelectorAbierto(false);
    document.addEventListener('mousedown', alClic);
    document.addEventListener('keydown', alTecla);
    return () => {
      document.removeEventListener('mousedown', alClic);
      document.removeEventListener('keydown', alTecla);
    };
  }, [selectorAbierto]);

  const abrirNuevoProyecto = () => {
    setSelectorAbierto(false);
    setProyectoEnFormulario(null);
  };

  const abrirEdicion = (p: Proyecto) => {
    setSelectorAbierto(false);
    setProyectoEnFormulario(p);
  };

  return (
    <aside
      className={clsx(
        'bg-white border-r border-slate-200 flex flex-col shrink-0 transition-[width] duration-200',
        colapsada ? 'w-[68px]' : 'w-64'
      )}
    >
      {/* Marca + botón para colapsar */}
      <div className={clsx('h-16 flex items-center border-b border-slate-200', colapsada ? 'justify-center' : 'px-4 gap-3')}>
        {!colapsada && (
          <>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-sm shrink-0">
              <LandPlot className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-bold text-[15px] tracking-tight text-slate-900 block leading-tight">CrediLote</span>
              <span className="text-[11px] text-slate-500 block leading-tight">Gestión territorial</span>
            </div>
          </>
        )}
        <button
          onClick={alternarColapsada}
          title={colapsada ? 'Expandir menú' : 'Contraer menú'}
          aria-label={colapsada ? 'Expandir menú' : 'Contraer menú'}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          {colapsada ? <PanelLeftOpen className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
        </button>
      </div>

      {/* Selector de proyecto */}
      <div ref={selectorRef} className={clsx('relative border-b border-slate-200', colapsada ? 'p-3' : 'p-3')}>
        {proyectos.length === 0 ? (
          <button
            onClick={abrirNuevoProyecto}
            title="Crear proyecto"
            className={clsx(
              'w-full flex items-center gap-2 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50/50 transition-colors',
              colapsada ? 'justify-center h-10' : 'px-3 py-2.5 text-sm'
            )}
          >
            <Plus className="w-4 h-4 shrink-0" />
            {!colapsada && <span className="font-medium">Crear primer proyecto</span>}
          </button>
        ) : (
          <button
            onClick={() => setSelectorAbierto((a) => !a)}
            title={activeProyecto?.nombre}
            aria-haspopup="listbox"
            aria-expanded={selectorAbierto}
            className={clsx(
              'w-full flex items-center gap-2.5 rounded-lg hover:bg-slate-100 transition-colors text-left',
              selectorAbierto && 'bg-slate-100',
              colapsada ? 'justify-center p-1' : 'p-1.5'
            )}
          >
            <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">
              {iniciales(activeProyecto?.nombre ?? 'P')}
            </span>
            {!colapsada && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900 truncate">
                    {activeProyecto?.nombre ?? 'Seleccione un proyecto'}
                  </span>
                  <span className="block text-[11px] text-slate-500 truncate">
                    {activeProyecto?.ubicacion ?? `${proyectos.length} proyectos`}
                  </span>
                </span>
                <ChevronsUpDown className="w-4 h-4 text-slate-400 shrink-0" />
              </>
            )}
          </button>
        )}

        {selectorAbierto && (
          <div
            role="listbox"
            className={clsx(
              'absolute z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5',
              colapsada ? 'left-full top-0 ml-2 w-64' : 'left-3 right-3'
            )}
          >
            <p className="px-3 pt-1 pb-1.5 text-[11px] font-medium text-slate-500">Proyectos</p>
            <div className="max-h-64 overflow-y-auto">
              {proyectos.map((p) => (
                <div key={p.id} className="group flex items-center hover:bg-slate-50">
                  <button
                    role="option"
                    aria-selected={p.id === activeProyecto?.id}
                    onClick={() => {
                      onSelectProyecto(p.id);
                      setSelectorAbierto(false);
                    }}
                    className="flex-1 min-w-0 flex items-center gap-2.5 pl-3 py-2 text-left"
                  >
                    <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center shrink-0">
                      {iniciales(p.nombre)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-slate-800 truncate">{p.nombre}</span>
                      <span className="block text-[11px] text-slate-500 truncate">{p.ubicacion}</span>
                    </span>
                    {p.id === activeProyecto?.id && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                  </button>
                  <button
                    onClick={() => abrirEdicion(p)}
                    title={`Editar ${p.nombre}`}
                    aria-label={`Editar ${p.nombre}`}
                    className="mx-1.5 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/70"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 mt-1 pt-1">
              <button
                onClick={abrirNuevoProyecto}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 font-medium"
              >
                <Plus className="w-4 h-4" />
                Nuevo proyecto
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navegación principal */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto" aria-label="Módulos">
        {!colapsada && (
          <p className="px-2.5 mb-2 text-[11px] font-medium text-slate-400 uppercase tracking-wider">Módulos</p>
        )}
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icono }) => {
            const activo = currentTab === id;
            // Aviso: negociaciones completadas que esperan la promesa de venta
            const pendientes =
              id === 'negotiations' ? storage.getNegociaciones().filter((n) => n.estado === 'ESPERANDO_PROMESA').length : 0;
            return (
              <li key={id}>
                <button
                  onClick={() => onTabChange(id)}
                  title={colapsada ? label : undefined}
                  aria-current={activo ? 'page' : undefined}
                  className={clsx(
                    'relative w-full flex items-center gap-3 rounded-lg text-sm transition-colors',
                    colapsada ? 'justify-center h-10' : 'px-2.5 h-9',
                    activo
                      ? 'bg-emerald-50 text-emerald-800 font-semibold'
                      : 'text-slate-600 font-medium hover:bg-slate-100 hover:text-slate-900'
                  )}
                >
                  {activo && (
                    <span className="absolute -left-3 top-1.5 bottom-1.5 w-1 rounded-r-full bg-emerald-500" aria-hidden />
                  )}
                  <Icono className={clsx('w-[18px] h-[18px] shrink-0', activo ? 'text-emerald-600' : 'text-slate-400')} />
                  {!colapsada && <span className="truncate flex-1 text-left">{label}</span>}
                  {pendientes > 0 &&
                    (colapsada ? (
                      <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-amber-500" aria-label={`${pendientes} esperando promesa`} />
                    ) : (
                      <span
                        className="text-[10px] font-bold text-amber-800 bg-amber-100 rounded-full px-1.5 py-0.5"
                        title={`${pendientes} negociación(es) esperando la promesa de venta`}
                      >
                        {pendientes}
                      </span>
                    ))}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Usuario */}
      <div className={clsx('border-t border-slate-200 p-3 flex items-center gap-2.5', colapsada && 'justify-center')}>
        <span className="relative w-8 h-8 rounded-full bg-slate-800 text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
          AD
          <span
            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white"
            title="Sistema operativo"
          />
        </span>
        {!colapsada && (
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-800 leading-tight">Administrador</span>
            <span className="block text-[11px] text-emerald-600 leading-tight">Sistema operativo</span>
          </span>
        )}
      </div>

      <ProyectoFormModal
        isOpen={proyectoEnFormulario !== undefined}
        onClose={() => setProyectoEnFormulario(undefined)}
        proyecto={proyectoEnFormulario ?? undefined}
        onGuardado={onSelectProyecto}
      />
    </aside>
  );
};
