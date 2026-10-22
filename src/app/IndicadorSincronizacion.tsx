import React, { useEffect, useState } from 'react';
import { Cloud, CloudOff, Loader2, RefreshCw, X } from 'lucide-react';
import { storage } from '@/shared/services/storage';

/**
 * Estado de la copia en la nube (ADR-013): sincronizando, guardado en Neon o trabajando sin conexión.
 * La app se vuelve a dibujar sola cuando cambia (storage.subscribe en App.tsx).
 */
export const IndicadorSincronizacion: React.FC = () => {
  const sync = storage.getEstadoSincronizacion();
  const [avisoDescartado, setAvisoDescartado] = useState<string | null>(null);

  // El aviso flotante se cierra solo a los 10 s para no tapar botones; el texto sigue en el indicador
  useEffect(() => {
    if (!sync.mensaje) return;
    const temporizador = setTimeout(() => setAvisoDescartado(sync.mensaje ?? null), 10_000);
    return () => clearTimeout(temporizador);
  }, [sync.mensaje]);

  const hora = sync.ultimoGuardado
    ? new Date(sync.ultimoGuardado).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })
    : null;
  const sincronizando = sync.modo === 'iniciando' || (sync.modo === 'nube' && sync.pendiente);

  let contenido: React.ReactNode;
  if (sincronizando) {
    contenido = (
      <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="hidden md:inline">Sincronizando…</span>
      </span>
    );
  } else if (sync.modo === 'nube') {
    contenido = (
      <span
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800"
        title={hora ? `Último guardado: ${hora} (versión ${sync.version})` : `Versión ${sync.version}`}
      >
        <Cloud className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Guardado en la nube</span>
      </span>
    );
  } else {
    contenido = (
      <span
        className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-800"
        title={sync.mensaje}
      >
        <CloudOff className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden md:inline">Sin conexión: cambios guardados en este equipo</span>
        <button
          onClick={() => storage.forzarSincronizacion()}
          className="ml-1 flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-amber-100 font-semibold"
          title="Volver a intentar guardar en la nube"
        >
          <RefreshCw className="w-3 h-3" />
          Reintentar
        </button>
      </span>
    );
  }

  return (
    <>
      <div className="flex items-center text-[11px] font-medium">{contenido}</div>
      {sync.mensaje && sync.mensaje !== avisoDescartado && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm p-3 pr-9 rounded-lg border border-amber-300 bg-amber-50 text-xs text-amber-900 shadow-lg print:hidden">
          {sync.mensaje}
          <button
            onClick={() => setAvisoDescartado(sync.mensaje ?? null)}
            className="absolute top-2 right-2 p-1 rounded hover:bg-amber-100"
            aria-label="Cerrar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
};
