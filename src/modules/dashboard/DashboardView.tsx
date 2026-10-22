import React, { useMemo } from 'react';
import { MetricCard } from '@/shared/components/ui/MetricCard';
import { Card, CardHeader, CardBody } from '@/shared/components/ui/Card';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { DataGrid, Column } from '@/shared/components/ui/DataGrid';
import { formatCurrency, formatDate } from '@/shared/utils/formatters';
import { storage } from '@/shared/services/storage';
import { Cuota } from '@/shared/types';
import {
  DollarSign,
  TrendingUp,
  PieChart,
  ArrowRight,
  FileCheck,
} from 'lucide-react';
import { NavigationTab } from '@/app/Sidebar';
import { calcularSaldos } from '@/modules/beneficiarios/engine/reparto';

interface DashboardViewProps {
  onNavigate: (tab: NavigationTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const lotes = storage.getLotes();
  const cuotas = storage.getCuotasPendientes();

  // Cálculos de métricas clave
  const metrics = useMemo(() => {
    const totalLotes = lotes.length;
    const vendidos = lotes.filter((l) => l.estado === 'VENDIDO').length;
    const reservados = lotes.filter((l) => l.estado === 'RESERVADO').length;
    const disponibles = lotes.filter((l) => l.estado === 'DISPONIBLE').length;
    const tasaOcupacion = totalLotes > 0 ? ((vendidos + reservados) / totalLotes) * 100 : 0;

    // Resumen de cobranza oficial del proyecto (RN-C1 / D5)
    const cobranza = storage.getResumenCobranza();
    const totalPrimas = cobranza.primasCobradas;
    const carteraPorCobrar = cuotas.reduce((acc, c) => acc + c.abonoCapital, 0);
    const totalRecaudado = cobranza.totalCobrado;

    // Cuotas con vencimiento próximo (próximos 30 días)
    const hoy = new Date();
    const en30Dias = new Date();
    en30Dias.setDate(hoy.getDate() + 30);

    const proximosVencimientos = cuotas
      .filter((c) => {
        const fv = new Date(c.fechaVencimiento);
        return fv >= hoy && fv <= en30Dias;
      })
      .sort((a, b) => new Date(a.fechaVencimiento).getTime() - new Date(b.fechaVencimiento).getTime());

    return {
      totalLotes,
      vendidos,
      reservados,
      disponibles,
      tasaOcupacion,
      totalPrimas,
      carteraPorCobrar,
      totalRecaudado,
      recibosVigentes: cobranza.recibosVigentes,
      recibosAnulados: cobranza.recibosAnulados,
      proximosVencimientos,
    };
  }, [lotes, cuotas, storage.getRecibos().length]);

  const cuotaColumns: Column<Cuota>[] = [
    {
      key: 'numeroCuota',
      header: 'Cuota',
      render: (c) => <span className="font-semibold text-slate-800">Cuota #{c.numeroCuota}</span>,
    },
    {
      key: 'fechaVencimiento',
      header: 'Vencimiento',
      render: (c) => formatDate(c.fechaVencimiento),
    },
    {
      key: 'montoCuota',
      header: 'Monto Exigible',
      align: 'right',
      render: (c) => (
        <span className="font-semibold text-slate-900 tabular-nums">{formatCurrency(c.montoCuota)}</span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      align: 'center',
      render: () => (
        <Badge variant="reserved" dot>
          Por Vencer
        </Badge>
      ),
    },
    {
      key: 'acciones',
      header: 'Acción',
      align: 'right',
      render: () => (
        <Button size="xs" variant="outline" onClick={() => onNavigate('payments')}>
          Registrar Cobro
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Lotes Vendidos"
          value={`${metrics.vendidos} / ${metrics.totalLotes}`}
          helpText={`${metrics.disponibles} lotes disponibles`}
          change={`${metrics.tasaOcupacion.toFixed(1)}% ocupación`}
          trend="up"
          icon={<PieChart className="w-5 h-5 text-emerald-600" />}
        />

        <MetricCard
          label="Primas Recaudadas"
          value={formatCurrency(metrics.totalPrimas)}
          helpText="Anticipos formalizados"
          icon={<DollarSign className="w-5 h-5 text-blue-600" />}
        />

        <MetricCard
          label="Cartera por Cobrar"
          value={formatCurrency(metrics.carteraPorCobrar)}
          helpText="Saldo capital financiado"
          icon={<TrendingUp className="w-5 h-5 text-indigo-600" />}
        />

        <MetricCard
          label="Recaudación Total"
          value={formatCurrency(metrics.totalRecaudado)}
          helpText={`${metrics.recibosVigentes} vigentes${metrics.recibosAnulados > 0 ? ` · ${metrics.recibosAnulados} anulados` : ''}`}
          trend="up"
          icon={<FileCheck className="w-5 h-5 text-emerald-600" />}
        />
      </div>

      {/* Main Grid: Vencimientos & Quick Navigation */}
      {/* Negociaciones que esperan la promesa de venta (plan 04.3, 8.7) */}
      {(() => {
        const esperando = storage.getNegociaciones().filter((n) => n.estado === 'ESPERANDO_PROMESA');
        if (esperando.length === 0) return null;
        return (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-amber-900">
              {esperando.length === 1
                ? `La negociación con ${esperando[0].interesadoNombre} está esperando la promesa de venta.`
                : `${esperando.length} negociaciones están esperando la promesa de venta.`}
            </p>
            <Button size="sm" onClick={() => onNavigate('negotiations')}>
              Ver negociaciones
            </Button>
          </div>
        );
      })()}

      {/* Sucesión: pendiente de entregar a beneficiarios y responsables de gastos (plan 04.3, 8.5.4) */}
      {(() => {
        const beneficiarios = storage.getBeneficiarios();
        const gastos = storage.getGastos();
        if (beneficiarios.length === 0 && gastos.length === 0) return null;
        const saldos = calcularSaldos(beneficiarios, gastos, storage.getDistribuciones(), storage.getLiquidaciones());
        const pendiente = saldos.reduce((acc, x) => acc + Math.max(0, x.pendiente), 0);
        const sinRepartir = storage.getCobrosSinRepartir().length;
        return (
          <div className="p-4 bg-white border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              <p className="font-semibold text-slate-900 text-sm">Beneficiarios y gastos de venta</p>
              <p>
                Pendiente de entregar: <strong>{formatCurrency(pendiente)}</strong> a {saldos.filter((x) => x.pendiente > 0).length} persona(s)
                {sinRepartir > 0 && <span className="text-amber-700"> · {sinRepartir} cobro(s) sin repartir</span>}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onNavigate('beneficiaries')}>
              Ver repartos
            </Button>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Proximos Vencimientos */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Próximos Vencimientos de Cuotas (30 Días)
                </h2>
                <p className="text-xs text-slate-500">
                  Seguimiento de cobros programados para el periodo corriente
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate('payments')}
                rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
              >
                Ver Módulo de Cobros
              </Button>
            </CardHeader>
            <CardBody className="p-0">
              <DataGrid
                columns={cuotaColumns}
                data={metrics.proximosVencimientos.slice(0, 5)}
                keyExtractor={(item) => item.id}
                striped
                emptyMessage="No hay cuotas programadas para vencer en los próximos 30 días."
              />
            </CardBody>
          </Card>
        </div>

        {/* Right Column: Operaciones Rápidas & Resumen de Inventario */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-bold text-slate-900">Acciones Frecuentes</h2>
            </CardHeader>
            <CardBody className="space-y-3">
              <Button
                variant="primary"
                className="w-full justify-start text-xs"
                onClick={() => onNavigate('contracts')}
              >
                Ingresar Nueva Promesa de Venta
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start text-xs"
                onClick={() => onNavigate('cartography')}
              >
                Explorar Lotes en Mapa Satelital
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start text-xs"
                onClick={() => onNavigate('finance')}
              >
                Simulador de Financiamiento y Cuotas
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-bold text-slate-900">Estado del Inventario</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-medium mb-1.5">
                  <span className="text-slate-600">Disponibilidad</span>
                  <span className="text-slate-900 font-bold">
                    {metrics.vendidos} Vendidos · {metrics.reservados} Reservados ·{' '}
                    {metrics.disponibles} Libres
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                  <div
                    style={{
                      width: `${(metrics.vendidos / (metrics.totalLotes || 1)) * 100}%`,
                    }}
                    className="bg-red-500 h-full transition-all duration-300"
                    title="Vendidos"
                  />
                  <div
                    style={{
                      width: `${(metrics.reservados / (metrics.totalLotes || 1)) * 100}%`,
                    }}
                    className="bg-amber-400 h-full transition-all duration-300"
                    title="Reservados"
                  />
                  <div
                    style={{
                      width: `${(metrics.disponibles / (metrics.totalLotes || 1)) * 100}%`,
                    }}
                    className="bg-emerald-500 h-full transition-all duration-300"
                    title="Disponibles"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-2">
                <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-lg">
                  <span className="text-lg font-bold text-emerald-700 block tabular-nums">
                    {metrics.disponibles}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-semibold uppercase">
                    Disponibles
                  </span>
                </div>
                <div className="p-2.5 bg-amber-50 border border-amber-100 rounded-lg">
                  <span className="text-lg font-bold text-amber-700 block tabular-nums">
                    {metrics.reservados}
                  </span>
                  <span className="text-[10px] text-amber-600 font-semibold uppercase">
                    Reservados
                  </span>
                </div>
                <div className="p-2.5 bg-red-50 border border-red-100 rounded-lg">
                  <span className="text-lg font-bold text-red-700 block tabular-nums">{metrics.vendidos}</span>
                  <span className="text-[10px] text-red-600 font-semibold uppercase">
                    Vendidos
                  </span>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
};
