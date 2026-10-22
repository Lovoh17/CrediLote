import React from 'react';
import { Proyecto } from '@/shared/types';
import { NavigationTab } from './Sidebar';
import { MapPin, RefreshCw } from 'lucide-react';
import { storage } from '@/shared/services/storage';
import { IndicadorSincronizacion } from './IndicadorSincronizacion';

interface HeaderProps {
  currentTab: NavigationTab;
  activeProyecto?: Proyecto;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, activeProyecto }) => {
  const titles: Record<NavigationTab, { title: string; subtitle: string }> = {
    dashboard: {
      title: 'Tablero de Control',
      subtitle: 'Resumen ejecutivo de cartera, cobranza y ocupación territorial',
    },
    cartography: {
      title: 'Cartografía y Lotes',
      subtitle: 'Visualización satelital y vectorial de lotes con asignación de titularidad',
    },
    contracts: {
      title: 'Ingesta de Promesas de Venta',
      subtitle: 'Carga de documentos, extracción automática y verificación en pantalla dividida',
    },
    finance: {
      title: 'Motor Financiero y Amortización',
      subtitle: 'Simulador dinámico y planes de pago según prima y condiciones pactadas',
    },
    payments: {
      title: 'Cobranza y Emisión de Recibos',
      subtitle: 'Registro de pagos periódicos, control de cuotas y emisión de comprobantes oficiales',
    },
    lotes: {
      title: 'Lotes',
      subtitle: 'Todos los lotes del proyecto: su estado, el avance de los pagos y la promesa de venta',
    },
    expenses: {
      title: 'Gastos de Venta',
      subtitle: 'Gastos de gestión, abogados y trámites amarrados a cada venta, y su reembolso desde la prima',
    },
    negotiations: {
      title: 'Negociaciones',
      subtitle: 'Negociaciones con interesados, sus gastos y el paso a la promesa de venta',
    },
    beneficiaries: {
      title: 'Beneficiarios y Repartos',
      subtitle: 'Participación de cada beneficiario, reparto de los cobros y control de entregas',
    },
  };

  const handleClearData = () => {
    if (
      window.confirm(
        'Se borrarán los lotes, ventas, clientes, cuotas, recibos, gastos, negociaciones y repartos, en este navegador y ' +
          'en la base de datos en la nube. Se conservan el proyecto y los beneficiarios. La versión anterior queda en el ' +
          'historial de la nube por si hay que recuperarla. ¿Desea continuar?'
      )
    ) {
      storage.limpiarConservandoBeneficiarios();
      window.location.reload();
    }
  };

  const info = titles[currentTab];

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
      <div>
        <h1 className="text-base font-bold text-slate-900 leading-tight">{info.title}</h1>
        <p className="text-xs text-slate-500 leading-normal">{info.subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        <IndicadorSincronizacion />

        {activeProyecto && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span>{activeProyecto.ubicacion}</span>
          </div>
        )}

        <button
          onClick={handleClearData}
          title="Limpiar datos del sistema"
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors text-xs flex items-center gap-1 border border-slate-200"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden md:inline text-[11px] font-medium">Limpiar Datos</span>
        </button>
      </div>
    </header>
  );
};
