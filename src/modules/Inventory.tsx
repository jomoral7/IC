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
import { Fragment, useMemo, useState } from "react";
import type { AdjustmentDraft, Party, Product, ProductForm, PurchaseLine } from "../types";
import { ADJUSTMENT_REASONS, CATEGORY_OPTIONS, COLOR_OPTIONS, GENDERS, emptyProduct, sizesForCategory } from "../types";
import { lps, shortDate, stockState, suggestedRestock } from "../lib/format";
import { Combobox, EmptyWork } from "../ui";
import { ScannerModal } from "./Scanner";
import { LabelScanner, type LabelFields } from "./LabelScanner";

type Filter = "all" | "low" | "orders";

/** Une el catalogo precargado con los valores ya existentes, sin duplicados. */
function mergeOptions(catalog: string[], existing: string[]): string[] {
  const extra = existing.filter((v) => !catalog.includes(v));
  return [...catalog, ...extra];
}

/** Color aproximado para el cuadrito identificador de cada variante. Usa los nombres reales del Excel. */
const COLOR_HEX: Record<string, string> = {
  negro: "#111111",
  blanco: "#ffffff",
  blanca: "#ffffff",
  gris: "#9aa3ab",
  "gris oscuro": "#4b5563",
  "gris topo": "#8b8178",
  azul: "#1e4fd8",
  "azul oscuro": "#172554",
  "azul marino": "#1b2a52",
  "azul navy": "#111d45",
  "azul celeste": "#7cc4f0",
  celeste: "#7cc4f0",
  rojo: "#d0342c",
  roja: "#d0342c",
  vino: "#7b1e2b",
  verde: "#2e8b57",
  "verde claro": "#8fd18b",
  "verde oscuro": "#14532d",
  "verde menta": "#8ce0c2",
  "verde militar": "#4b5d2a",
  "verde petroleo": "#006b68",
  "verde azulado": "#0f766e",
  amarillo: "#f2c200",
  mostaza: "#c58b17",
  anaranjado: "#e8792b",
  naranja: "#e8792b",
  rosado: "#e87fa8",
  "rosado pastel": "#f8b8cf",
  "rosado palido": "#f3c1cf",
  "rosado encendido": "#e84393",
  morado: "#7a3fb0",
  "morado pastel": "#a78bfa",
  cafe: "#7a4b2b",
  "café": "#7a4b2b",
  caqui: "#b59b62",
  beige: "#e4d5b7",
  dorado: "#c9a227",
  dorados: "#c9a227",
  plateado: "#c0c0c0",
  floral: "linear-gradient(135deg, #f8b8cf 0 33%, #2e8b57 33% 66%, #f2c200 66% 100%)",
  floriado: "linear-gradient(135deg, #f8b8cf 0 33%, #2e8b57 33% 66%, #f2c200 66% 100%)",
  "animal print": "linear-gradient(135deg, #c28b45 0 45%, #111111 45% 55%, #e8c98f 55% 100%)",
  multicolor: "linear-gradient(135deg, #1e4fd8 0 25%, #e87fa8 25% 50%, #2e8b57 50% 75%, #f2c200 75% 100%)",
  "varios colores": "linear-gradient(135deg, #1e4fd8 0 25%, #e87fa8 25% 50%, #2e8b57 50% 75%, #f2c200 75% 100%)",
};

function normalizeColorName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function colorHex(name: string | null): string {
  const normalized = normalizeColorName(name ?? "");
  if (!normalized) return "#cfd6dc";

  const exact = COLOR_HEX[normalized] ?? COLOR_HEX[name?.toLowerCase().trim() ?? ""];
  if (exact) return exact;

  if (normalized.includes(",") || normalized.includes(" y ")) {
    const parts = normalized
      .split(/\s+y\s+|,/)
      .map((part) => colorHex(part.trim()))
      .filter((value) => value && !value.startsWith("linear-gradient"))
      .slice(0, 4);
    if (parts.length > 1) {
      const step = 100 / parts.length;
      return `linear-gradient(135deg, ${parts.map((color, i) => `${color} ${Math.round(i * step)}% ${Math.round((i + 1) * step)}%`).join(", ")})`;
    }
  }

  const known = Object.keys(COLOR_HEX).sort((a, b) => b.length - a.length);
  const match = known.find((key) => normalized.includes(normalizeColorName(key)));
  return match ? COLOR_HEX[match] : "#cfd6dc";
}

const COLOR_SWATCH_OPTIONS = [
  "Negro",
  "Blanco",
  "Gris",
  "Azul",
  "Azul Oscuro",
  "Azul marino",
  "Celeste",
  "Rojo",
  "Vino",
  "Verde",
  "Verde militar",
  "Verde petroleo",
  "Amarillo",
  "Mostaza",
  "Anaranjado",
  "Rosado",
  "Morado",
  "Cafe",
  "Caqui",
  "Beige",
  "Dorado",
  "Floral",
  "Animal Print",
  "Varios colores",
];

function ColorPickerField({
  value,
  onChange,
  options,
  label = "Color",
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  label?: string;
}) {
  const merged = mergeOptions(COLOR_SWATCH_OPTIONS, options);
  const [open, setOpen] = useState(false);
  const fallbackHex = colorHex(value);
  const pickerValue = fallbackHex.startsWith("#") ? fallbackHex : "#1e4fd8";
  return (
    <div className="field-label color-field">
      <span>{label}</span>
      <div className="color-input-row">
        <button
          type="button"
          className="color-preview"
          style={{ background: fallbackHex }}
          onClick={() => setOpen((current) => !current)}
          aria-label="Elegir color visual"
          title="Elegir color visual"
        />
        <Combobox value={value} onChange={onChange} options={merged} placeholder="Elige o escribe un color" />
      </div>
      {open && (
        <div className="color-popover">
          <div className="color-custom-row">
            <input
              type="color"
              value={pickerValue}
              onChange={(event) => onChange(event.target.value)}
              aria-label="Color personalizado"
            />
            <span>
              Color visual
              <small>Tambien puedes escribir el nombre arriba</small>
            </span>
          </div>
          <div className="color-swatch-grid" aria-label="Colores sugeridos">
            {merged.slice(0, 32).map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                aria-label={color}
                className={normalizeColorName(color) === normalizeColorName(value) ? "active" : ""}
                onClick={() => {
                  onChange(color);
                  setOpen(false);
                }}
              >
                <span style={{ background: colorHex(color) }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Inventory({
  products,
  suppliers,
  categories,
  brands,
  sizes,
  colors,
  saveProduct,
  createProductMatrix,
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
  createProductMatrix: (
    base: { name: string; description: string; category: string; brand: string; gender: string; supplier_id: string | null; real_cost: number; sale_price: number; min_stock: number },
    combos: { size: string; color: string; qty: number }[],
  ) => Promise<void>;
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
  const [departmentFilter, setDepartmentFilter] = useState("__all__");
  const [categoryFilter, setCategoryFilter] = useState("__all__");
  const [brandFilter, setBrandFilter] = useState("__all__");
  const [groupVariants, setGroupVariants] = useState(false);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [localQuery, setLocalQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [pedido, setPedido] = useState<Product | null>(null);
  const [matrixing, setMatrixing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleGroup(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const searched = useMemo(() => {
    const q = localQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) =>
      [product.name, product.description, product.internal_code, product.sku, product.brand, product.category, product.size, product.color, product.gender]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [products, localQuery]);

  const filteredByFacets = searched.filter((p) => {
    const matchesDepartment = departmentFilter === "__all__" || (p.gender || "Sin departamento") === departmentFilter;
    const matchesCategory = categoryFilter === "__all__" || (p.category || "Sin categoria") === categoryFilter;
    const matchesBrand = brandFilter === "__all__" || (p.brand || "Sin marca") === brandFilter;
    return matchesDepartment && matchesCategory && matchesBrand;
  });
  const visible = filter === "low" ? filteredByFacets.filter((p) => stockState(p.stock, p.min_stock) !== "ok") : filteredByFacets;

  // Agrupar variantes bajo su producto base solo cuando el usuario lo pide.
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; brand: string | null; category: string; items: Product[] }>();
    for (const p of visible) {
      const key = `${p.name}||${p.category}||${p.brand ?? ""}`;
      const g = map.get(key) ?? { key, name: p.name, brand: p.brand, category: p.category, items: [] };
      g.items.push(p);
      map.set(key, g);
    }
    return Array.from(map.values());
  }, [visible]);
  const categoryOptions = useMemo(
    () => Array.from(new Set(products.map((p) => p.category || "Sin categoria"))).sort((a, b) => a.localeCompare(b)),
    [products],
  );
  const departmentOptions = useMemo(
    () => Array.from(new Set(products.map((p) => p.gender || "Sin departamento"))).sort((a, b) => a.localeCompare(b)),
    [products],
  );
  const brandOptions = useMemo(
    () => Array.from(new Set(products.map((p) => p.brand || "Sin marca"))).sort((a, b) => a.localeCompare(b)),
    [products],
  );

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
              placeholder="Buscar por producto, detalle, código, marca, talla o color"
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
          {filter !== "orders" && (
            <div className="inv-facet-filters">
              <label className="inv-filter-select">
                <span>Departamento</span>
                <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
                  <option value="__all__">Todos</option>
                  {departmentOptions.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inv-filter-select">
                <span>Categoria</span>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="__all__">Todas</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inv-filter-select">
                <span>Marca</span>
                <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
                  <option value="__all__">Todas</option>
                  {brandOptions.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {filter !== "orders" && (
            <label className="inv-switch">
              <input type="checkbox" checked={groupVariants} onChange={(event) => setGroupVariants(event.target.checked)} />
              <span>Agrupar variantes</span>
            </label>
          )}
          <div className="inv-actions">
            <button className="secondary-button" onClick={() => setScanning(true)}>
              <ScanLine size={16} /> Escanear
            </button>
            <button className="secondary-button" onClick={() => setPurchasing(true)}>
              <Truck size={16} /> Entrada de pedido
            </button>
            <button className="secondary-button" onClick={() => setMatrixing(true)}>
              <PackagePlus size={16} /> Crear por matriz
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
                  <th>Departamento</th>
                  <th>Categoria</th>
                  <th>Marca</th>
                  <th>Talla</th>
                  <th>Color</th>
                  <th>Descripción</th>
                  <th className="num">Cantidad</th>
                  <th className="num">Costo</th>
                  <th className="num">Venta</th>
                  <th className="center">Estado</th>
                  <th className="actions-col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {groupVariants
                  ? groups.map((g) =>
                      g.items.length === 1 ? (
                        <ProductRow
                          key={g.items[0].id}
                          product={g.items[0]}
                          onEdit={() => setEditing(g.items[0])}
                          onAdjust={() => setAdjusting(g.items[0])}
                          onPedido={() => setPedido(g.items[0])}
                          onDelete={() => void deleteProduct(g.items[0])}
                        />
                      ) : (
                        <Fragment key={g.key}>
                          <GroupRow group={g} open={expanded.has(g.key)} onToggle={() => toggleGroup(g.key)} />
                          {expanded.has(g.key) &&
                            g.items.map((product) => (
                              <ProductRow
                                key={product.id}
                                product={product}
                                indent
                                onEdit={() => setEditing(product)}
                                onAdjust={() => setAdjusting(product)}
                                onPedido={() => setPedido(product)}
                                onDelete={() => void deleteProduct(product)}
                              />
                            ))}
                        </Fragment>
                      ),
                    )
                  : visible.map((product) => (
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
      {matrixing && (
        <MatrixModal
          suppliers={suppliers}
          categories={categories}
          brands={brands}
          colors={colors}
          sizes={sizes}
          onClose={() => setMatrixing(false)}
          onSave={createProductMatrix}
        />
      )}
    </>
  );
}

function GroupRow({
  group,
  open,
  onToggle,
}: {
  group: { key: string; name: string; brand: string | null; category: string; items: Product[] };
  open: boolean;
  onToggle: () => void;
}) {
  const totalStock = group.items.reduce((s, p) => s + p.stock, 0);
  const incoming = group.items.reduce((s, p) => s + p.incoming, 0);
  const anyOut = group.items.some((p) => stockState(p.stock, p.min_stock) === "out");
  const anyLow = group.items.some((p) => stockState(p.stock, p.min_stock) === "low");
  const state = anyOut ? "out" : anyLow ? "low" : "ok";
  const stateLabel = state === "out" ? "Hay agotados" : state === "low" ? "Hay stock bajo" : "En stock";
  const anyOffer = group.items.some((p) => p.discount_pct > 0);
  const prices = group.items.map((p) => (p.discount_pct > 0 ? p.price_final : p.sale_price));
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const priceText = minP === maxP ? lps(minP) : `${lps(minP)} – ${lps(maxP)}`;
  const descriptions = [...new Set(group.items.map((product) => product.description?.trim()).filter(Boolean))];
  const descriptionText = descriptions.length === 0 ? "—" : descriptions.length === 1 ? descriptions[0] : "Varios detalles";
  return (
    <tr className="group-row" onClick={onToggle}>
      <td>
        <strong>
          <span className="group-caret">{open ? "▾" : "▸"}</span> {group.name}
        </strong>
        <span className="inv-code">{group.items.length} variantes</span>
      </td>
      <td className="muted">—</td>
      <td>
        <strong className="inv-cat category-pill">{group.category || "Sin categoria"}</strong>
      </td>
      <td>{group.brand || "Sin marca"}</td>
      <td className="muted">Variantes</td>
      <td className="muted">—</td>
      <td className="inv-description-cell">{descriptionText}</td>
      <td className={`num ${state !== "ok" ? "stock-alert" : ""}`}>
        <strong>{totalStock}</strong>
        {incoming > 0 && <span className="incoming-tag">+{incoming} en camino</span>}
      </td>
      <td className="num muted">—</td>
      <td className="num">
        {priceText}
        {anyOffer && <span className="inv-offer-tag">oferta</span>}
      </td>
      <td className="center">
        <span className={`stock-badge ${state}`}>{stateLabel}</span>
      </td>
      <td className="actions-col">
        <button className="mini-button" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
          {open ? "Cerrar" : "Ver variantes"}
        </button>
      </td>
    </tr>
  );
}

function ProductRow({
  product,
  indent = false,
  onEdit,
  onAdjust,
  onPedido,
  onDelete,
}: {
  product: Product;
  indent?: boolean;
  onEdit: () => void;
  onAdjust: () => void;
  onPedido: () => void;
  onDelete: () => void;
}) {
  const state = stockState(product.stock, product.min_stock);
  const stateLabel = state === "out" ? "Agotado" : state === "low" ? "Stock bajo" : "En stock";
  const onOffer = product.discount_pct > 0;
  return (
    <tr className={indent ? "variant-child" : ""}>
      <td>
        <strong className={indent ? "child-name" : ""}>{product.name}</strong>
        <span className="inv-code">{product.internal_code || product.sku}</span>
      </td>
      <td>{product.gender || "Sin departamento"}</td>
      <td>
        <strong className="inv-cat category-pill">{product.category || "Sin categoria"}</strong>
      </td>
      <td>{product.brand || "Sin marca"}</td>
      <td>{product.size || "—"}</td>
      <td>
        {product.color ? (
          <span className="inv-color-value"><span className="color-dot" style={{ background: colorHex(product.color) }} />{product.color}</span>
        ) : (
          "—"
        )}
      </td>
      <td className="inv-description-cell">{product.description || "—"}</td>
      <td className={`num ${state !== "ok" ? "stock-alert" : ""}`}>
        <strong>{product.stock}</strong>
        {product.incoming > 0 && <span className="incoming-tag">+{product.incoming} en camino</span>}
      </td>
      <td className="num muted">{lps(product.real_cost)}</td>
      <td className="num">
        {onOffer ? (
          <>
            <span style={{ textDecoration: "line-through", color: "#98a2ac", fontSize: 12 }}>{lps(product.sale_price)}</span>{" "}
            <strong>{lps(product.price_final)}</strong>
            <span className="inv-offer-tag">-{product.discount_pct}%</span>
          </>
        ) : (
          lps(product.sale_price)
        )}
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
          description: product.description ?? "",
          gender: product.gender ?? "Unisex",
          season: product.season ?? "",
          internal_code: product.internal_code ?? "",
          qr_payload: product.qr_payload ?? "",
          stock: product.stock,
        }
      : emptyProduct,
  );
  const [saving, setSaving] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);

  function set<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  // Rellena el formulario con lo leido de la etiqueta (solo campos con valor).
  function applyLabel(f: LabelFields) {
    setForm((current) => ({
      ...current,
      name: f.name?.trim() || current.name,
      brand: f.brand?.trim() || current.brand,
      category: f.category?.trim() || current.category,
      size: f.size?.trim() || current.size,
      color: f.color?.trim() || current.color,
    }));
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
      <aside className="drawer product-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="panel-heading">
          <div>
            <p className="section-label">{product ? "Editar producto" : "Nuevo producto"}</p>
            <h2>{product ? product.name : "Crear referencia"}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {product && (product.created_by_name || product.updated_by_name) && (
          <div className="who-note">
            {product.created_by_name && <span>Creado por <strong>{product.created_by_name}</strong></span>}
            {product.updated_by_name && (
              <span>
                · Última edición por <strong>{product.updated_by_name}</strong>
                {product.updated_at ? ` (${shortDate(product.updated_at)})` : ""}
              </span>
            )}
          </div>
        )}

        <button className="secondary-button wide label-scan-btn" onClick={() => setLabelOpen(true)}>
          <ScanLine size={16} /> Leer etiqueta con foto
        </button>

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
            {product?.created_at && (
              <label className="span-2">
                Fecha de ingreso
                <input value={new Date(product.created_at).toLocaleDateString("es-HN")} readOnly />
              </label>
            )}
          </div>
        </div>

        <div className="form-section">
          <h3>Producto</h3>
          <div className="form-grid three">
            <label className="span-2">
              Nombre <em className="req">*</em>
              <input value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Ej. Camisa polo manga corta" />
            </label>
            <label className="span-2">
              Descripción / detalle
              <input
                value={form.description ?? ""}
                onChange={(event) => set("description", event.target.value)}
                placeholder="Ej. Manga corta, estampado frontal, tela algodón"
              />
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
            <ColorPickerField value={form.color ?? ""} onChange={(v) => set("color", v)} options={colorOptions} />
            <label>
              Departamento
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
          <div className="form-grid three">
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

        <div className="drawer-footer">
          <button className="primary-button wide" disabled={!canSave || saving} onClick={() => void submit()}>
            <Save size={18} /> {saving ? "Guardando..." : "Guardar producto"}
          </button>
        </div>
      </aside>
      {labelOpen && <LabelScanner onApply={applyLabel} onClose={() => setLabelOpen(false)} />}
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

function MatrixModal({
  suppliers,
  categories,
  brands,
  colors,
  sizes,
  onClose,
  onSave,
}: {
  suppliers: Party[];
  categories: string[];
  brands: string[];
  colors: string[];
  sizes: string[];
  onClose: () => void;
  onSave: (
    base: { name: string; description: string; category: string; brand: string; gender: string; supplier_id: string | null; real_cost: number; sale_price: number; min_stock: number },
    combos: { size: string; color: string; qty: number }[],
  ) => Promise<void>;
}) {
  const [base, setBase] = useState({
    name: "",
    description: "",
    category: "",
    brand: "",
    gender: "Unisex",
    supplier_id: "",
    real_cost: 0,
    sale_price: 0,
    min_stock: 0,
  });
  type Row = { size: string; color: string; qty: number; sizeCustom?: boolean; colorCustom?: boolean };
  const [rows, setRows] = useState<Row[]>([{ size: "", color: "", qty: 1 }]);
  const [saving, setSaving] = useState(false);

  const sizeCatalog = mergeOptions(sizesForCategory(base.category), sizes);
  const colorCatalog = mergeOptions(COLOR_OPTIONS, colors);
  const categoryOptions = mergeOptions(CATEGORY_OPTIONS, categories);

  function setRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    // La nueva fila hereda la talla de la anterior (util para repetir talla y cambiar color).
    const last = rows[rows.length - 1];
    setRows((prev) => [...prev, { size: last?.size ?? "", color: "", qty: 1 }]);
  }
  function removeRow(i: number) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  const validRows = rows.filter((r) => (r.size.trim() || r.color.trim()) && r.qty >= 0);
  const totalUnits = validRows.reduce((sum, r) => sum + r.qty, 0);
  const canSave = base.name.trim().length > 0 && base.sale_price > 0 && validRows.length > 0 && !saving;

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    await onSave(
      {
        name: base.name,
        description: base.description,
        category: base.category,
        brand: base.brand,
        gender: base.gender,
        supplier_id: base.supplier_id || null,
        real_cost: base.real_cost,
        sale_price: base.sale_price,
        min_stock: base.min_stock,
      },
      validRows.map((r) => ({ size: r.size.trim(), color: r.color.trim(), qty: r.qty })),
    );
    setSaving(false);
    onClose();
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="panel-heading">
          <div>
            <p className="section-label">Alta rapida</p>
            <h2>Crear por matriz (talla x color)</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p className="mini-note">Datos comunes arriba. Abajo agrega una fila por cada variante (talla + color + cantidad).</p>

        <div className="form-section">
          <div className="form-grid two">
            <label className="span-2">
              Nombre <em className="req">*</em>
              <input value={base.name} onChange={(e) => setBase({ ...base, name: e.target.value })} placeholder="Ej. Camisa polo manga corta" />
            </label>
            <label className="span-2">
              Descripción / detalle
              <input value={base.description} onChange={(e) => setBase({ ...base, description: e.target.value })} placeholder="Detalle común a todas las variantes" />
            </label>
            <label>
              Categoria
              <Combobox value={base.category} onChange={(v) => setBase({ ...base, category: v })} options={categoryOptions} placeholder="Elige o escribe" />
            </label>
            <label>
              Marca
              <Combobox value={base.brand} onChange={(v) => setBase({ ...base, brand: v })} options={brands} placeholder="Escribe o elige" />
            </label>
            <label>
              Departamento
              <select value={base.gender} onChange={(e) => setBase({ ...base, gender: e.target.value })}>
                {GENDERS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <label>
              Proveedor
              <select value={base.supplier_id} onChange={(e) => setBase({ ...base, supplier_id: e.target.value })}>
                <option value="">Sin proveedor</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Costo real
              <input type="number" min={0} value={base.real_cost} onChange={(e) => setBase({ ...base, real_cost: Number(e.target.value) })} />
            </label>
            <label>
              Precio venta <em className="req">*</em>
              <input type="number" min={0} value={base.sale_price} onChange={(e) => setBase({ ...base, sale_price: Number(e.target.value) })} />
            </label>
            <label>
              Minimo (alerta)
              <input type="number" min={0} value={base.min_stock} onChange={(e) => setBase({ ...base, min_stock: Number(e.target.value) })} />
            </label>
          </div>
        </div>

        <div className="form-section">
          <div className="matrix-head">
            <h3>Variantes · {validRows.length} · {totalUnits} unidades</h3>
            <button className="secondary-button" onClick={addRow}>
              <Plus size={14} /> Agregar variante
            </button>
          </div>
          <div className="variant-table">
            <div className="variant-row variant-head">
              <span>Talla</span>
              <span>Color</span>
              <span>Cantidad</span>
              <span></span>
            </div>
            {rows.map((r, i) => (
              <div className="variant-row" key={i}>
                {r.sizeCustom ? (
                  <input value={r.size} autoFocus placeholder="Escribe la talla" onChange={(e) => setRow(i, { size: e.target.value })} />
                ) : (
                  <select
                    value={sizeCatalog.includes(r.size) ? r.size : ""}
                    onChange={(e) => (e.target.value === "__otro__" ? setRow(i, { sizeCustom: true, size: "" }) : setRow(i, { size: e.target.value }))}
                  >
                    <option value="">Talla…</option>
                    {sizeCatalog.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    <option value="__otro__">Otro…</option>
                  </select>
                )}
                <ColorPickerField value={r.color} onChange={(color) => setRow(i, { color, colorCustom: false })} options={colorCatalog} label="Color" />
                <input
                  type="number"
                  min={0}
                  value={r.qty}
                  onChange={(e) => setRow(i, { qty: Math.max(0, Number(e.target.value)) })}
                />
                <button className="icon-action danger" title="Quitar" onClick={() => removeRow(i)} disabled={rows.length <= 1}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <button className="primary-button wide" disabled={!canSave} onClick={() => void submit()}>
          <Save size={18} /> {saving ? "Creando..." : `Crear ${validRows.length} variante(s)`}
        </button>
      </aside>
    </div>
  );
}
