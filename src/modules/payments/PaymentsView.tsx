import React, { useState, useEffect, useRef } from 'react';
import { imprimirElemento } from '@/shared/utils/imprimir';
import { Card, CardHeader, CardBody } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Modal } from '@/shared/components/ui/Modal';
import { FormField } from '@/shared/components/ui/FormField';
import { Input } from '@/shared/components/ui/Input';
import { Select } from '@/shared/components/ui/Select';
import { Textarea } from '@/shared/components/ui/Textarea';
import { DataGrid, Column } from '@/shared/components/ui/DataGrid';
import { DocumentoRecibo } from '@/shared/components/documentos/DocumentoRecibo';
import { storage } from '@/shared/services/storage';
import { ReciboPago, MetodoPago, Cuota } from '@/shared/types';
import { formatCurrency, formatDate, hoyISO } from '@/shared/utils/formatters';
import { Plus, Printer, FileText, Ban, AlertCircle } from 'lucide-react';

export const PaymentsView: React.FC = () => {
  // Recibo que se imprime solo (sin la pantalla detrás)
  const reciboRef = useRef<HTMLDivElement>(null);
  const recibos = storage.getRecibos();
  const cuotasPendientes = storage.getCuotasPendientes();
  const contratos = storage.getContratos();
  const lotes = storage.getLotes();
  const clientes = storage.getClientes();

  // Modals state
  const [isNewPaymentModalOpen, setIsNewPaymentModalOpen] = useState(false);
  const [selectedReciboForPrint, setSelectedReciboForPrint] = useState<ReciboPago | null>(null);
  const [reciboParaAnular, setReciboParaAnular] = useState<ReciboPago | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [errorAnulacion, setErrorAnulacion] = useState<string | null>(null);

  // Form State para nuevo pago
  const [selectedCuotaId, setSelectedCuotaId] = useState<string>(cuotasPendientes[0]?.id || '');
  const [pagoMonto, setPagoMonto] = useState<number>(0);
  const [pagoMetodo, setPagoMetodo] = useState<MetodoPago>('TRANSFERENCIA');
  const [pagoReferencia, setPagoReferencia] = useState<string>('');
  const [pagoFecha, setPagoFecha] = useState<string>(hoyISO());
  const [pagoNotas, setPagoNotas] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Sincronizar monto sugerido usando storage.getPendienteDeCuota(cuotaId)
  const actualizarCuotaSeleccionada = (cuotaId: string) => {
    setSelectedCuotaId(cuotaId);
    setFormError(null);
    if (cuotaId) {
      const pendiente = storage.getPendienteDeCuota(cuotaId);
      setPagoMonto(pendiente);
    }
  };

  useEffect(() => {
    if (cuotasPendientes.length > 0 && !selectedCuotaId) {
      actualizarCuotaSeleccionada(cuotasPendientes[0].id);
    } else if (selectedCuotaId) {
      const pendiente = storage.getPendienteDeCuota(selectedCuotaId);
      setPagoMonto(pendiente);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewPaymentModalOpen]);

  const handleCuotaSelectChange = (cuotaId: string) => {
    actualizarCuotaSeleccionada(cuotaId);
  };

  // Cuota y contrato seleccionados para mostrar saldo de contrato
  const cuotaSeleccionada = cuotasPendientes.find((c) => c.id === selectedCuotaId);
  const contratoSeleccionado = cuotaSeleccionada
    ? contratos.find((item) => item.id === cuotaSeleccionada.contratoId)
    : undefined;
  const saldoPendienteContrato = contratoSeleccionado
    ? storage.getSaldoPendienteContrato(contratoSeleccionado.id)
    : 0;

  const handleRegisterPayment = () => {
    if (!selectedCuotaId || pagoMonto <= 0) {
      setFormError('Indique la cuota y un monto mayor a cero.');
      return;
    }

    const resultado = storage.registrarPagoCuota({
      cuotaId: selectedCuotaId,
      monto: pagoMonto,
      metodo: pagoMetodo,
      referencia: pagoReferencia,
      fechaPago: pagoFecha,
      notas: pagoNotas,
    });

    if (resultado.ok && resultado.valor) {
      setIsNewPaymentModalOpen(false);
      setFormError(null);
      setSelectedReciboForPrint(resultado.valor);
    } else {
      setFormError(resultado.mensaje ?? 'No se pudo registrar el pago.');
    }
  };

  const handleAnularRecibo = () => {
    if (!reciboParaAnular) return;
    if (!motivoAnulacion.trim()) {
      setErrorAnulacion('Indique el motivo de la anulación.');
      return;
    }

    const resultado = storage.anularRecibo(reciboParaAnular.id, motivoAnulacion);
    if (resultado.ok) {
      setReciboParaAnular(null);
      setMotivoAnulacion('');
      setErrorAnulacion(null);
    } else {
      setErrorAnulacion(resultado.mensaje ?? 'No se pudo anular el recibo.');
    }
  };

  const columns: Column<ReciboPago>[] = [
    {
      key: 'folio',
      header: 'Folio Oficial',
      render: (r) => <span className="font-mono font-bold text-slate-900 tabular-nums">{r.folio}</span>,
    },
    {
      key: 'concepto',
      header: 'Concepto',
      render: (r) => (
        <Badge variant={r.concepto === 'PRIMA' ? 'info' : 'neutral'} size="sm">
          {r.concepto === 'PRIMA' ? 'Prima' : 'Cuota'}
        </Badge>
      ),
    },
    {
      key: 'fechaPago',
      header: 'Fecha de Cobro',
      render: (r) => <span className="tabular-nums text-slate-600">{formatDate(r.fechaPago)}</span>,
    },
    {
      key: 'cliente',
      header: 'Titular / Comprador',
      render: (r) => {
        const cliente = clientes.find((c) => c.id === r.clienteId);
        return <span className="font-semibold text-slate-800">{cliente?.nombreCompleto || 'Cliente'}</span>;
      },
    },
    {
      key: 'lote',
      header: 'Lote',
      render: (r) => {
        const contrato = contratos.find((c) => c.id === r.contratoId);
        const lote = lotes.find((l) => l.id === contrato?.loteId);
        return (
          <span className="text-xs bg-slate-100 font-semibold px-2 py-0.5 rounded text-slate-700">
            {lote?.codigoLote || 'L-XX'}
          </span>
        );
      },
    },
    {
      key: 'metodoPago',
      header: 'Método',
      render: (r) => (
        <Badge variant="neutral" size="sm">
          {r.metodoPago}
        </Badge>
      ),
    },
    {
      key: 'montoPagado',
      header: 'Monto Percibido',
      align: 'right',
      render: (r) => (
        <span
          className={`font-bold tabular-nums ${r.anulado ? 'line-through text-slate-400' : 'text-emerald-700'}`}
        >
          {formatCurrency(r.montoPagado)}
        </span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      align: 'center',
      render: (r) => (
        <Badge variant={r.anulado ? 'danger' : 'available'} size="sm" dot>
          {r.anulado ? 'Anulado' : 'Vigente'}
        </Badge>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="xs"
            variant="outline"
            onClick={() => setSelectedReciboForPrint(r)}
            leftIcon={<FileText className="w-3.5 h-3.5" />}
          >
            Ver Recibo
          </Button>

          {!r.anulado && r.concepto !== 'PRIMA' && (
            <Button
              size="xs"
              variant="ghost"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => {
                setReciboParaAnular(r);
                setMotivoAnulacion('');
                setErrorAnulacion(null);
              }}
              title="Anular recibo"
            >
              <Ban className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Historial y Emisión de Recibos</h2>
          <p className="text-xs text-slate-500">
            Trazabilidad completa de cobranza de primas y cuotas, comprobantes oficiales y anulaciones
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => {
            setIsNewPaymentModalOpen(true);
            setFormError(null);
          }}
          leftIcon={<Plus className="w-4 h-4" />}
          disabled={cuotasPendientes.length === 0}
        >
          Registrar Nuevo Pago
        </Button>
      </div>

      {/* Receipts Table */}
      <Card>
        <CardHeader>
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Comprobantes de Pago del Proyecto ({recibos.length})
          </span>
        </CardHeader>
        <CardBody className="p-0">
          <DataGrid
            columns={columns}
            data={recibos}
            keyExtractor={(r) => r.id}
            striped
            emptyMessage="No se han registrado pagos en este proyecto todavía."
          />
        </CardBody>
      </Card>

      {/* Modal: Registro de Nuevo Pago */}
      <Modal
        isOpen={isNewPaymentModalOpen}
        onClose={() => setIsNewPaymentModalOpen(false)}
        title="Registrar Cobro de Cuota"
        description="Seleccione la cuota a liquidar y los datos de la transferencia o pago en efectivo."
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="ghost" size="sm" onClick={() => setIsNewPaymentModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={handleRegisterPayment}>
              Confirmar y Emitir Recibo
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <FormField
            label="Cuota Pendiente a Liquidar"
            required
            helpText={
              contratoSeleccionado
                ? `Saldo total pendiente del contrato: ${formatCurrency(saldoPendienteContrato)}`
                : undefined
            }
          >
            <Select
              size="sm"
              value={selectedCuotaId}
              onChange={(e) => handleCuotaSelectChange(e.target.value)}
            >
              {cuotasPendientes.map((c: Cuota) => {
                const contrato = contratos.find((item) => item.id === c.contratoId);
                const lote = lotes.find((l) => l.id === contrato?.loteId);
                const cliente = clientes.find((cli) => cli.id === contrato?.compradorId);
                const pendiente = storage.getPendienteDeCuota(c.id);

                const etiquetaEstado =
                  c.estado === 'ABONO_PARCIAL'
                    ? `Abono parcial: pagado ${formatCurrency(c.montoPagado || 0)}, falta ${formatCurrency(pendiente)}`
                    : `Vence: ${formatDate(c.fechaVencimiento)}, pendiente ${formatCurrency(pendiente)}`;

                return (
                  <option key={c.id} value={c.id}>
                    {lote?.codigoLote} — Cuota #{c.numeroCuota} ({etiquetaEstado}) — {cliente?.nombreCompleto}
                  </option>
                );
              })}
            </Select>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Monto Recibido ($)"
              required
              helpText="Admite pagos parciales o montos mayores que cubran varias cuotas."
            >
              <Input
                size="sm"
                type="number"
                step="0.01"
                value={pagoMonto || ''}
                onChange={(e) => {
                  setFormError(null);
                  setPagoMonto(parseFloat(e.target.value) || 0);
                }}
                leftAddon="$"
                className="font-bold text-slate-900 tabular-nums"
              />
            </FormField>

            <FormField label="Método de Pago" required>
              <Select
                size="sm"
                value={pagoMetodo}
                onChange={(e) => setPagoMetodo(e.target.value as MetodoPago)}
              >
                <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                <option value="DEPOSITO">Depósito Bancario en Ventanilla</option>
                <option value="EFECTIVO">Efectivo en Oficina</option>
                <option value="CHEQUE">Cheque Certificado</option>
              </Select>
            </FormField>

            <FormField label="Referencia Bancaria / Folio">
              <Input
                size="sm"
                type="text"
                placeholder="ej. BAC-998822"
                value={pagoReferencia}
                onChange={(e) => setPagoReferencia(e.target.value)}
                className="font-mono"
              />
            </FormField>

            <FormField label="Fecha del Pago" required>
              <Input
                size="sm"
                type="date"
                value={pagoFecha}
                onChange={(e) => setPagoFecha(e.target.value)}
              />
            </FormField>
          </div>

          <FormField label="Observaciones Contables (Opcional)">
            <Textarea
              rows={2}
              value={pagoNotas}
              onChange={(e) => setPagoNotas(e.target.value)}
              placeholder="Notas internas sobre la transacción..."
            />
          </FormField>
        </div>
      </Modal>

      {/* Modal: Anular Recibo */}
      <Modal
        isOpen={Boolean(reciboParaAnular)}
        onClose={() => setReciboParaAnular(null)}
        title="Anular Recibo de Cobro"
        description="Esta acción revierte lo aplicado a las cuotas y su reparto. Solo aplica al último cobro vigente del contrato."
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="ghost" size="sm" onClick={() => setReciboParaAnular(null)}>
              Cancelar
            </Button>
            <Button variant="danger" size="sm" onClick={handleAnularRecibo}>
              Confirmar Anulación
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {errorAnulacion && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorAnulacion}</span>
            </div>
          )}

          {reciboParaAnular && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1 text-slate-700">
              <p>
                <strong>Folio:</strong> <span className="font-mono">{reciboParaAnular.folio}</span>
              </p>
              <p>
                <strong>Monto pagado:</strong> {formatCurrency(reciboParaAnular.montoPagado)}
              </p>
              <p>
                <strong>Fecha del cobro:</strong> {formatDate(reciboParaAnular.fechaPago)}
              </p>
            </div>
          )}

          <FormField label="Motivo de la anulación" required helpText="Indique la causa por la que se revierte el recibo.">
            <Textarea
              rows={3}
              value={motivoAnulacion}
              onChange={(e) => {
                setErrorAnulacion(null);
                setMotivoAnulacion(e.target.value);
              }}
              placeholder="ej. Error en monto depositado / Cheque devuelto..."
            />
          </FormField>
        </div>
      </Modal>

      {/* Modal: Vista e Impresión de Recibo Oficial con DocumentoRecibo */}
      <Modal
        isOpen={Boolean(selectedReciboForPrint)}
        onClose={() => setSelectedReciboForPrint(null)}
        size="3xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              Folio: {selectedReciboForPrint?.folio}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedReciboForPrint(null)}>
                Cerrar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  reciboRef.current && imprimirElemento(reciboRef.current, `Recibo ${selectedReciboForPrint?.folio ?? ''}`.trim())
                }
                leftIcon={<Printer className="w-3.5 h-3.5" />}
              >
                Imprimir Documento
              </Button>
            </div>
          </div>
        }
      >
        {selectedReciboForPrint && (() => {
          const doc = storage.getDocumentoRecibo(selectedReciboForPrint.id);
          return doc ? (
            <div className="bg-slate-100 -m-6 p-6">
              <DocumentoRecibo ref={reciboRef} documento={doc} />
            </div>
          ) : (
            <p className="text-xs text-slate-500">No se pudo cargar el documento del recibo.</p>
          );
        })()}
      </Modal>
    </div>
  );
};
