import { BadgePercent, Check, ChevronDown, FileText, Minus, Pencil, Plus, ScanLine, Search, ShoppingCart, X } from "lucide-react";
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
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [discountingId, setDiscountingId] = useState<string | null>(null);
  const [discountPct, setDiscountPct] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountMode, setDiscountMode] = useState<"percent" | "amount">("percent");
  const [applyTax, setApplyTax] = useState(false);
  const [lastSale, setLastSale] = useState<any | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState("");

  const subtotal = total;
  const linePrice = (line: CartLine) => Number(((line.manual_discount_pct ?? 0) > 0
    ? (line.base_price ?? line.sale_price) * (1 - (line.manual_discount_pct ?? 0) / 100)
    : line.sale_price).toFixed(2));
  // Cuanto se ahorra el cliente por productos en oferta (base - precio de venta).
  const offerSavings = cart.reduce(
    (s, l) => s + Math.max(0, (l.manual_discount_pct ? 0 : (l.base_price ?? l.sale_price) - l.sale_price) * l.qty),
    0,
  );
  const lineDiscountSavings = cart.reduce((s, l) => s + (l.manual_discount_pct
    ? Math.max(0, ((l.base_price ?? l.sale_price) - linePrice(l)) * l.qty)
    : 0), 0);
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

  const departments = useMemo(
    () => Array.from(new Set(products.map((p) => p.gender).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "es")),
    [products],
  );
  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "es")),
    [products],
  );
  const brands = useMemo(
    () => Array.from(new Set(products.map((p) => p.brand).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "es")),
    [products],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (departmentFilter && p.gender !== departmentFilter) return false;
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (brandFilter && p.brand !== brandFilter) return false;
      if (!q) return true;
      return [p.name, p.internal_code, p.sku, p.barcode, p.brand, p.size, p.color, p.gender, p.category, p.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [products, query, departmentFilter, categoryFilter, brandFilter]);

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
    setCart(cart.map((item) => (item.id === id ? { ...item, sale_price: Math.max(0, price), manual_discount_pct: 0 } : item)));
  }
  function setLineDiscount(id: string, pct: number) {
    setCart(cart.map((item) => item.id === id ? { ...item, manual_discount_pct: Math.max(0, Math.min(100, pct)) } : item));
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
      <div className="pos-workspace-actions">
        <button className="pos-catalog-trigger" onClick={() => setCatalogOpen(true)}>
          <Search size={18} /> Buscar productos
        </button>
        <button className="pos-scan-button" title="Escanear con cámara" aria-label="Escanear con cámara" onClick={() => setScanning(true)}>
          <ScanLine size={18} />
        </button>
        <span>Busca por nombre, código o escanea el código de barras.</span>
      </div>

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
            <EmptyWork title="Carrito vacío" text="Usa “Buscar productos” o el escáner para agregar prendas a la venta." />
          )}
          {cart.map((line) => (
            <div className="ticket-line" key={line.id}>
              <div className="ticket-info">
                <strong title={line.name}>{line.name}</strong>
                <span className="ticket-variant">{[line.internal_code ?? line.sku, line.size || "Sin talla", line.color || "Sin color"].filter(Boolean).join(" · ")}</span>
                {!line.manual_discount_pct && line.discount_pct > 0 && line.base_price && line.base_price > line.sale_price && (
                  <span className="ticket-offer"><BadgePercent size={12} /> Oferta -{line.discount_pct}%</span>
                )}
                {(line.manual_discount_pct ?? 0) > 0 && <span className="ticket-manual-offer"><BadgePercent size={12} /> Descuento manual -{line.manual_discount_pct}%</span>}
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
                {!lockSeller && (
                  <button className={`line-discount-button ${line.manual_discount_pct ? "active" : ""}`} title="Descuento de esta prenda" aria-label={`Descuento de ${line.name}`} onClick={() => setDiscountingId(discountingId === line.id ? null : line.id)}>
                    <BadgePercent size={15} />
                  </button>
                )}
                <b className="line-total">{lps(line.qty * linePrice(line))}</b>
                <button className="ticket-remove" title={`Quitar ${line.name}`} aria-label={`Quitar ${line.name}`} onClick={() => setCart(cart.filter((item) => item.id !== line.id))}>
                  <X size={16} />
                </button>
              </div>
              {discountingId === line.id && !lockSeller && (
                <div className="line-discount-editor">
                  <span>Descuento de esta prenda</span>
                  <div><b>%</b><input autoFocus type="number" min={0} max={100} value={line.manual_discount_pct ?? 0} onChange={(e) => setLineDiscount(line.id, Number(e.target.value))} /></div>
                  <small>{line.discount_pct > 0 ? "Reemplaza la oferta automática de esta prenda." : "Se aplica solo a esta prenda."}</small>
                </div>
              )}
            </div>
          ))}
        </div>

        <section className="pos-options" aria-label="Datos de cobro">
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
            <div className="pos-compact-control payment-control">
              <span className="pos-control-label">Pago</span>
              <div className="payment-toggle compact-payment" role="group" aria-label="Forma de pago">
                <button type="button" className={terms === "cash" ? "active" : ""} onClick={() => setTerms("cash")}>Contado</button>
                <button type="button" className={terms === "credit" ? "active" : ""} onClick={() => setTerms("credit")}>Crédito</button>
              </div>
            </div>
            {!lockSeller && (
              <div className="discount-control">
                <span className="discount-label">Descuento ticket</span>
                <div className="discount-choice" role="group" aria-label="Tipo de descuento">
                  <button
                    type="button"
                    className={discountMode === "percent" ? "active" : ""}
                    onClick={() => { setDiscountMode("percent"); setDiscountAmount(0); }}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    className={discountMode === "amount" ? "active" : ""}
                    onClick={() => { setDiscountMode("amount"); setDiscountPct(0); }}
                  >
                    L
                  </button>
                </div>
                <label className="discount-input">
                  <div>
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
                    <b>{discountMode === "percent" ? "%" : "L"}</b>
                  </div>
                </label>
              </div>
            )}
            <label className="compact-tax">
              <span>Aplicar ISV 15%</span>
              <input type="checkbox" checked={applyTax} onChange={(e) => setApplyTax(e.target.checked)} />
            </label>
          </div>
        </section>

        <div className="pos-checkout-dock">
          <div className="sale-breakdown">
            <div className="brk-row">
              <span>Subtotal</span>
              <b>{lps(subtotal)}</b>
            </div>
            {offerSavings > 0 && <div className="brk-row saving"><span>Ofertas</span><b>-{lps(offerSavings)}</b></div>}
            {lineDiscountSavings > 0 && <div className="brk-row saving"><span>Desc. prendas</span><b>-{lps(lineDiscountSavings)}</b></div>}
            {discountAmt > 0 && <div className="brk-row saving"><span>Desc. ticket</span><b>-{lps(discountAmt)}</b></div>}
            {tax > 0 && <div className="brk-row"><span>ISV</span><b>{lps(tax)}</b></div>}
            {selectedSeller && (
              <div className="brk-row commission">
                <span>Comisión {Math.round(selectedSeller.commission_rate * 100)}%</span>
                <b>{lps(commission)}</b>
              </div>
            )}
          </div>
          <div className="total-box">
            <span>Total</span>
            <strong>{lps(grandTotal)}</strong>
          </div>
          <button className="primary-button pos-charge-button" disabled={cart.length === 0 || issuing} onClick={() => void submit()}>
            <FileText size={18} /> {issuing ? "Generando..." : "Generar factura"}
          </button>
          <button className="secondary-button pos-clear-button" title="Vaciar carrito" onClick={() => { setCart([]); setLastSale(null); }}>
            <X size={17} /> Limpiar
          </button>
        </div>
        {lastSale && (
          <div className="last-sale-note">
            <strong>✓ Venta #{lastSale.document_number} generada</strong>
            <span>Total L {Number(lastSale.total).toLocaleString("es-HN")}</span>
            <button className="secondary-button wide" onClick={() => printReceipt(lastSale)}>
              <FileText size={16} /> Ver / imprimir comprobante
            </button>
          </div>
        )}
      </aside>

      {catalogOpen && (
        <div className="product-picker-backdrop" role="presentation" onMouseDown={() => setCatalogOpen(false)}>
          <section className="product-picker" role="dialog" aria-modal="true" aria-label="Buscar productos" onMouseDown={(event) => event.stopPropagation()}>
            <header className="product-picker-header">
              <div>
                <span>Catálogo de inventario</span>
                <h2>Buscar y agregar productos</h2>
              </div>
              <button className="ticket-remove" aria-label="Cerrar buscador" title="Cerrar" onClick={() => setCatalogOpen(false)}><X size={18} /></button>
            </header>
            <div className="pos-searchbar product-picker-search">
              <div className="inv-search">
                <Search size={17} />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const found = products.find((p) => matchesCode(p, query));
                      if (found) {
                        if (found.stock > 0) {
                          addToCart(found);
                          setSummaryOpen(true);
                          setScanMessage(`${found.name} agregado al carrito`);
                          setQuery("");
                        } else setScanMessage(`${found.name} no tiene stock disponible`);
                      }
                    }
                  }}
                  placeholder="Nombre, código, departamento, categoría, marca, talla o color"
                />
              </div>
              <button className="pos-scan-button" title="Escanear con cámara" aria-label="Escanear con cámara" onClick={() => { setCatalogOpen(false); setScanning(true); }}>
                <ScanLine size={18} />
              </button>
            </div>
            <div className="product-picker-filters" aria-label="Filtros del catálogo">
              <label className="product-picker-filter">
                <span>Departamento</span>
                <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
                  <option value="">Todos</option>
                  {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
              </label>
              <label className="product-picker-filter">
                <span>Categoría</span>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="">Todas</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label className="product-picker-filter">
                <span>Marca</span>
                <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
                  <option value="">Todas</option>
                  {brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
                </select>
              </label>
              {(departmentFilter || categoryFilter || brandFilter) && (
                <button className="product-filter-clear" type="button" onClick={() => { setDepartmentFilter(""); setCategoryFilter(""); setBrandFilter(""); }}>
                  <X size={15} /> Limpiar filtros
                </button>
              )}
            </div>
            {scanMessage && <div className="pos-scan-feedback"><span>{scanMessage}</span><button onClick={() => setScanMessage("")}>Cerrar</button></div>}
            <div className="product-picker-head">
              <span>Producto</span><span>Departamento</span><span>Categoría</span><span>Marca</span><span>Talla</span><span>Color</span><span>Stock</span><span>Precio</span>
            </div>
            {shown.length === 0 ? <EmptyWork title="Sin productos" text="Prueba con otro dato de búsqueda." /> : (
              <div className="catalog-list product-picker-list">
                {shown.map((product) => (
                  <button key={product.id} onClick={() => addToCart(product)} disabled={product.stock <= 0}>
                    <div><strong>{product.name}</strong><span className="catalog-code">{product.internal_code ?? product.sku}</span></div>
                    <span>{product.gender || "—"}</span><span>{product.category || "—"}</span><span>{product.brand || "—"}</span><span>{product.size || "—"}</span><span>{product.color || "—"}</span>
                    <em className={stockState(product.stock, product.min_stock) !== "ok" ? "stock-alert" : ""}>{product.stock} disp.</em>
                    {product.discount_pct > 0 ? <b className="pos-price-offer"><span className="pos-price-old">{lps(product.sale_price)}</span>{lps(product.price_final)} <span className="pos-offer-tag">-{product.discount_pct}%</span></b> : <b>{lps(product.sale_price)}</b>}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {scanning && <ScannerModal onResult={handleScan} onClose={() => setScanning(false)} />}
    </section>
  );
}
