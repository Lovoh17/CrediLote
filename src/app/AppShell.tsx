import React from 'react';
import { Sidebar, NavigationTab } from './Sidebar';
import { Header } from './Header';
import { Proyecto } from '@/shared/types';

interface AppShellProps {
  currentTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  proyectos: Proyecto[];
  activeProyecto?: Proyecto;
  onSelectProyecto: (id: string) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentTab,
  onTabChange,
  proyectos,
  activeProyecto,
  onSelectProyecto,
  children,
}) => {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 font-sans">
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={onTabChange}
        proyectos={proyectos}
        activeProyecto={activeProyecto}
        onSelectProyecto={onSelectProyecto}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header currentTab={currentTab} activeProyecto={activeProyecto} />
        <main className="flex-1 overflow-y-auto p-6 bg-slate-50/70">{children}</main>
      </div>
    </div>
  );
};
