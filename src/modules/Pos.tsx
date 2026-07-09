import { Check, FileText, Minus, Pencil, Plus, ScanLine, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { CartLine, Party, Product, Seller } from "../types";
import { lps, stockState } from "../lib/format";
import { EmptyWork } from "../ui";
import { ScannerModal } from "./Scanner";

function matchesCode(product: Product, code: string): boolean {
  const c = code.trim().toLowerCase();
  return [product.internal_code, product.sku, product.qr_payload, product.barcode]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase() === c);
}

export function POS({
  products,
  cart,
  setCart,
  addToCart,
  customers,
  sellers,
  issueSale,
  total,
}: {
  products: Product[];
  cart: CartLine[];
  setCart: (cart: CartLine[]) => void;
  addToCart: (product: Product) => void;
  customers: Party[];
  sellers: Seller[];
  issueSale: (customerName: string, sellerId: string | null, terms: "cash" | "credit", discountPct: number, applyTax: boolean) => Promise<void>;
  total: number;
}) {
  const [customerName, setCustomerName] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [terms, setTerms] = useState<"cash" | "credit">("cash");
  const [issuing, setIssuing] = useState(false);
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [discountPct, setDiscountPct] = useState(0);
  const [applyTax, setApplyTax] = useState(false);

  const subtotal = total;
  const discountAmt = Math.max(0, Number((subtotal * (discountPct / 100)).toFixed(2)));
  const taxable = subtotal - discountAmt;
  const tax = applyTax ? Number((taxable * 0.15).toFixed(2)) : 0;
  const grandTotal = taxable + tax;

  const activeSellers = useMemo(() => sellers.filter((s) => s.active), [sellers]);
  const selectedSeller = activeSellers.find((s) => s.id === sellerId) ?? null;
  const commission = selectedSeller ? taxable * selectedSeller.commission_rate : 0;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      [p.name, p.internal_code, p.sku, p.barcode, p.brand, p.size, p.color].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [products, query]);

  // Al escanear: si el codigo coincide con un producto, lo agrega directo al carrito.
  function handleScan(code: string) {
    const found = products.find((p) => matchesCode(p, code));
    if (found) {
      if (found.stock > 0) addToCart(found);
      setQuery("");
    } else {
      setQuery(code);
    }
  }

  function setQty(id: string, qty: number) {
    setCart(cart.map((item) => (item.id === id ? { ...item, qty: Math.max(1, Math.min(qty, item.stock)) } : item)));
  }
  function setPrice(id: string, price: number) {
    setCart(cart.map((item) => (item.id === id ? { ...item, sale_price: Math.max(0, price) } : item)));
  }

  async function submit() {
    if (cart.length === 0 || issuing) return;
    setIssuing(true);
    await issueSale(customerName.trim(), sellerId || null, terms, discountPct, applyTax);
    setIssuing(false);
    setCustomerName("");
    setSellerId("");
    setDiscountPct(0);
    setApplyTax(false);
  }

  return (
    <section className="pos-workspace">
      <section className="catalog-panel">
        <div className="pos-searchbar">
          <div className="inv-search">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar o escanear producto por nombre / codigo" />
          </div>
          <button className="secondary-button" onClick={() => setScanning(true)}>
            <ScanLine size={16} /> Escanear
          </button>
        </div>
        <div className="pos-table-head">
          <span>Producto</span>
          <span>Stock</span>
          <span>Precio</span>
        </div>
        {shown.length === 0 ? (
          <EmptyWork title="Sin productos" text="Crea productos en Inventario o ajusta la busqueda." />
        ) : (
          <div className="catalog-list">
            {shown.map((product) => (
              <button key={product.id} onClick={() => addToCart(product)} disabled={product.stock <= 0}>
                <div>
                  <strong>{product.name}</strong>
                  <span>
                    {product.internal_code ?? product.sku} · {product.size || "Sin talla"} ·{" "}
                    {product.color || "Sin color"}
                  </span>
                </div>
                <em className={stockState(product.stock, product.min_stock) !== "ok" ? "stock-alert" : ""}>
                  {product.stock} disp.
                </em>
                <b>{lps(product.sale_price)}</b>
              </button>
            ))}
          </div>
        )}
      </section>
      <aside className="sale-summary">
        <div className="sale-summary-head">
          <h2>Resumen de venta</h2>
          <span>{cart.length} items</span>
        </div>

        <label>
          Cliente
          <input
            list="dl-customers"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Cliente final o escribe un nombre"
          />
          <datalist id="dl-customers">
            {customers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </label>

        <label>
          Vendedor
          <select value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
            <option value="">Sin vendedor</option>
            {activeSellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({Math.round(s.commission_rate * 100)}%)
              </option>
            ))}
          </select>
        </label>

        <div className="payment-toggle">
          <button className={terms === "cash" ? "active" : ""} onClick={() => setTerms("cash")}>
            Contado
          </button>
          <button className={terms === "credit" ? "active" : ""} onClick={() => setTerms("credit")}>
            Credito
          </button>
        </div>

        <div className="ticket-list editable">
          {cart.length === 0 && (
            <EmptyWork title="Carrito vacio" text="Selecciona productos del listado para facturar." />
          )}
          {cart.map((line) => (
            <div className="ticket-line" key={line.id}>
              <div className="ticket-top">
                <div className="ticket-info">
                  <strong>{line.name}</strong>
                  <span>{line.internal_code ?? line.sku}</span>
                </div>
                <button className="ticket-remove" title="Quitar" onClick={() => setCart(cart.filter((item) => item.id !== line.id))}>
                  <X size={15} />
                </button>
              </div>
              <div className="ticket-controls">
                <div className="qty-stepper">
                  <button onClick={() => setQty(line.id, line.qty - 1)} disabled={line.qty <= 1} aria-label="Menos">
                    <Minus size={14} />
                  </button>
                  <span>{line.qty}</span>
                  <button onClick={() => setQty(line.id, line.qty + 1)} disabled={line.qty >= line.stock} aria-label="Mas">
                    <Plus size={14} />
                  </button>
                </div>
                <div className="price-cell">
                  {editingId === line.id ? (
                    <div className="price-edit-box">
                      <input
                        autoFocus
                        type="number"
                        min={0}
                        value={line.sale_price}
                        onChange={(e) => setPrice(line.id, Number(e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setEditingId(null);
                        }}
                      />
                      <button className="price-ok" title="Listo" onClick={() => setEditingId(null)}>
                        <Check size={15} />
                      </button>
                    </div>
                  ) : (
                    <button className="price-view" title="Editar precio de esta venta" onClick={() => setEditingId(line.id)}>
                      {lps(line.sale_price)} <Pencil size={13} />
                    </button>
                  )}
                </div>
                <b className="line-total">{lps(line.qty * line.sale_price)}</b>
              </div>
            </div>
          ))}
        </div>

        {selectedSeller && (
          <div className="commission-note">
            Comision {selectedSeller.name}: <strong>{lps(commission)}</strong> ({Math.round(selectedSeller.commission_rate * 100)}%)
            <span> · solo interno, no sale en la factura</span>
          </div>
        )}

        <div className="sale-breakdown">
          <div className="brk-row">
            <span>Subtotal</span>
            <b>{lps(subtotal)}</b>
          </div>
          <label className="brk-row brk-input">
            <span>Descuento %</span>
            <input
              type="number"
              min={0}
              max={100}
              value={discountPct}
              onChange={(e) => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value))))}
            />
          </label>
          {discountAmt > 0 && (
            <div className="brk-row muted">
              <span>Descuento</span>
              <b>- {lps(discountAmt)}</b>
            </div>
          )}
          <label className="brk-row brk-toggle">
            <span>ISV 15%</span>
            <input type="checkbox" checked={applyTax} onChange={(e) => setApplyTax(e.target.checked)} />
          </label>
          {tax > 0 && (
            <div className="brk-row muted">
              <span>ISV (15%)</span>
              <b>{lps(tax)}</b>
            </div>
          )}
        </div>
        <div className="total-box">
          <span>Total a pagar</span>
          <strong>{lps(grandTotal)}</strong>
        </div>
        <button className="primary-button wide" disabled={cart.length === 0 || issuing} onClick={() => void submit()}>
          <FileText size={18} /> {issuing ? "Generando..." : "Generar factura"}
        </button>
        <button className="secondary-button wide" onClick={() => setCart([])}>
          Limpiar venta
        </button>
      </aside>

      {scanning && <ScannerModal onResult={handleScan} onClose={() => setScanning(false)} />}
    </section>
  );
}
