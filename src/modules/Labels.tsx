import { Minus, Plus, Printer, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { Product } from "../types";
import { EmptyWork } from "../ui";

type SizeKey = "mediana" | "chica" | "grande";

// Presets en mm para hoja carta (215.9 x 279.4).
const PRESETS: Record<SizeKey, { label: string; qr: number; cellW: number; cellH: number }> = {
  chica: { label: "Chica (~20mm)", qr: 20, cellW: 27, cellH: 30 },
  mediana: { label: "Mediana (~28mm)", qr: 28, cellW: 39, cellH: 42 },
  grande: { label: "Grande (~38mm)", qr: 38, cellW: 48, cellH: 54 },
};

const PAGE_W = 215.9;
const PAGE_H = 279.4;
const MARGIN = 10;

function gridOf(size: SizeKey) {
  const p = PRESETS[size];
  const cols = Math.floor((PAGE_W - 2 * MARGIN) / p.cellW);
  const rows = Math.floor((PAGE_H - 2 * MARGIN) / p.cellH);
  return { cols, rows, perPage: cols * rows };
}

function productVariant(product: Product): string {
  return [product.brand, product.size, product.color, product.gender].filter(Boolean).join(" · ");
}

function labelInfo(product: Product) {
  return {
    payload: product.qr_payload || product.internal_code || product.sku,
    code: product.internal_code || product.sku,
    name: product.name,
    category: product.category || "",
    variant: productVariant(product),
  };
}

export function Labels({ products }: { products: Product[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [size, setSize] = useState<SizeKey>("mediana");
  const [generating, setGenerating] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      [p.name, p.internal_code, p.sku, p.barcode, p.brand, p.category, p.size, p.color, p.gender]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [products, query]);

  function setQty(id: string, qty: number) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (qty <= 0) next.delete(id);
      else next.set(id, qty);
      return next;
    });
  }
  function add(id: string) {
    setSelected((prev) => new Map(prev).set(id, (prev.get(id) ?? 0) + 1));
  }

  const totalLabels = Array.from(selected.values()).reduce((s, n) => s + n, 0);
  const grid = gridOf(size);
  const sheets = Math.ceil(totalLabels / grid.perPage) || 0;

  // Expande la seleccion por cantidad y genera los QR (cache por payload).
  async function buildLabels() {
    const labels: { payload: string; code: string; name: string; category: string; variant: string }[] = [];
    for (const [id, qty] of selected) {
      const p = products.find((x) => x.id === id);
      if (!p) continue;
      const info = labelInfo(p);
      for (let i = 0; i < qty; i++) labels.push(info);
    }
    const cache = new Map<string, string>();
    for (const l of labels) {
      if (!cache.has(l.payload)) cache.set(l.payload, await QRCode.toDataURL(l.payload, { margin: 0, width: 320 }));
    }
    return { labels, cache };
  }

  // Impresion directa: abre el dialogo de impresion sin generar un PDF descargable.
  async function printDirect() {
    if (totalLabels === 0 || generating) return;
    setGenerating(true);
    try {
      const { labels, cache } = await buildLabels();
      const { qr, cellW, cellH } = PRESETS[size];
      const { cols } = grid;
      const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
      const cells = labels
        .map(
          (l) => `<div class="cell">
            <img src="${cache.get(l.payload)}" />
            <div class="code">${esc(l.code)}</div>
            <div class="name">${esc(l.name)}</div>
            <div class="variant">${esc(l.variant || l.category)}</div>
          </div>`,
        )
        .join("");
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title>
        <style>
          @page { size: letter; margin: 10mm; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Arial, sans-serif; }
          .sheet { display: grid; grid-template-columns: repeat(${cols}, ${cellW}mm); justify-content: center; }
          .cell { width: ${cellW}mm; height: ${cellH}mm; display: flex; flex-direction: column; align-items: center;
                  padding-top: 1mm; text-align: center; overflow: hidden; break-inside: avoid; }
          .cell img { width: ${qr}mm; height: ${qr}mm; }
          .code { font-weight: bold; font-size: 8pt; margin-top: .8mm; }
          .name { font-weight: bold; font-size: 5.8pt; line-height: 1.05; max-height: 5.8mm; overflow: hidden; padding: 0 1mm; }
          .variant { font-size: 5.2pt; line-height: 1.05; max-height: 5.6mm; overflow: hidden; color: #425466; padding: 0 1mm; }
        </style></head>
        <body><div class="sheet">${cells}</div></body></html>`;

      // iframe oculto: imprime SIN abrir otra ventana/pestaña.
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);
      const idoc = iframe.contentWindow?.document;
      if (!idoc) {
        document.body.removeChild(iframe);
        return;
      }
      idoc.open();
      idoc.write(html);
      idoc.close();
      // Esperar a que rendericen las imagenes y lanzar el dialogo de impresion.
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 1500);
      }, 350);
    } finally {
      setGenerating(false);
    }
  }

  async function generate(mode: "save" | "print") {
    if (totalLabels === 0 || generating) return;
    setGenerating(true);
    try {
      // Expandir por cantidad.
      const labels: { payload: string; code: string; name: string; category: string; variant: string }[] = [];
      for (const [id, qty] of selected) {
        const p = products.find((x) => x.id === id);
        if (!p) continue;
        const info = labelInfo(p);
        for (let i = 0; i < qty; i++) labels.push(info);
      }
      // Generar QR unicos (cache por payload).
      const cache = new Map<string, string>();
      for (const l of labels) {
        if (!cache.has(l.payload)) cache.set(l.payload, await QRCode.toDataURL(l.payload, { margin: 0, width: 320 }));
      }

      const pdf = new jsPDF({ unit: "mm", format: "letter" });
      const { qr, cellW, cellH } = PRESETS[size];
      const { cols, rows, perPage } = grid;
      // Centrar la cuadricula: margenes iguales a los 4 lados (evita cortes al imprimir).
      const offsetX = (PAGE_W - cols * cellW) / 2;
      const offsetY = (PAGE_H - rows * cellH) / 2;

      labels.forEach((l, idx) => {
        const onPage = idx % perPage;
        if (idx > 0 && onPage === 0) pdf.addPage();
        const col = onPage % cols;
        const row = Math.floor(onPage / cols);
        const x = offsetX + col * cellW;
        const y = offsetY + row * cellH;
        const qrX = x + (cellW - qr) / 2;
        const cx = x + cellW / 2;
        pdf.addImage(cache.get(l.payload)!, "PNG", qrX, y, qr, qr);
        pdf.setTextColor("#0B2533");
        // Codigo interno
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7);
        pdf.text(l.code, cx, y + qr + 3.5, { align: "center" });
        // Nombre y variante: se acomodan compactos para que la etiqueta identifique talla/color.
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(size === "chica" ? 4.8 : 5.4);
        const nameLines = (pdf.splitTextToSize(l.name, cellW - 3) as string[]).slice(0, size === "chica" ? 1 : 2);
        let ty = y + qr + 7.5;
        for (const line of nameLines) {
          pdf.text(line, cx, ty, { align: "center" });
          ty += size === "chica" ? 2.6 : 3;
        }
        const variantLines = (pdf.splitTextToSize(l.variant || l.category, cellW - 3) as string[]).slice(0, size === "chica" ? 1 : 2);
        pdf.setTextColor("#425466");
        pdf.setFontSize(size === "chica" ? 4.2 : 4.8);
        for (const line of variantLines) {
          pdf.text(line, cx, ty, { align: "center" });
          ty += 2.5;
        }
      });
      if (mode === "print") {
        // Abre el visor con el dialogo de impresion listo.
        pdf.autoPrint();
        const url = pdf.output("bloburl");
        const win = window.open(url, "_blank");
        if (!win) {
          // Si el navegador bloquea la ventana, cae a descarga.
          pdf.save("etiquetas-qr.pdf");
        }
      } else {
        pdf.save("etiquetas-qr.pdf");
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="labels-workspace">
      <section className="panel labels-catalog">
        <div className="panel-heading">
          <div>
            <p className="section-label">Impresion</p>
            <h2>Etiquetas QR</h2>
          </div>
        </div>
        <div className="inv-search" style={{ marginBottom: 12 }}>
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto por nombre o codigo" />
        </div>
        {shown.length === 0 ? (
          <EmptyWork title="Sin productos" text="Crea productos en Inventario para imprimir sus etiquetas." />
        ) : (
          <div className="labels-list">
            {shown.map((p) => (
              <button key={p.id} className="labels-item" onClick={() => add(p.id)}>
                <div>
                  <strong>{p.name}</strong>
                  <span className="labels-code">{p.internal_code ?? p.sku}</span>
                  <span className="labels-meta">
                    {[p.category, p.brand, p.size, p.color, p.gender].filter(Boolean).join(" · ") || "Sin variante"}
                  </span>
                </div>
                <Plus size={16} />
              </button>
            ))}
          </div>
        )}
      </section>

      <aside className="panel labels-selection">
        <div className="panel-heading">
          <div>
            <p className="section-label">Seleccion</p>
            <h2>Para imprimir</h2>
          </div>
        </div>

        <label className="labels-size">
          Tamano de etiqueta
          <select value={size} onChange={(e) => setSize(e.target.value as SizeKey)}>
            {(Object.keys(PRESETS) as SizeKey[]).map((k) => (
              <option key={k} value={k}>
                {PRESETS[k].label} · {gridOf(k).perPage} por hoja
              </option>
            ))}
          </select>
        </label>

        {selected.size === 0 ? (
          <EmptyWork title="Nada seleccionado" text="Toca un producto de la izquierda para agregarlo." />
        ) : (
          <div className="labels-selected">
            {Array.from(selected.entries()).map(([id, qty]) => {
              const p = products.find((x) => x.id === id);
              if (!p) return null;
              return (
                <div className="labels-sel-row" key={id}>
                  <div className="labels-sel-info">
                    <strong>{p.name}</strong>
                    <span className="labels-code">{p.internal_code ?? p.sku}</span>
                    <span className="labels-meta">{[p.brand, p.size, p.color].filter(Boolean).join(" · ") || p.category}</span>
                  </div>
                  <div className="qty-stepper">
                    <button onClick={() => setQty(id, qty - 1)} aria-label="Menos">
                      <Minus size={14} />
                    </button>
                    <span>{qty}</span>
                    <button onClick={() => setQty(id, qty + 1)} aria-label="Mas">
                      <Plus size={14} />
                    </button>
                  </div>
                  <button className="ticket-remove" title="Quitar" onClick={() => setQty(id, 0)}>
                    <X size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="labels-summary">
          <span>
            {totalLabels} etiqueta(s) → {sheets} hoja(s) carta <em>(caben {grid.perPage} por hoja)</em>
          </span>
        </div>
        <p className="mini-note" style={{ marginBottom: 10 }}>
          Al imprimir, elige <b>Tamaño real / 100%</b> (no "Ajustar a la página") y hoja <b>Carta</b>, para que los QR no
          salgan cortados ni deformados.
        </p>
        <button className="primary-button wide" disabled={totalLabels === 0 || generating} onClick={() => void printDirect()}>
          <Printer size={18} /> {generating ? "Preparando..." : "Imprimir"}
        </button>
        <button className="secondary-button wide" disabled={totalLabels === 0 || generating} onClick={() => void generate("save")}>
          Descargar PDF
        </button>
      </aside>
    </section>
  );
}
