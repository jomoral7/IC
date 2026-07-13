import { Ban, Minus, Pencil, Plus, Printer, Save, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Product } from "../types";
import { lps, shortDate } from "../lib/format";
import { EmptyWork } from "../ui";

export type InvoiceItem = {
  product_id: string;
  name: string;
  size: string | null;
  category: string | null;
  brand: string | null;
  color: string | null;
  code: string | null;
  qty: number;
  unit_price: number;
  original_price?: number; // precio antes del descuento por oferta
  stock: number; // stock actual disponible del producto
};

function variantText(it: { category: string | null; brand: string | null; size: string | null; color: string | null }): string {
  return [it.category, it.brand, it.size ? `Talla ${it.size}` : null, it.color].filter(Boolean).join(" · ");
}

type Mode = "view" | "edit" | "void";

export function InvoiceDetailModal({
  doc,
  items,
  products,
  onClose,
  commissionInfo,
  onDownload,
  onVoid,
  onSaveEdit,
  readOnly = false,
}: {
  doc: any;
  items: InvoiceItem[];
  products: Product[];
  commissionInfo: { sellerName: string | null; amount: number } | null;
  onClose: () => void;
  onDownload: (doc: any) => Promise<void>;
  onVoid: (doc: any, reason: string) => Promise<void>;
  onSaveEdit: (doc: any, lines: InvoiceItem[]) => Promise<void>;
  /** Si es true (vendedor), solo puede ver e imprimir: sin editar ni anular. */
  readOnly?: boolean;
}) {
  const voided = Boolean(doc.voided_at);
  const [mode, setMode] = useState<Mode>("view");
  const [lines, setLines] = useState<InvoiceItem[]>(items);
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const viewTotal = items.reduce((s, l) => s + l.qty * l.unit_price, 0);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => [p.name, p.internal_code, p.sku].filter(Boolean).join(" ").toLowerCase().includes(q))
      .filter((p) => !lines.some((l) => l.product_id === p.id))
      .slice(0, 6);
  }, [products, query, lines]);

  function addProduct(p: Product) {
    setLines((cur) => [
      ...cur,
      { product_id: p.id, name: p.name, size: p.size, category: p.category, brand: p.brand, color: p.color, code: p.internal_code ?? p.sku, qty: 1, unit_price: p.sale_price, stock: p.stock },
    ]);
    setQuery("");
  }
  function setQty(id: string, qty: number) {
    setLines((cur) => cur.map((l) => (l.product_id === id ? { ...l, qty: Math.max(1, qty) } : l)));
  }
  function setPrice(id: string, price: number) {
    setLines((cur) => cur.map((l) => (l.product_id === id ? { ...l, unit_price: Math.max(0, price) } : l)));
  }
  function removeLine(id: string) {
    setLines((cur) => cur.filter((l) => l.product_id !== id));
  }

  async function saveEdit() {
    if (lines.length === 0 || busy) return;
    setBusy(true);
    await onSaveEdit(doc, lines);
    setBusy(false);
    onClose();
  }
  async function confirmVoid() {
    if (!reason.trim() || busy) return;
    setBusy(true);
    await onVoid(doc, reason.trim());
    setBusy(false);
    onClose();
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="invoice-modal" onClick={(e) => e.stopPropagation()}>
        <div className="invoice-modal-head">
          <div>
            <p className="section-label">Factura #{doc.document_number}</p>
            <h2>{doc.customer_name ?? "Cliente final"}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="invoice-meta">
          <div>
            <span>Cliente</span>
            <strong>{doc.customer_name ?? "Cliente final"}</strong>
          </div>
          <div>
            <span>Fecha</span>
            <strong>{shortDate(doc.created_at)}</strong>
          </div>
          <div>
            <span>Condicion</span>
            <strong>{doc.payment_terms === "cash" ? "Contado" : "Credito"}</strong>
          </div>
          <div>
            <span>Registrada por</span>
            <strong>{doc.created_by_name ?? "—"}</strong>
          </div>
          <div>
            <span>Total facturado</span>
            <strong className="big">{lps(Number(doc.total))}</strong>
          </div>
        </div>

        {voided && <div className="void-banner">Factura ANULADA{doc.void_reason ? ` — ${doc.void_reason}` : ""}</div>}

        {commissionInfo && (
          <div className="internal-box">
            <span className="internal-tag">Uso interno · no se muestra al cliente</span>
            <div className="internal-row">
              <div>
                <span>Vendedor</span>
                <strong>{commissionInfo.sellerName ?? "Sin vendedor"}</strong>
              </div>
              <div>
                <span>Comision (sobre venta sin ISV)</span>
                <strong>{lps(commissionInfo.amount)}</strong>
              </div>
            </div>
          </div>
        )}

        {mode === "view" && (
          <>
            <div className="invoice-items">
              <div className="invoice-items-head">
                <span>Descripcion / codigo</span>
                <span className="center">Cant.</span>
                <span className="right">Subtotal</span>
              </div>
              {items.map((it) => (
                <div className="invoice-item-row" key={it.product_id}>
                  <div>
                    <strong>{it.name}</strong>
                    {variantText(it) && <span className="inv-variant-line">{variantText(it)}</span>}
                    <span className="inv-code">{it.code ?? "N/A"}</span>
                    {it.original_price != null && it.original_price > it.unit_price && (
                      <span className="ticket-offer">
                        Oferta · antes <s>{lps(it.original_price)}</s> → {lps(it.unit_price)}
                      </span>
                    )}
                  </div>
                  <div className="center">{it.qty}</div>
                  <div className="right">{lps(it.qty * it.unit_price)}</div>
                </div>
              ))}
              {(() => {
                const subtotal = Number(doc.subtotal ?? viewTotal);
                const discount = Number(doc.discount ?? 0);
                const tax = Number(doc.tax ?? 0);
                const docTotal = Number(doc.total ?? subtotal);
                return (
                  <>
                    <div className="invoice-brk-row">
                      <span>Subtotal</span>
                      <span>{lps(subtotal)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="invoice-brk-row muted">
                        <span>Descuento</span>
                        <span>- {lps(discount)}</span>
                      </div>
                    )}
                    {tax > 0 && (
                      <div className="invoice-brk-row muted">
                        <span>ISV (15%)</span>
                        <span>{lps(tax)}</span>
                      </div>
                    )}
                    <div className="invoice-total-row">
                      <span>Total facturado</span>
                      <strong>{lps(docTotal)}</strong>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="invoice-actions">
              <button className="secondary-button" onClick={() => void onDownload(doc)}>
                <Printer size={16} /> Imprimir PDF
              </button>
              {!voided && !readOnly && (
                <>
                  <button className="primary-button" onClick={() => { setLines(items); setMode("edit"); }}>
                    <Pencil size={16} /> Editar productos
                  </button>
                  <button className="danger-button" onClick={() => setMode("void")}>
                    <Ban size={16} /> Anular factura
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {mode === "edit" && (
          <>
            <div className="invoice-edit-search">
              <div className="inv-search">
                <Search size={16} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Agregar producto (resta de inventario)" />
              </div>
              {matches.length > 0 && (
                <div className="purchase-suggestions">
                  {matches.map((p) => (
                    <button key={p.id} onClick={() => addProduct(p)}>
                      <strong>{p.name}</strong>
                      <span>{p.internal_code ?? p.sku} · stock {p.stock}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="invoice-edit-lines">
              {lines.length === 0 ? (
                <EmptyWork title="Sin productos" text="Agrega al menos un producto o cancela la edicion." />
              ) : (
                lines.map((l) => (
                  <div className="edit-line" key={l.product_id}>
                    <div className="edit-line-info">
                      <strong>{l.name}</strong>
                      {variantText(l) && <span className="inv-variant-line">{variantText(l)}</span>}
                      <span className="inv-code">{l.code ?? "N/A"}</span>
                    </div>
                    <div className="qty-stepper">
                      <button onClick={() => setQty(l.product_id, l.qty - 1)} disabled={l.qty <= 1}><Minus size={14} /></button>
                      <span>{l.qty}</span>
                      <button onClick={() => setQty(l.product_id, l.qty + 1)}><Plus size={14} /></button>
                    </div>
                    <input
                      className="edit-price"
                      type="number"
                      min={0}
                      value={l.unit_price}
                      onChange={(e) => setPrice(l.product_id, Number(e.target.value))}
                    />
                    <b>{lps(l.qty * l.unit_price)}</b>
                    <button className="ticket-remove" onClick={() => removeLine(l.product_id)}><Trash2 size={15} /></button>
                  </div>
                ))
              )}
            </div>

            <div className="invoice-total-row">
              <span>Nuevo total</span>
              <strong>{lps(total)}</strong>
            </div>
            <div className="invoice-actions">
              <button className="secondary-button" onClick={() => { setLines(items); setMode("view"); }}>Cancelar</button>
              <button className="primary-button" disabled={lines.length === 0 || busy} onClick={() => void saveEdit()}>
                <Save size={16} /> {busy ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </>
        )}

        {mode === "void" && (
          <div className="void-form">
            <p className="void-warn">Al anular se devuelve el stock de los productos al inventario. Esta accion queda registrada.</p>
            <label>
              Motivo de la anulacion
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. cliente devolvio, error de cobro..." rows={3} />
            </label>
            <div className="invoice-actions">
              <button className="secondary-button" onClick={() => setMode("view")}>Volver</button>
              <button className="danger-button" disabled={!reason.trim() || busy} onClick={() => void confirmVoid()}>
                <Ban size={16} /> {busy ? "Anulando..." : "Confirmar anulacion"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
