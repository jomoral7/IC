import {
  AlertTriangle,
  Edit3,
  PackagePlus,
  Plus,
  RotateCcw,
  Save,
  ScanLine,
  Search,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { AdjustmentDraft, Party, Product, ProductForm, PurchaseLine } from "../types";
import { ADJUSTMENT_REASONS, CATEGORY_OPTIONS, COLOR_OPTIONS, GENDERS, emptyProduct, sizesForCategory } from "../types";
import { lps, shortDate, stockState, suggestedRestock } from "../lib/format";
import { Combobox, EmptyWork } from "../ui";
import { ScannerModal } from "./Scanner";

type Filter = "all" | "low" | "orders";

/** Une el catalogo precargado con los valores ya existentes, sin duplicados. */
function mergeOptions(catalog: string[], existing: string[]): string[] {
  const extra = existing.filter((v) => !catalog.includes(v));
  return [...catalog, ...extra];
}

export function Inventory({
  products,
  suppliers,
  categories,
  brands,
  sizes,
  colors,
  saveProduct,
  deleteProduct,
  registerAdjustment,
  registerPurchase,
  createOrder,
  stockRequests,
  receiveOrder,
  receiveOrderQty,
  cancelOrder,
}: {
  products: Product[];
  suppliers: Party[];
  categories: string[];
  brands: string[];
  sizes: string[];
  colors: string[];
  saveProduct: (form: ProductForm, id?: string) => Promise<void>;
  deleteProduct: (product: Product) => Promise<void>;
  registerAdjustment: (productId: string, quantityDelta: number, reason: string, notes: string) => Promise<void>;
  registerPurchase: (supplierId: string | null, lines: PurchaseLine[]) => Promise<void>;
  createOrder: (product: Product, quantity: number, supplierId: string | null) => Promise<void>;
  stockRequests: any[];
  receiveOrder: (request: any) => Promise<void>;
  receiveOrderQty: (request: any, arrivedQty: number, unitCost: number) => Promise<void>;
  cancelOrder: (request: any) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [localQuery, setLocalQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [pedido, setPedido] = useState<Product | null>(null);

  const searched = useMemo(() => {
    const q = localQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) =>
      [product.name, product.internal_code, product.sku, product.brand, product.category, product.size, product.color]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [products, localQuery]);

  const visible = filter === "low" ? searched.filter((p) => stockState(p.stock, p.min_stock) !== "ok") : searched;

  const units = products.reduce((sum, product) => sum + product.stock, 0);
  const lowCount = products.filter((p) => stockState(p.stock, p.min_stock) !== "ok").length;
  const inventoryCost = products.reduce((sum, p) => sum + p.stock * p.real_cost, 0);
  const inventorySale = products.reduce((sum, p) => sum + p.stock * p.sale_price, 0);

  return (
    <>
      <section className="inv-summary">
        <div className="inv-stat">
          <span>Referencias</span>
          <strong>{products.length}</strong>
        </div>
        <div className="inv-stat">
          <span>Unidades en stock</span>
          <strong>{units}</strong>
        </div>
        <div className={`inv-stat ${lowCount ? "is-warning" : ""}`}>
          <span>Stock bajo</span>
          <strong>{lowCount}</strong>
        </div>
        <div className="inv-stat">
          <span>Valor inventario (costo)</span>
          <strong>{lps(inventoryCost)}</strong>
        </div>
        <div className="inv-stat">
          <span>Valor inventario (venta)</span>
          <strong>{lps(inventorySale)}</strong>
        </div>
      </section>

      <section className="panel full-panel">
        <div className="inv-toolbar">
          <div className="inv-search">
            <Search size={16} />
            <input
              value={localQuery}
              onChange={(event) => setLocalQuery(event.target.value)}
              placeholder="Buscar por nombre, codigo, marca, talla o color"
            />
          </div>
          <div className="inv-filters">
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
              Todos
            </button>
            <button className={filter === "low" ? "active" : ""} onClick={() => setFilter("low")}>
              <AlertTriangle size={15} /> Stock bajo{lowCount ? ` (${lowCount})` : ""}
            </button>
            <button className={filter === "orders" ? "active" : ""} onClick={() => setFilter("orders")}>
              <Truck size={15} /> Pedidos{stockRequests.length ? ` (${stockRequests.length})` : ""}
            </button>
          </div>
          <div className="inv-actions">
            <button className="secondary-button" onClick={() => setScanning(true)}>
              <ScanLine size={16} /> Escanear
            </button>
            <button className="secondary-button" onClick={() => setPurchasing(true)}>
              <Truck size={16} /> Entrada de pedido
            </button>
            <button className="primary-button" onClick={() => setCreating(true)}>
              <Plus size={16} /> Nuevo producto
            </button>
          </div>
        </div>

        {filter === "orders" ? (
          <OrdersView
            requests={stockRequests}
            products={products}
            suppliers={suppliers}
            onReceive={receiveOrder}
            onCancel={cancelOrder}
          />
        ) : visible.length === 0 ? (
          <EmptyWork
            title={filter === "low" ? "Sin productos bajo minimo" : "No hay productos"}
            text={
              filter === "low"
                ? "Cuando un producto llegue a su minimo aparecera aqui."
                : "Agrega el primer producto con costo real, precio de venta, minimo y stock inicial."
            }
          />
        ) : (
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoria / variante</th>
                  <th className="num">Stock</th>
                  <th className="num">Min.</th>
                  <th className="num">Costo</th>
                  <th className="num">Venta</th>
                  <th className="num">Ganancia</th>
                  <th className="center">Estado</th>
                  <th className="actions-col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    onEdit={() => setEditing(product)}
                    onAdjust={() => setAdjusting(product)}
                    onPedido={() => setPedido(product)}
                    onDelete={() => void deleteProduct(product)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(creating || editing) && (
        <ProductDrawer
          product={editing}
          suppliers={suppliers}
          categories={categories}
          brands={brands}
          sizes={sizes}
          colors={colors}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={saveProduct}
        />
      )}
      {adjusting && (
        <AdjustmentModal
          product={adjusting}
          onClose={() => setAdjusting(null)}
          onSave={(draft) => registerAdjustment(draft.product.id, draft.quantity, draft.reason, draft.notes)}
        />
      )}
            {scanning && (
        <ScannerModal onResult={(code) => setLocalQuery(code)} onClose={() => setScanning(false)} />
      )}
      {pedido && (
        <PedidoModal
          product={pedido}
          suppliers={suppliers}
          requests={stockRequests.filter((r) => r.product_id === pedido.id)}
          onClose={() => setPedido(null)}
          onOrder={(supplierId, qty) => createOrder(pedido, qty, supplierId)}
          onReceiveManual={(supplierId, qty, unitCost) => registerPurchase(supplierId, [{ product: pedido, qty, unit_cost: unitCost }])}
          onReceiveOrder={receiveOrderQty}
          onCancelOrder={cancelOrder}
        />
      )}
      {purchasing && (
        <PurchaseModal
          products={products}
          suppliers={suppliers}
          onClose={() => setPurchasing(false)}
          onSave={registerPurchase}
        />
      )}
    </>
  );
}

function ProductRow({
  product,
  onEdit,
  onAdjust,
  onPedido,
  onDelete,
}: {
  product: Product;
  onEdit: () => void;
  onAdjust: () => void;
  onPedido: () => void;
  onDelete: () => void;
}) {
  const state = stockState(product.stock, product.min_stock);
  const stateLabel = state === "out" ? "Agotado" : state === "low" ? "Stock bajo" : "En stock";
  const variant = [product.brand, product.size, product.color, product.gender].filter(Boolean).join(" · ");
  const profit = product.sale_price - product.real_cost;
  const profitPct = product.real_cost > 0 ? Math.round((profit / product.real_cost) * 100) : 0;
  return (
    <tr>
      <td>
        <strong>{product.name}</strong>
        <span className="inv-code">{product.internal_code ?? product.sku}</span>
      </td>
      <td>
        <strong className="inv-cat">{product.category || "Sin categoria"}</strong>
        <span className="inv-code">{variant || "Sin variante"}</span>
      </td>
      <td className={`num ${state !== "ok" ? "stock-alert" : ""}`}>
        <strong>{product.stock}</strong>
        {product.incoming > 0 && <span className="incoming-tag">+{product.incoming} en camino</span>}
      </td>
      <td className="num muted">{product.min_stock}</td>
      <td className="num muted">{lps(product.real_cost)}</td>
      <td className="num">{lps(product.sale_price)}</td>
      <td className="num">
        <strong className={profit >= 0 ? "profit-pos" : "profit-neg"}>{lps(profit)}</strong>
        {product.real_cost > 0 && <span className="inv-code">{profitPct}%</span>}
      </td>
      <td className="center">
        <span className={`stock-badge ${state}`}>{stateLabel}</span>
      </td>
      <td className="actions-col">
        <div className="row-actions">
          <button title="Editar" onClick={onEdit}>
            <Edit3 size={15} />
          </button>
          <button title="Ajustar stock" onClick={onAdjust}>
            <RotateCcw size={15} />
          </button>
          <button title="Pedido (pedir o recibir)" onClick={onPedido}>
            <Truck size={15} />
          </button>
          <button title="Eliminar" className="danger" onClick={onDelete}>
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function PedidoModal({
  product,
  suppliers,
  requests,
  onClose,
  onOrder,
  onReceiveManual,
  onReceiveOrder,
  onCancelOrder,
}: {
  product: Product;
  suppliers: Party[];
  requests: any[];
  onClose: () => void;
  onOrder: (supplierId: string | null, quantity: number) => Promise<void>;
  onReceiveManual: (supplierId: string | null, quantity: number, unitCost: number) => Promise<void>;
  onReceiveOrder: (request: any, arrivedQty: number, unitCost: number) => Promise<void>;
  onCancelOrder: (request: any) => Promise<void>;
}) {
  const [tab, setTab] = useState<"order" | "receive">("order");
  const [qty, setQty] = useState(suggestedRestock(product.stock, product.min_stock));
  const [supplierId, setSupplierId] = useState(product.supplier_id ?? "");
  const [unitCost, setUnitCost] = useState(product.real_cost);
  const [saving, setSaving] = useState(false);
  // Recibir: pedido seleccionado ("manual" = entrada sin pedido)
  const [selected, setSelected] = useState<string>(requests[0]?.id ?? "manual");
  const [arrived, setArrived] = useState<number>(requests[0]?.requested_quantity ?? qty);
  const order = requests.find((r) => r.id === selected) ?? null;

  async function submitOrder() {
    if (qty <= 0 || saving) return;
    setSaving(true);
    await onOrder(supplierId || null, qty);
    setSaving(false);
    onClose();
  }
  async function submitReceive() {
    if (arrived <= 0 || saving) return;
    setSaving(true);
    if (order) await onReceiveOrder(order, arrived, unitCost);
    else await onReceiveManual(supplierId || null, arrived, unitCost);
    setSaving(false);
    onClose();
  }
  function pickOrder(id: string) {
    setSelected(id);
    const r = requests.find((x) => x.id === id);
    setArrived(r ? r.requested_quantity : suggestedRestock(product.stock, product.min_stock));
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="qr-modal adjustment-modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-button modal-close" onClick={onClose}>
          <X size={18} />
        </button>
        <p className="section-label">Pedido de mercaderia</p>
        <h2>{product.name}</h2>
        <p className="adj-current">
          Stock actual: <strong>{product.stock}</strong>
          {product.incoming > 0 ? ` · En camino: ${product.incoming}` : ""}
        </p>

        <div className="payment-toggle adj-toggle">
          <button className={tab === "order" ? "active" : ""} onClick={() => setTab("order")}>
            Pedir
          </button>
          <button className={tab === "receive" ? "active" : ""} onClick={() => setTab("receive")}>
            Recibir
          </button>
        </div>

        {tab === "order" && (
          <>
            <p className="mini-note">Registra un pedido al proveedor. No suma stock: queda en camino hasta recibirlo.</p>
            <div className="form-grid one">
              <label>
                Proveedor
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Sin proveedor</option>
                  {suppliers.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cantidad a pedir
                <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
              </label>
            </div>
            <p className="adj-result">
              Quedaran <strong>{product.incoming + Math.max(0, qty)}</strong> unidades en camino
            </p>
            <button className="primary-button wide" disabled={qty <= 0 || saving} onClick={() => void submitOrder()}>
              <Truck size={18} /> {saving ? "Registrando..." : "Registrar pedido"}
            </button>
          </>
        )}

        {tab === "receive" && (
          <>
            <label className="rcv-label">
              Pedido a recibir
              <select value={selected} onChange={(e) => pickOrder(e.target.value)}>
                {requests.map((r) => (
                  <option key={r.id} value={r.id}>
                    Pedido de {r.requested_quantity} uds
                  </option>
                ))}
                <option value="manual">Entrada manual (sin pedido)</option>
              </select>
            </label>

            <div className="form-grid one">
              {order && (
                <label>
                  Cantidad que se pidio
                  <input type="number" value={order.requested_quantity} readOnly />
                </label>
              )}
              {!order && (
                <label>
                  Proveedor
                  <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                    <option value="">Sin proveedor</option>
                    {suppliers.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Cantidad que llego
                <input type="number" min={1} value={arrived} onChange={(e) => setArrived(Number(e.target.value))} />
              </label>
              <label>
                Costo unitario
                <input type="number" min={0} value={unitCost} onChange={(e) => setUnitCost(Number(e.target.value))} />
              </label>
            </div>
            <p className="adj-result">
              Nuevo stock: <strong>{product.stock + Math.max(0, arrived)}</strong> · Total: <strong>{lps(arrived * unitCost)}</strong>
            </p>
            <button className="primary-button wide" disabled={arrived <= 0 || saving} onClick={() => void submitReceive()}>
              <PackagePlus size={18} /> {saving ? "Registrando..." : "Registrar entrada"}
            </button>
            {order && (
              <button
                className="danger-button wide"
                style={{ marginTop: 8, width: "100%", justifyContent: "center" }}
                onClick={() => void onCancelOrder(order).then(onClose)}
              >
                <X size={16} /> Cancelar este pedido
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function OrdersView({
  requests,
  products,
  suppliers,
  onReceive,
  onCancel,
}: {
  requests: any[];
  products: Product[];
  suppliers: Party[];
  onReceive: (request: any) => Promise<void>;
  onCancel: (request: any) => Promise<void>;
}) {
  if (requests.length === 0) {
    return <EmptyWork title="Sin pedidos en camino" text="Usa la accion Pedir en un producto para registrar un pedido al proveedor." />;
  }
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? "Producto";
  const supOf = (id: string | null) => suppliers.find((sp) => sp.id === id)?.name ?? "Sin proveedor";
  return (
    <div className="inv-table-wrap">
      <table className="inv-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Proveedor</th>
            <th className="num">Cantidad</th>
            <th>Fecha</th>
            <th className="actions-col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td>
                <strong>{nameOf(r.product_id)}</strong>
              </td>
              <td className="muted">{supOf(r.supplier_id ?? null)}</td>
              <td className="num">
                <strong>{r.requested_quantity}</strong>
              </td>
              <td className="muted">{shortDate(r.created_at)}</td>
              <td className="actions-col">
                <div className="row-actions">
                  <button className="mini-button" title="Recibir (suma stock)" onClick={() => void onReceive(r)}>
                    <PackagePlus size={14} /> Recibir
                  </button>
                  <button className="mini-button danger" title="Cancelar pedido" onClick={() => void onCancel(r)}>
                    <X size={14} /> Cancelar
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductDrawer({
  product,
  suppliers,
  categories,
  brands,
  sizes,
  colors,
  onClose,
  onSave,
}: {
  product: Product | null;
  suppliers: Party[];
  categories: string[];
  brands: string[];
  sizes: string[];
  colors: string[];
  onClose: () => void;
  onSave: (form: ProductForm, id?: string) => Promise<void>;
}) {
  const categoryOptions = mergeOptions(CATEGORY_OPTIONS, categories);
  const colorOptions = mergeOptions(COLOR_OPTIONS, colors);
  const [form, setForm] = useState<ProductForm>(
    product
      ? {
          sku: product.sku,
          name: product.name,
          category: product.category,
          barcode: product.barcode,
          min_stock: product.min_stock,
          cost: product.cost,
          price: product.price,
          real_cost: product.real_cost,
          sale_price: product.sale_price,
          supplier_id: product.supplier_id,
          brand: product.brand ?? "",
          size: product.size ?? "",
          color: product.color ?? "",
          gender: product.gender ?? "Unisex",
          season: product.season ?? "",
          internal_code: product.internal_code ?? "",
          qr_payload: product.qr_payload ?? "",
          stock: product.stock,
        }
      : emptyProduct,
  );
  const [saving, setSaving] = useState(false);

  function set<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  // Sugerencias de talla segun la categoria elegida (+ tallas ya usadas). Escribible.
  const sizeOptions = mergeOptions(sizesForCategory(form.category), sizes);

  const margin = form.sale_price - form.real_cost;
  const marginPct = form.real_cost > 0 ? Math.round((margin / form.real_cost) * 100) : 0;
  const canSave = form.name.trim().length > 0 && form.sale_price > 0;

  async function submit() {
    if (!canSave || saving) return;
    setSaving(true);
    await onSave(form, product?.id);
    setSaving(false);
    onClose();
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="panel-heading">
          <div>
            <p className="section-label">{product ? "Editar producto" : "Nuevo producto"}</p>
            <h2>{product ? product.name : "Crear referencia"}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>


        <div className="form-section">
          <h3>Identificacion</h3>
          <div className="form-grid two">
            <label>
              Codigo interno
              <input value={form.internal_code ?? ""} readOnly placeholder="Automatico al guardar" />
            </label>
            <label>
              QR / barra
              <input value={form.qr_payload ?? ""} readOnly placeholder="Automatico al guardar" />
            </label>
          </div>
        </div>

        <div className="form-section">
          <h3>Producto</h3>
          <div className="form-grid two">
            <label className="span-2">
              Nombre <em className="req">*</em>
              <input value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Ej. Camisa polo manga corta" />
            </label>
            <label>
              Categoria
              <Combobox value={form.category} onChange={(v) => set("category", v)} options={categoryOptions} placeholder="Elige o escribe una categoria" />
            </label>
            <label>
              Marca
              <Combobox value={form.brand ?? ""} onChange={(v) => set("brand", v)} options={brands} placeholder="Escribe o elige una marca" />
            </label>
            <label>
              Talla
              <Combobox value={form.size ?? ""} onChange={(v) => set("size", v)} options={sizeOptions} placeholder={form.category ? "Elige o escribe una talla" : "Primero elige categoria"} />
            </label>
            <label>
              Color
              <Combobox value={form.color ?? ""} onChange={(v) => set("color", v)} options={colorOptions} placeholder="Elige o escribe un color" />
            </label>
            <label>
              Genero
              <select value={form.gender ?? ""} onChange={(event) => set("gender", event.target.value)}>
                {GENDERS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <label>
              Temporada
              <input value={form.season ?? ""} onChange={(event) => set("season", event.target.value)} placeholder="Verano, invierno" />
            </label>
          </div>
        </div>

        <div className="form-section">
          <h3>Stock y precios</h3>
          <div className="form-grid two">
            <label className="span-2">
              Proveedor
              <select value={form.supplier_id ?? ""} onChange={(event) => set("supplier_id", event.target.value || null)}>
                <option value="">Sin proveedor</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Stock {product ? "actual" : "inicial"}
              <input type="number" value={form.stock} onChange={(event) => set("stock", Number(event.target.value))} />
            </label>
            <label>
              Minimo (alerta)
              <input type="number" value={form.min_stock} onChange={(event) => set("min_stock", Number(event.target.value))} />
            </label>
            <label>
              Costo real
              <input type="number" value={form.real_cost} onChange={(event) => set("real_cost", Number(event.target.value))} />
            </label>
            <label>
              Precio venta <em className="req">*</em>
              <input type="number" value={form.sale_price} onChange={(event) => set("sale_price", Number(event.target.value))} />
            </label>
          </div>
          <div className="margin-hint">
            Ganancia por unidad: <strong>{lps(margin)}</strong> {form.real_cost > 0 && <span>({marginPct}%)</span>}
          </div>
        </div>

        <button className="primary-button wide" disabled={!canSave || saving} onClick={() => void submit()}>
          <Save size={18} /> {saving ? "Guardando..." : "Guardar producto"}
        </button>
      </aside>
    </div>
  );
}

function AdjustmentModal({
  product,
  onClose,
  onSave,
}: {
  product: Product;
  onClose: () => void;
  onSave: (draft: AdjustmentDraft) => Promise<void>;
}) {
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState("damaged");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const delta = direction === "out" ? -Math.abs(amount) : Math.abs(amount);
  const resulting = Math.max(0, product.stock + delta);
  const canSave = amount > 0 && !saving;

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    await onSave({ product, quantity: delta, reason, notes });
    setSaving(false);
    onClose();
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="qr-modal adjustment-modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-button modal-close" onClick={onClose}>
          <X size={18} />
        </button>
        <p className="section-label">Ajuste de inventario</p>
        <h2>{product.name}</h2>
        <p className="adj-current">
          Stock actual: <strong>{product.stock}</strong>
        </p>

        <div className="payment-toggle adj-toggle">
          <button className={direction === "out" ? "active" : ""} onClick={() => setDirection("out")}>
            Restar
          </button>
          <button className={direction === "in" ? "active" : ""} onClick={() => setDirection("in")}>
            Sumar
          </button>
        </div>

        <div className="form-grid one">
          <label>
            Motivo
            <select value={reason} onChange={(event) => setReason(event.target.value)}>
              {ADJUSTMENT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cantidad
            <input type="number" min={1} value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
          </label>
          <label>
            Notas
            <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Detalle del ajuste" />
          </label>
        </div>

        <p className="adj-result">
          Nuevo stock: <strong>{resulting}</strong>
        </p>
        <button className="primary-button wide" disabled={!canSave} onClick={() => void submit()}>
          <Save size={18} /> Registrar ajuste
        </button>
      </div>
    </div>
  );
}


function PurchaseModal({
  products,
  suppliers,
  onClose,
  onSave,
}: {
  products: Product[];
  suppliers: Party[];
  onClose: () => void;
  onSave: (supplierId: string | null, lines: PurchaseLine[]) => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) =>
        [p.name, p.internal_code, p.sku, p.brand].filter(Boolean).join(" ").toLowerCase().includes(q),
      )
      .filter((p) => !lines.some((l) => l.product.id === p.id))
      .slice(0, 6);
  }, [products, query, lines]);

  function addLine(product: Product) {
    setLines((current) => [...current, { product, qty: suggestedRestock(product.stock, product.min_stock), unit_cost: product.real_cost }]);
    setQuery("");
  }

  function updateLine(id: string, patch: Partial<PurchaseLine>) {
    setLines((current) => current.map((l) => (l.product.id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: string) {
    setLines((current) => current.filter((l) => l.product.id !== id));
  }

  const total = lines.reduce((sum, l) => sum + l.qty * l.unit_cost, 0);
  const canSave = lines.length > 0 && lines.every((l) => l.qty > 0) && !saving;

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    await onSave(supplierId || null, lines);
    setSaving(false);
    onClose();
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer wide-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="panel-heading">
          <div>
            <p className="section-label">Entrada de mercaderia</p>
            <h2>Registrar pedido recibido</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="form-section">
          <label>
            Proveedor
            <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              <option value="">Sin proveedor</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>

          <label className="purchase-search">
            Agregar producto
            <div className="inv-search">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto para recibir" />
            </div>
            {matches.length > 0 && (
              <div className="purchase-suggestions">
                {matches.map((p) => (
                  <button key={p.id} onClick={() => addLine(p)}>
                    <strong>{p.name}</strong>
                    <span>
                      {p.internal_code ?? p.sku} · stock {p.stock}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </label>
        </div>

        <div className="purchase-lines">
          {lines.length === 0 ? (
            <EmptyWork title="Sin productos" text="Busca y agrega los productos que llegaron en el pedido." />
          ) : (
            <table className="purchase-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th>Costo unit.</th>
                  <th>Subtotal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.product.id}>
                    <td>
                      <strong>{line.product.name}</strong>
                      <span className="inv-code">{line.product.internal_code ?? line.product.sku}</span>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={line.qty}
                        onChange={(event) => updateLine(line.product.id, { qty: Number(event.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={line.unit_cost}
                        onChange={(event) => updateLine(line.product.id, { unit_cost: Number(event.target.value) })}
                      />
                    </td>
                    <td>{lps(line.qty * line.unit_cost)}</td>
                    <td>
                      <button className="icon-button" onClick={() => removeLine(line.product.id)}>
                        <X size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="total-box">
          <span>Total compra</span>
          <strong>{lps(total)}</strong>
        </div>
        <button className="primary-button wide" disabled={!canSave} onClick={() => void submit()}>
          <PackagePlus size={18} /> {saving ? "Registrando..." : "Registrar entrada y sumar stock"}
        </button>
      </aside>
    </div>
  );
}

