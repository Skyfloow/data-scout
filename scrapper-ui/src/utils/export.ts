import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export type CsvCell = string | number | boolean | null | undefined;
export type CsvRow = CsvCell[];

export function downloadCsv(filename: string, rows: CsvRow[]): void {
  const csv = rows
    .map((row) => {
      if (row.length === 0) return '';
      return row
        .map((cell) => {
          const text = cell === null || cell === undefined ? '' : String(cell);
          return `"${text.replace(/"/g, '""')}"`;
        })
        .join(',');
    })
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type SummaryCard = { label: string; value: string | number };
type TableBlock = {
  title?: string;
  headers: string[];
  rows: Array<Array<string | number>>;
};

export type PrintReportOptions = {
  title: string;
  subtitle?: string;
  summaryCards?: SummaryCard[];
  table?: TableBlock;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function openPrintReport(options: PrintReportOptions): void {
  const cardsHtml = (options.summaryCards || [])
    .map(
      (card) =>
        `<div class="card"><b>${escapeHtml(card.label)}:</b> ${escapeHtml(String(card.value))}</div>`
    )
    .join('');

  const tableHeaders = options.table?.headers
    .map((h) => `<th>${escapeHtml(h)}</th>`)
    .join('') || '';

  const tableRows = (options.table?.rows || [])
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join('')}</tr>`)
    .join('');

  const html = `
    <html>
      <head>
        <title>${escapeHtml(options.title)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
          h1 { margin: 0 0 6px 0; }
          .meta { color: #555; margin-bottom: 18px; }
          .grid { display: grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 8px; margin-bottom: 18px; }
          .card { border: 1px solid #ddd; border-radius: 6px; padding: 10px; }
          table { border-collapse: collapse; width: 100%; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #f5f5f5; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(options.title)}</h1>
        <div class="meta">${escapeHtml(options.subtitle || `Generated: ${new Date().toLocaleString()}`)}</div>
        ${cardsHtml ? `<div class="grid">${cardsHtml}</div>` : ''}
        ${options.table ? `<h3>${escapeHtml(options.table.title || 'Table')}</h3>` : ''}
        ${
          options.table
            ? `<table><thead><tr>${tableHeaders}</tr></thead><tbody>${tableRows}</tbody></table>`
            : ''
        }
      </body>
    </html>
  `;

  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.setAttribute('aria-hidden', 'true');

  const cleanup = () => {
    try {
      frame.remove();
    } catch {
      // no-op
    }
  };

  frame.onload = () => {
    const frameWindow = frame.contentWindow;
    if (!frameWindow) {
      cleanup();
      return;
    }

    const cleanupAfterPrint = () => {
      frameWindow.removeEventListener('afterprint', cleanupAfterPrint);
      setTimeout(cleanup, 100);
    };

    frameWindow.addEventListener('afterprint', cleanupAfterPrint);
    setTimeout(() => {
      frameWindow.focus();
      frameWindow.print();
      setTimeout(cleanup, 5000);
    }, 250);
  };

  document.body.appendChild(frame);
  frame.srcdoc = html;
}

export async function exportElementToPdf(
  element: HTMLElement,
  filename: string
): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const gap = 3;
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - margin * 2;

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${Math.max(element.scrollWidth, element.clientWidth)}px`;
  host.style.background = '#fff';
  host.style.zIndex = '-1';

  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.width = `${Math.max(element.scrollWidth, element.clientWidth)}px`;
  clone.style.background = '#fff';
  host.appendChild(clone);
  document.body.appendChild(host);

  // cloneNode does not preserve canvas bitmap content, so copy rendered pixels
  // from the original charts/tables canvases into the clone before html2canvas.
  const sourceCanvases = Array.from(element.querySelectorAll('canvas'));
  const clonedCanvases = Array.from(clone.querySelectorAll('canvas'));
  const canvasPairs = Math.min(sourceCanvases.length, clonedCanvases.length);
  for (let i = 0; i < canvasPairs; i += 1) {
    const src = sourceCanvases[i];
    const dst = clonedCanvases[i];
    try {
      const dstCtx = dst.getContext('2d');
      if (!dstCtx) continue;
      dst.width = src.width;
      dst.height = src.height;
      dst.style.width = src.style.width || `${src.clientWidth}px`;
      dst.style.height = src.style.height || `${src.clientHeight}px`;
      dstCtx.drawImage(src, 0, 0);
    } catch {
      // Skip canvas copy if browser security or context errors occur.
    }
  }

  const cleanup = () => {
    try {
      host.remove();
    } catch {
      // no-op
    }
  };

  try {
    clone.querySelectorAll<HTMLElement>('[data-pdf-exclude]').forEach((n) => n.remove());
    clone.querySelectorAll<HTMLElement>('[data-pdf-expand-scroll]').forEach((n) => {
      n.style.maxHeight = 'none';
      n.style.height = 'auto';
      n.style.overflow = 'visible';
    });
    clone.querySelectorAll<HTMLElement>('.table-head .table-th').forEach((n) => {
      n.style.position = 'static';
      n.style.top = 'auto';
    });
    clone.querySelectorAll<HTMLElement>('[data-pdf-table-controls]').forEach((n) => {
      n.remove();
    });
    clone.querySelectorAll<HTMLElement>('[data-pdf-table]').forEach((container) => {
      const table = container.querySelector('table');
      if (!table) return;

      const thead = table.querySelector('thead');
      const tbody = table.querySelector('tbody');
      if (!tbody) return;

      const rows = Array.from(tbody.querySelectorAll('tr'));
      const rowsPerPage = 12;
      const chunks: HTMLElement[][] = [];
      for (let i = 0; i < rows.length; i += rowsPerPage) {
        chunks.push(rows.slice(i, i + rowsPerPage));
      }

      const replacement = document.createElement('div');
      replacement.style.display = 'block';
      replacement.style.width = '100%';

      chunks.forEach((chunkRows, chunkIdx) => {
        const block = document.createElement('div');
        block.dataset.pdfBlock = 'true';
        block.dataset.pdfFit = 'width';
        if (chunkIdx > 0) block.dataset.pdfNewPage = 'true';
        block.style.width = '100%';
        block.className = 'table-wrap';
        block.style.marginBottom = '20px';
        block.style.overflow = 'visible'; // allow html2canvas to capture full width inside

        if (chunks.length > 1) {
          const title = document.createElement('div');
          title.textContent = `Table Page (${chunkIdx + 1}/${chunks.length})`;
          title.style.fontSize = '13px';
          title.style.fontWeight = '600';
          title.style.marginBottom = '8px';
          title.style.padding = '8px 12px 0';
          title.style.color = 'var(--fg-muted)';
          block.appendChild(title);
        }

        const newTable = document.createElement('table');
        newTable.className = table.className;
        newTable.setAttribute('style', table.getAttribute('style') || '');
        newTable.style.width = '100%';
        newTable.style.minWidth = '0px';

        if (thead) {
          const theadClone = thead.cloneNode(true) as HTMLElement;
          newTable.appendChild(theadClone);
        }

        const newTbody = document.createElement('tbody');
        chunkRows.forEach((tr) => {
          newTbody.appendChild(tr.cloneNode(true));
        });

        newTable.appendChild(newTbody);
        block.appendChild(newTable);
        replacement.appendChild(block);
      });

      container.replaceWith(replacement);
    });

    const blocks = Array.from(clone.querySelectorAll<HTMLElement>('[data-pdf-block]'));
    const topLevelBlocks = blocks.filter((block) => !block.parentElement?.closest('[data-pdf-block]'));
    const blockElements = topLevelBlocks.length > 0 ? topLevelBlocks : [clone];

    const renderBlock = async (block: HTMLElement): Promise<HTMLCanvasElement> =>
      html2canvas(block, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        windowWidth: clone.scrollWidth,
      });

    let cursorY = margin;
    let isFirstBlock = true;

    for (const block of blockElements) {
      const fitMode = block.dataset.pdfFit === 'page' ? 'page' : 'width';
      const forceNewPage = block.dataset.pdfNewPage === 'true';

      if (!isFirstBlock && forceNewPage) {
        pdf.addPage();
        cursorY = margin;
      }

      const canvas = await renderBlock(block);

      if (fitMode === 'page') {
        const widthByPage = contentWidth;
        const heightByWidth = (canvas.height * widthByPage) / canvas.width;
        let renderWidth = widthByPage;
        let renderHeight = heightByWidth;

        if (renderHeight > contentHeight) {
          renderHeight = contentHeight;
          renderWidth = (canvas.width * renderHeight) / canvas.height;
        }

        if (cursorY + renderHeight > pageHeight - margin) {
          pdf.addPage();
          cursorY = margin;
        }

        const x = margin + (contentWidth - renderWidth) / 2;
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, cursorY, renderWidth, renderHeight, undefined, 'FAST');
        cursorY += renderHeight + gap;
      } else {
        const fullHeightByWidth = (canvas.height * contentWidth) / canvas.width;
        let renderWidth = contentWidth;
        let renderHeight = fullHeightByWidth;

        if (renderHeight > contentHeight) {
          renderHeight = contentHeight;
          renderWidth = (canvas.width * renderHeight) / canvas.height;
        }

        if (cursorY + renderHeight > pageHeight - margin) {
          pdf.addPage();
          cursorY = margin;
        }

        const x = margin + (contentWidth - renderWidth) / 2;
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, cursorY, renderWidth, renderHeight, undefined, 'FAST');
        cursorY += renderHeight + gap;
      }

      isFirstBlock = false;
    }
  } finally {
    cleanup();
  }

  pdf.save(filename);
}

import { Product } from '../types';
import { resolveMetricPrice } from './metrics';

export function exportProductsToCsv(products: Product[]): void {
  const rows: Array<Array<string | number>> = [];
  rows.push(['id', 'title', 'marketplace', 'price', 'currency', 'rating', 'reviews', 'discount', 'bsrRank', 'scrapedAt', 'scrapedBy', 'url']);
  for (const row of products) {
    const price = resolveMetricPrice(row.metrics);
    rows.push([
      row.id,
      row.title,
      row.marketplace,
      price,
      row.metrics.currency || 'USD',
      row.metrics.averageRating || '',
      row.metrics.reviewsCount || '',
      row.metrics.discountPercentage || '',
      row.metrics.bsrCategories?.[0]?.rank || '',
      row.scrapedAt,
      row.scrapedBy,
      row.url,
    ]);
  }
  downloadCsv(`products-table-${new Date().toISOString().slice(0, 10)}.csv`, rows);
}
