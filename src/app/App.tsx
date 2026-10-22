import React, { useState, useEffect } from 'react';
import { AppShell } from './AppShell';
import { NavigationTab } from './Sidebar';
import { storage } from '@/shared/services/storage';
import { DashboardView } from '@/modules/dashboard/DashboardView';
import { CartographyView } from '@/modules/cartography/CartographyView';
import { ContractsView } from '@/modules/contracts/ContractsView';
import { FinanceView } from '@/modules/finance/FinanceView';
import { PaymentsView } from '@/modules/payments/PaymentsView';
import { GastosView } from '@/modules/gastos/GastosView';
import { BeneficiariosView } from '@/modules/beneficiarios/BeneficiariosView';
import { NegociacionesView } from '@/modules/negociaciones/NegociacionesView';
import { LotesView } from '@/modules/lotes/LotesView';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [, setVersion] = useState(0);

  // Suscribirse a cambios en el almacenamiento local
  useEffect(() => {
    const unsubscribe = storage.subscribe(() => {
      setVersion((v) => v + 1);
    });
    return unsubscribe;
  }, []);

  const proyectos = storage.getProyectos();
  const activeProyecto = storage.getActiveProyecto();

  const handleSelectProyecto = (id: string) => {
    storage.setActiveProyectoId(id);
  };

  const renderModuleView = () => {
    switch (currentTab) {
      case 'dashboard':
        return <DashboardView onNavigate={setCurrentTab} />;
      case 'cartography':
        return <CartographyView onNavigate={setCurrentTab} />;
      case 'contracts':
        return <ContractsView onNavigate={setCurrentTab} />;
      case 'finance':
        return <FinanceView onNavigate={setCurrentTab} />;
      case 'payments':
        return <PaymentsView />;
      case 'lotes':
        return <LotesView onNavigate={setCurrentTab} />;
      case 'expenses':
        return <GastosView />;
      case 'beneficiaries':
        return <BeneficiariosView />;
      case 'negotiations':
        return <NegociacionesView onNavigate={setCurrentTab} />;
      default:
        return <DashboardView onNavigate={setCurrentTab} />;
    }
  };

  return (
    <AppShell
      currentTab={currentTab}
      onTabChange={setCurrentTab}
      proyectos={proyectos}
      activeProyecto={activeProyecto}
      onSelectProyecto={handleSelectProyecto}
    >
      {renderModuleView()}
    </AppShell>
  );
};
