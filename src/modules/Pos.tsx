import { Check, ChevronDown, FileText, Minus, Pencil, Plus, ScanLine, Search, ShoppingCart, X } from "lucide-react";
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
  lockSeller = false,
  currentSellerId = null,
  printReceipt,
  onOpenDetail,
}: {
  products: Product[];
  cart: CartLine[];
  setCart: (cart: CartLine[]) => void;
  addToCart: (product: Product) => void;
  customers: Party[];
  sellers: Seller[];
  issueSale: (
    customerName: string,
    sellerId: string | null,
    terms: "cash" | "credit",
    discountPct: number,
    discountAmount: number,
    applyTax: boolean,
  ) => Promise<any>;
  total: number;
  /** Si es true (rol vendedor), el vendedor queda fijo y no puede elegir otro. */
  lockSeller?: boolean;
  /** Vendedor vinculado al usuario actual. */
  currentSellerId?: string | null;
  /** Genera el comprobante (PDF cliente) de la venta recien hecha. */
  printReceipt: (doc: any) => void;
  /** Abre el formulario de detalle de la factura recien generada. */
  onOpenDetail: (doc: any) => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [terms, setTerms] = useState<"cash" | "credit">("cash");
  const [issuing, setIssuing] = useState(false);
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [discountPct, setDiscountPct] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountMode, setDiscountMode] = useState<"percent" | "amount">("percent");
  const [applyTax, setApplyTax] = useState(false);
  const [lastSale, setLastSale] = useState<any | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState("");

  const subtotal = total;
  // Cuanto se ahorra el cliente por productos en oferta (base - precio de venta).
  const offerSavings = cart.reduce(
    (s, l) => s + Math.max(0, ((l.base_price ?? l.sale_price) - l.sale_price) * l.qty),
    0,
  );
  const discountAmt = Math.min(
    subtotal,
    Math.max(0, Number((discountAmount > 0 ? discountAmount : subtotal * (discountPct / 100)).toFixed(2))),
  );
  const taxable = subtotal - discountAmt;
  const tax = applyTax ? Number((taxable * 0.15).toFixed(2)) : 0;
  const grandTotal = taxable + tax;

  const activeSellers = useMemo(() => sellers.filter((s) => s.active), [sellers]);
  // Si el usuario es vendedor, su vendedor queda fijo; si no, usa el elegido.
  const effectiveSellerId = lockSeller ? currentSellerId ?? "" : sellerId;
  const selectedSeller = sellers.find((s) => s.id === effectiveSellerId) ?? null;
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
      if (found.stock > 0) {
        addToCart(found);
        setSummaryOpen(true);
        setScanMessage(`${found.name} agregado al carrito`);
      } else {
        setScanMessage(`${found.name} no tiene stock disponible`);
      }
      setQuery("");
    } else {
      setQuery(code);
      setScanMessage(`No encontre producto para: ${code}`);
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
    const doc = await issueSale(customerName.trim(), effectiveSellerId || null, terms, discountPct, discountAmount, applyTax);
    setIssuing(false);
    if (doc) {
      setLastSale(doc);
      // Abre el formulario de detalle de la factura recien generada.
      onOpenDetail(doc);
    }
    setCustomerName("");
    setSellerId("");
    setDiscountPct(0);
    setDiscountAmount(0);
    setDiscountMode("percent");
    setApplyTax(false);
  }

  return (
    <section className="pos-workspace">
      <section className="catalog-panel">
        <div className="pos-searchbar">
          <div className="inv-search">
            <Search size={16} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // El lector USB "escribe" el codigo y manda Enter: agrega el producto solo.
                if (e.key === "Enter") {
                  const code = query.trim();
                  const found = code ? products.find((p) => matchesCode(p, code)) : undefined;
                  if (found) {
                    if (found.stock > 0) {
                      addToCart(found);
                      setSummaryOpen(true);
                      setScanMessage(`${found.name} agregado al carrito`);
                    } else {
                      setScanMessage(`${found.name} no tiene stock disponible`);
                    }
                    setQuery("");
                  }
                }
              }}
              placeholder="Buscar o escanear producto por nombre / codigo"
            />
          </div>
          <button className="secondary-button" onClick={() => setScanning(true)}>
            <ScanLine size={16} /> Escanear (camara)
          </button>
        </div>
        {scanMessage && (
          <div className="pos-scan-feedback">
            <span>{scanMessage}</span>
            <button onClick={() => setScanMessage("")}>Cerrar</button>
          </div>
        )}
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
                {product.discount_pct > 0 ? (
                  <b className="pos-price-offer">
                    <span className="pos-price-old">{lps(product.sale_price)}</span>
                    {lps(product.price_final)} <span className="pos-offer-tag">-{product.discount_pct}%</span>
                  </b>
                ) : (
                  <b>{lps(product.sale_price)}</b>
                )}
              </button>
            ))}
          </div>
        )}
      </section>
      <aside className={`sale-summary ${summaryOpen ? "is-open" : ""}`}>
        <div className="sale-summary-head">
          <button className="sale-summary-toggle" onClick={() => setSummaryOpen((open) => !open)}>
            <span className="summary-title">
              <ShoppingCart size={18} />
              <strong>Resumen de venta</strong>
            </span>
            <span className="summary-total">{lps(grandTotal)}</span>
            <span className="summary-count">{cart.reduce((sum, line) => sum + line.qty, 0)} piezas</span>
            <ChevronDown className="summary-chevron" size={18} />
          </button>
        </div>

        <div className="ticket-list editable">
          {cart.length === 0 && (
            <EmptyWork title="Carrito vacio" text="Selecciona productos del listado para facturar." />
          )}
          {cart.map((line) => (
            <div className="ticket-line" key={line.id}>
              <div className="ticket-info">
                <strong>{line.name}</strong>
                <span>{line.internal_code ?? line.sku}</span>
                {line.discount_pct > 0 && line.base_price && line.base_price > line.sale_price && (
                  <span className="ticket-offer">Oferta -{line.discount_pct}%</span>
                )}
              </div>
              <div className="ticket-controls" aria-label={`Controles para ${line.name}`}>
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
                  {lockSeller ? (
                    // El vendedor NO puede cambiar el precio: solo lo ve.
                    <span className="price-fixed">{lps(line.sale_price)}</span>
                  ) : editingId === line.id ? (
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
              <button className="ticket-remove" title={`Quitar ${line.name}`} aria-label={`Quitar ${line.name}`} onClick={() => setCart(cart.filter((item) => item.id !== line.id))}>
                <X size={16} />
              </button>
            </div>
          ))}
        </div>

        <details className="pos-options">
          <summary>Datos de venta, pago y descuento</summary>
          <div className="pos-options-body">
            <label className="pos-option-field customer-field">
              <span>Cliente</span>
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
            <label className="pos-option-field">
              <span>Vendedor</span>
              {lockSeller ? (
                <input readOnly value={selectedSeller ? selectedSeller.name : "Sin vendedor vinculado"} />
              ) : (
                <select value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
                  <option value="">Sin vendedor</option>
                  {activeSellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({Math.round(s.commission_rate * 100)}%)
                    </option>
                  ))}
                </select>
              )}
            </label>
            <div className="payment-toggle compact-payment">
              <button className={terms === "cash" ? "active" : ""} onClick={() => setTerms("cash")}>Contado</button>
              <button className={terms === "credit" ? "active" : ""} onClick={() => setTerms("credit")}>Crédito</button>
            </div>
            {!lockSeller && (
              <div className="discount-control">
                <span className="discount-label">Descuento adicional</span>
                <div className="discount-choice" role="group" aria-label="Tipo de descuento">
                  <button
                    type="button"
                    className={discountMode === "percent" ? "active" : ""}
                    onClick={() => { setDiscountMode("percent"); setDiscountAmount(0); }}
                  >
                    % Porcentaje
                  </button>
                  <button
                    type="button"
                    className={discountMode === "amount" ? "active" : ""}
                    onClick={() => { setDiscountMode("amount"); setDiscountPct(0); }}
                  >
                    L Monto
                  </button>
                </div>
                <label className="discount-input">
                  <span>{discountMode === "percent" ? "Porcentaje a descontar" : "Monto a descontar"}</span>
                  <div>
                    <b>{discountMode === "percent" ? "%" : "L"}</b>
                    <input
                      type="number"
                      min={0}
                      max={discountMode === "percent" ? 100 : subtotal}
                      value={discountMode === "percent" ? discountPct : discountAmount}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (discountMode === "percent") setDiscountPct(Math.max(0, Math.min(100, value)));
                        else setDiscountAmount(Math.max(0, Math.min(subtotal, value)));
                      }}
                    />
                  </div>
                </label>
              </div>
            )}
            <label className="compact-tax">
              <span>Aplicar ISV 15%</span>
              <input type="checkbox" checked={applyTax} onChange={(e) => setApplyTax(e.target.checked)} />
            </label>
            {selectedSeller && (
              <div className="commission-note">
                Comisión: <strong>{lps(commission)}</strong> · {selectedSeller.name}
              </div>
            )}
          </div>
        </details>

        <div className="sale-breakdown">
          {offerSavings > 0 && (
            <div className="brk-row muted">
              <span>Ahorro por ofertas</span>
              <b>- {lps(offerSavings)}</b>
            </div>
          )}
          <div className="brk-row">
            <span>Subtotal</span>
            <b>{lps(subtotal)}</b>
          </div>
          {discountAmt > 0 && (
            <div className="brk-row muted">
              <span>Descuento extra</span>
              <b>- {lps(discountAmt)}</b>
            </div>
          )}
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
        {lastSale && (
          <div className="last-sale-note">
            <strong>✓ Venta #{lastSale.document_number} generada</strong>
            <span>Total L {Number(lastSale.total).toLocaleString("es-HN")}</span>
            <button className="secondary-button wide" onClick={() => printReceipt(lastSale)}>
              <FileText size={16} /> Ver / imprimir comprobante
            </button>
          </div>
        )}
        <button className="secondary-button wide" onClick={() => { setCart([]); setLastSale(null); }}>
          Limpiar venta
        </button>
      </aside>

      {scanning && <ScannerModal onResult={handleScan} onClose={() => setScanning(false)} />}
    </section>
  );
}
