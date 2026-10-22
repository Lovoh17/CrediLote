import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardBody } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { DataGrid, Column } from '@/shared/components/ui/DataGrid';
import { storage } from '@/shared/services/storage';
import { Cuota, SistemaAmortizacion } from '@/shared/types';
import { formatCurrency, formatDate, hoyISO } from '@/shared/utils/formatters';
import {
  generarTablaAmortizacion,
  calcularResumenFinanciero,
} from './engine/amortization';
import { Printer, Calculator } from 'lucide-react';
import { NavigationTab } from '@/app/Sidebar';

interface FinanceViewProps {
  onNavigate: (tab: NavigationTab) => void;
}

export const FinanceView: React.FC<FinanceViewProps> = ({ onNavigate }) => {
  const contratos = storage.getContratos();
  const lotes = storage.getLotes();

  // Mode: 'contract' (ver contrato existente) o 'simulator' (simulador libre)
  const [mode, setMode] = useState<'contract' | 'simulator'>('contract');
  const [selectedContratoId, setSelectedContratoId] = useState<string>(contratos[0]?.id || '');

  // Simulator State
  const [simPrecio, setSimPrecio] = useState<number>(20000);
  const [simPrima, setSimPrima] = useState<number>(4000);
  const [simPlazo, setSimPlazo] = useState<number>(36);
  const [simTasa, setSimTasa] = useState<number>(12.0);
  const [simSistema, setSimSistema] = useState<SistemaAmortizacion>('FRANCES');

  // Obtener cuotas a mostrar
  const { cuotas, resumen, contratoInfo } = useMemo(() => {
    if (mode === 'contract' && selectedContratoId) {
      const c = contratos.find((item) => item.id === selectedContratoId);
      if (c) {
        const storedCuotas = storage.getCuotasByContratoId(c.id);
        const res = calcularResumenFinanciero({
          precioTotal: c.precioPactado,
          prima: c.primaEntregada,
          plazoMeses: c.plazoMeses,
          tasaInteresAnual: c.tasaInteresAnual,
          sistema: c.sistemaAmortizacion,
          fechaInicio: c.fechaFirma,
          diaCortePago: c.diaCortePago,
        });

        const loteAsociado = lotes.find((l) => l.id === c.loteId);
        const clienteAsociado = c.compradorId ? storage.getClienteById(c.compradorId) : undefined;
        const proyectoAsociado = loteAsociado?.proyectoId
          ? storage.getProyectos().find((p) => p.id === loteAsociado.proyectoId)
          : storage.getActiveProyecto();

        return {
          cuotas: storedCuotas,
          resumen: res,
          contratoInfo: {
            proyecto: proyectoAsociado?.nombre || 'CrediLote',
            comprador: clienteAsociado?.nombreCompleto || loteAsociado?.nombreCompradorLabel || 'Comprador Registrado',
            compradorDui: clienteAsociado?.dniIdentificacion || '—',
            lote: loteAsociado?.codigoLote || 'L-XX',
            bloque: loteAsociado?.bloqueManzana || 'Bloque',
            fechaFirma: c.fechaFirma,
            precio: c.precioPactado,
            prima: c.primaEntregada,
            saldoFinanciado: c.saldoFinanciado,
            plazo: c.plazoMeses,
            tasa: c.tasaInteresAnual,
            sistema: c.sistemaAmortizacion,
          },
        };
      }
    }

    // Modo simulador
    const simCuotas = generarTablaAmortizacion({
      precioTotal: simPrecio,
      prima: simPrima,
      plazoMeses: simPlazo,
      tasaInteresAnual: simTasa,
      sistema: simSistema,
      fechaInicio: hoyISO(),
      diaCortePago: 15,
      contratoId: 'sim-preview',
    });

    const simResumen = calcularResumenFinanciero({
      precioTotal: simPrecio,
      prima: simPrima,
      plazoMeses: simPlazo,
      tasaInteresAnual: simTasa,
      sistema: simSistema,
      fechaInicio: hoyISO(),
      diaCortePago: 15,
    });

    const activeProyecto = storage.getActiveProyecto();

    return {
      cuotas: simCuotas,
      resumen: simResumen,
      contratoInfo: {
        proyecto: activeProyecto?.nombre || 'CrediLote - Simulación',
        comprador: 'Prospección / Simulación',
        compradorDui: '—',
        lote: 'Lote Simulado',
        bloque: '—',
        fechaFirma: hoyISO(),
        precio: simPrecio,
        prima: simPrima,
        saldoFinanciado: simPrecio - simPrima,
        plazo: simPlazo,
        tasa: simTasa,
        sistema: simSistema,
      },
    };
  }, [mode, selectedContratoId, contratos, lotes, simPrecio, simPrima, simPlazo, simTasa, simSistema]);

  const handlePrint = () => {
    window.print();
  };

  const columns: Column<Cuota>[] = [
    {
      key: 'numeroCuota',
      header: 'Nº Cuota',
      render: (c) => <span className="font-semibold text-slate-800">Cuota #{c.numeroCuota}</span>,
    },
    {
      key: 'fechaVencimiento',
      header: 'Vencimiento',
      render: (c) => formatDate(c.fechaVencimiento),
    },
    {
      key: 'montoCuota',
      header: 'Cuota Total',
      align: 'right',
      render: (c) => <span className="font-bold text-slate-900 tabular-nums">{formatCurrency(c.montoCuota)}</span>,
    },
    {
      key: 'abonoCapital',
      header: 'Capital',
      align: 'right',
      render: (c) => <span className="text-slate-700 tabular-nums">{formatCurrency(c.abonoCapital)}</span>,
    },
    {
      key: 'abonoInteres',
      header: 'Interés',
      align: 'right',
      render: (c) => (
        <span className="text-slate-500 font-mono text-xs tabular-nums">{formatCurrency(c.abonoInteres)}</span>
      ),
    },
    {
      key: 'saldoInsoluto',
      header: 'Saldo Insoluto',
      align: 'right',
      render: (c) => (
        <span className="font-semibold text-slate-800 tabular-nums">{formatCurrency(c.saldoInsoluto)}</span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      align: 'center',
      render: (c) => <Badge estadoCuota={c.estado} dot />,
    },
    {
      key: 'acciones',
      header: 'Acción',
      align: 'right',
      className: 'print:hidden',
      render: (c) =>
        c.estado === 'PAGADO' ? (
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            {c.reciboId || 'Liquidado'}
          </span>
        ) : (
          <Button size="xs" variant="outline" onClick={() => onNavigate('payments')}>
            Cobrar
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Mode Bar and Contract Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 print:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode('contract')}
            className={`text-xs px-3 py-2 rounded-lg font-medium transition-colors ${
              mode === 'contract'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Contratos Registrados
          </button>
          <button
            onClick={() => setMode('simulator')}
            className={`text-xs px-3 py-2 rounded-lg font-medium transition-colors ${
              mode === 'simulator'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Simulador de Financiamiento
          </button>
        </div>

        {mode === 'contract' && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Seleccionar Contrato:
            </span>
            <select
              value={selectedContratoId}
              onChange={(e) => setSelectedContratoId(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            >
              {contratos.map((c) => {
                const lote = lotes.find((l) => l.id === c.loteId);
                return (
                  <option key={c.id} value={c.id}>
                    {lote?.codigoLote || 'Lote'} - {lote?.nombreCompradorLabel || 'Cliente'} (
                    {formatCurrency(c.precioPactado)})
                  </option>
                );
              })}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} leftIcon={<Printer className="w-4 h-4" />}>
            Imprimir Plan
          </Button>
        </div>
      </div>

      {/* Simulator Sliders (solo visible en modo simulador) */}
      {mode === 'simulator' && (
        <Card className="p-6 bg-slate-900 text-white border-slate-800 print:hidden">
          <div className="flex items-center gap-2 mb-4 text-emerald-400 font-semibold text-xs uppercase tracking-wider">
            <Calculator className="w-4 h-4" />
            <span>Controles del Simulador Dinámico</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-slate-400">Precio Total ($)</span>
                <span className="text-white font-bold">{formatCurrency(simPrecio)}</span>
              </div>
              <input
                type="range"
                min="5000"
                max="50000"
                step="500"
                value={simPrecio}
                onChange={(e) => setSimPrecio(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-slate-400">Prima ($)</span>
                <span className="text-emerald-400 font-bold">{formatCurrency(simPrima)}</span>
              </div>
              <input
                type="range"
                min="500"
                max={simPrecio * 0.8}
                step="500"
                value={simPrima}
                onChange={(e) => setSimPrima(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-slate-400">Plazo (Meses)</span>
                <span className="text-white font-bold">{simPlazo} meses</span>
              </div>
              <input
                type="range"
                min="12"
                max="120"
                step="6"
                value={simPlazo}
                onChange={(e) => setSimPlazo(parseInt(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-slate-400">Tasa Anual (%)</span>
                <span className="text-white font-bold">{simTasa}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="24"
                step="1"
                value={simTasa}
                onChange={(e) => setSimTasa(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">Sistema</label>
              <select
                value={simSistema}
                onChange={(e) => setSimSistema(e.target.value as SistemaAmortizacion)}
                className="w-full text-xs bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none"
              >
                <option value="FRANCES">Francés (Cuota Fija)</option>
                <option value="DIRECTO_SIN_INTERES">Directo (Sin Intereses)</option>
                <option value="ALEMAN">Alemán (Capital Fijo)</option>
              </select>
            </div>
          </div>
        </Card>
      )}

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:hidden">
        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Precio Total
          </span>
          <span className="text-base font-bold text-slate-900 mt-1 block">
            {formatCurrency(resumen.precioTotal)}
          </span>
        </div>

        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block">
            Prima Entregada ({resumen.porcentajePrima.toFixed(1)}%)
          </span>
          <span className="text-base font-bold text-emerald-700 mt-1 block">
            {formatCurrency(resumen.prima)}
          </span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Saldo a Financiar
          </span>
          <span className="text-base font-bold text-slate-900 mt-1 block">
            {formatCurrency(resumen.saldoFinanciar)}
          </span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Cuota Mensual Base
          </span>
          <span className="text-base font-bold text-slate-900 mt-1 block">
            {formatCurrency(resumen.cuotaMensualInicial)}
          </span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Total Intereses
          </span>
          <span className="text-base font-bold text-slate-600 mt-1 block">
            {formatCurrency(resumen.totalIntereses)}
          </span>
        </div>
      </div>

      {/* Contract Detail Header (if in contract mode, for screen) */}
      {contratoInfo && (
        <div className="px-6 py-3.5 bg-slate-900 text-white rounded-xl flex items-center justify-between text-xs print:hidden">
          <div>
            <span className="text-slate-400">Titular del Contrato:</span>{' '}
            <strong className="text-white ml-1">{contratoInfo.comprador}</strong>
          </div>
          <div>
            <span className="text-slate-400">Inmueble:</span>{' '}
            <strong className="text-emerald-400 ml-1">
              {contratoInfo.lote} {contratoInfo.bloque && contratoInfo.bloque !== '—' ? `(${contratoInfo.bloque})` : ''}
            </strong>
          </div>
          <div>
            <span className="text-slate-400">Sistema:</span>{' '}
            <strong className="text-white ml-1">{contratoInfo.sistema}</strong>
          </div>
          <div>
            <span className="text-slate-400">Fecha de Formalización:</span>{' '}
            <strong className="text-white ml-1">{formatDate(contratoInfo.fechaFirma)}</strong>
          </div>
        </div>
      )}

      {/* Encabezado formal exclusivo para impresión (9 datos requeridos) */}
      {contratoInfo && (
        <div className="hidden print:block mb-6 p-6 border border-slate-300 rounded-lg text-slate-800 bg-white">
          <div className="flex justify-between items-start border-b border-slate-200 pb-4 mb-4">
            <div>
              <span className="text-[10px] font-bold tracking-widest text-emerald-800 uppercase block mb-1">
                CrediLote • Sistema de Cartera y Lotificación
              </span>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {contratoInfo.proyecto}
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Tabla Oficial de Amortización y Plan de Pagos
              </p>
            </div>
            <div className="text-right text-xs text-slate-500 space-y-0.5">
              <p><strong className="text-slate-700">Fecha de Formalización:</strong> {formatDate(contratoInfo.fechaFirma)}</p>
              <p><strong className="text-slate-700">Fecha de Emisión:</strong> {formatDate(hoyISO())}</p>
              <p><strong className="text-slate-700">Moneda:</strong> Dólares de los Estados Unidos (USD)</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-y-3 gap-x-6 text-xs">
            <div>
              <span className="text-slate-500 font-medium block">Titular del Contrato:</span>
              <span className="font-bold text-slate-900">{contratoInfo.comprador}</span>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">DUI / Identificación:</span>
              <span className="font-semibold text-slate-800">{contratoInfo.compradorDui}</span>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">Inmueble / Lote:</span>
              <span className="font-bold text-slate-900">
                {contratoInfo.lote} {contratoInfo.bloque && contratoInfo.bloque !== '—' ? `(${contratoInfo.bloque})` : ''}
              </span>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">Precio Pactado:</span>
              <span className="font-semibold text-slate-800 tabular-nums">{formatCurrency(contratoInfo.precio)}</span>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">Prima Entregada:</span>
              <span className="font-semibold text-emerald-700 tabular-nums">
                {formatCurrency(contratoInfo.prima)} ({((contratoInfo.prima / (contratoInfo.precio || 1)) * 100).toFixed(1)}%)
              </span>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">Saldo Financiado:</span>
              <span className="font-bold text-slate-900 tabular-nums">{formatCurrency(contratoInfo.saldoFinanciado)}</span>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">Plazo:</span>
              <span className="font-semibold text-slate-800">{contratoInfo.plazo} meses</span>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">Tasa de Interés Anual:</span>
              <span className="font-semibold text-slate-800">{contratoInfo.tasa}%</span>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">Sistema de Amortización:</span>
              <span className="font-bold text-slate-900">
                {contratoInfo.sistema === 'FRANCES'
                  ? 'Francés (Cuota Fija)'
                  : contratoInfo.sistema === 'ALEMAN'
                  ? 'Alemán (Capital Fijo)'
                  : 'Directo (Sin Intereses)'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Table of Amortization */}
      <Card>
        <CardHeader>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Calendario Mensualizado de Amortización
            </h2>
            <p className="text-xs text-slate-500">
              Desglose detallado de cuotas, amortización a capital y saldos remanentes
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            Total Cuotas: {cuotas.length}
          </span>
        </CardHeader>
        <CardBody className="p-0">
          <DataGrid
            columns={columns}
            data={cuotas}
            keyExtractor={(c) => c.id}
            stickyHeader
            striped
            emptyMessage="No hay cuotas generadas para este contrato."
          />
        </CardBody>
      </Card>
    </div>
  );
};
