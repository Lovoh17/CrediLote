/**
 * Imprime solo un documento (recibo, comprobante, estado de cuenta), no la pantalla.
 *
 * Antes se imprimía la página completa ocultando partes con CSS, y en el PDF salían pedazos de la vista detrás del
 * documento. Ahora el documento se copia a un marco aparte, con los mismos estilos de la app, en hoja tamaño carta,
 * y se imprime solo ese marco. El título sugiere el nombre del PDF al "Guardar como PDF" (p. ej. "Recibo SLM-2026-0001").
 */

const ESTILO_HOJA = `
  @page { size: letter; margin: 12mm 14mm; }
  html, body { background: #fff !important; margin: 0; padding: 0; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* El documento ocupa la hoja: sin marco, sombra ni márgenes de pantalla */
  .hoja-documento { box-shadow: none !important; border: 0 !important; border-radius: 0 !important;
    max-width: none !important; width: 100% !important; margin: 0 !important; padding: 0 !important; }
  .solo-pantalla { display: none !important; }
`;

const escaparHtml = (texto: string) =>
  texto.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** Página HTML completa que se imprime: solo el documento, con los estilos de la app y la hoja tamaño carta. */
export function htmlParaImprimir(documentoHtml: string, estilosHtml: string, titulo: string): string {
  return (
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escaparHtml(titulo)}</title>` +
    `${estilosHtml}<style>${ESTILO_HOJA}</style></head><body>${documentoHtml}</body></html>`
  );
}

export function imprimirElemento(elemento: HTMLElement, titulo: string): void {
  const marco = document.createElement('iframe');
  marco.setAttribute('aria-hidden', 'true');
  marco.title = titulo;
  Object.assign(marco.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  document.body.appendChild(marco);

  const doc = marco.contentDocument;
  const ventana = marco.contentWindow;
  if (!doc || !ventana) {
    marco.remove();
    return;
  }

  // Los mismos estilos de la app (Tailwind y fuentes), para que el documento se vea igual que en pantalla
  const estilos = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((nodo) => nodo.outerHTML)
    .join('\n');
  doc.open();
  doc.write(htmlParaImprimir(elemento.outerHTML, estilos, titulo));
  doc.close();

  const tituloOriginal = document.title;
  const imprimir = () => {
    // Chrome toma el nombre del PDF del título de la página principal
    document.title = titulo;
    ventana.focus();
    ventana.print();
    document.title = tituloOriginal;
    setTimeout(() => marco.remove(), 1000);
  };

  // Esperar las hojas de estilo enlazadas y las fuentes antes de imprimir
  const enlaces = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
  const cargas = enlaces.map(
    (l) => new Promise<void>((listo) => (l.sheet ? listo() : ((l.onload = () => listo()), (l.onerror = () => listo()))))
  );
  Promise.all(cargas)
    .then(() => (doc.fonts?.ready ?? Promise.resolve()))
    .then(() => setTimeout(imprimir, 150));
}
