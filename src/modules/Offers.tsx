import { Save, Search, Tag, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Product } from "../types";
import { lps } from "../lib/format";
import { DataTable, EmptyWork } from "../ui";

type ScopeType = "selected" | "category" | "brand" | "all";

export function Offers({
  products,
  categories,
  brands,
  onApply,
  onClearAll,
}: {
  products: Product[];
  categories: string[];
  brands: string[];
  onApply: (scope: { type: ScopeType; value?: string; ids?: string[] }, pct: number) => Promise<void>;
  onClearAll: () => Promise<void>;
}) {
  const [scopeType, setScopeType] = useState<ScopeType>("selected");
  const [scopeValue, setScopeValue] = useState("");
  const [pct, setPct] = useState(10);
  const [saving, setSaving] = useState(false);
  // Seleccion manual
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pickQuery, setPickQuery] = useState("");
  const [pickCat, setPickCat] = useState("");
  const [pickBrand, setPickBrand] = useState("");

  const onSale = useMemo(() => products.filter((p) => p.discount_pct > 0), [products]);

  // Lista filtrada para el picker manual.
  const pickList = useMemo(() => {
    const q = pickQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (pickCat && p.category !== pickCat) return false;
      if (pickBrand && p.brand !== pickBrand) return false;
      if (q && ![p.name, p.internal_code, p.sku, p.brand, p.size, p.color].filter(Boolean).join(" ").toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [products, pickQuery, pickCat, pickBrand]);

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllFiltered() {
    setSelectedIds((prev) => new Set([...prev, ...pickList.map((p) => p.id)]));
  }

  // Cuantos productos afectaria el alcance elegido.
  const affected = useMemo(() => {
    if (scopeType === "all") return products.length;
    if (scopeType === "selected") return selectedIds.size;
    if (scopeType === "category") return products.filter((p) => p.category === scopeValue).length;
    return products.filter((p) => p.brand === scopeValue).length;
  }, [products, scopeType, scopeValue, selectedIds]);

  const canApply =
    (scopeType === "all" || scopeType === "selected" || scopeValue) && affected > 0 && !saving;

  async function apply(value: number) {
    if ((scopeType === "category" || scopeType === "brand") && !scopeValue) return;
    if (scopeType === "selected" && selectedIds.size === 0) return;
    setSaving(true);
    await onApply({ type: scopeType, value: scopeValue || undefined, ids: [...selectedIds] }, value);
    setSaving(false);
  }

  return (
    <section className="panel full-panel">
      <div className="panel-heading">
        <div>
          <p className="section-label">Precios</p>
          <h2>Ofertas y descuentos</h2>
        </div>
        {onSale.length > 0 && (
          <button className="danger-button" onClick={() => void onClearAll()}>
            <Trash2 size={16} /> Quitar todas las ofertas
          </button>
        )}
      </div>

      <div className="offer-form">
        <p className="mini-note">
          Aplica un descuento a un grupo de productos de una vez. En el POS el precio ya sale rebajado; el vendedor solo ve
          el precio con descuento.
        </p>
        <div className="offer-controls">
          <label>
            Aplicar a
            <select
              value={scopeType}
              onChange={(e) => {
                setScopeType(e.target.value as ScopeType);
                setScopeValue("");
              }}
            >
              <option value="selected">Productos que yo elija</option>
              <option value="category">Una categoria</option>
              <option value="brand">Una marca</option>
              <option value="all">Todos los productos</option>
            </select>
          </label>

          {scopeType === "category" && (
            <label>
              Categoria
              <select value={scopeValue} onChange={(e) => setScopeValue(e.target.value)}>
                <option value="">Elige categoria…</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
          {scopeType === "brand" && (
            <label>
              Marca
              <select value={scopeValue} onChange={(e) => setScopeValue(e.target.value)}>
                <option value="">Elige marca…</option>
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            Descuento %
            <input type="number" min={0} max={90} value={pct} onChange={(e) => setPct(Math.max(0, Math.min(90, Number(e.target.value))))} />
          </label>
        </div>

        {scopeType === "selected" && (
          <div className="offer-picker">
            <div className="offer-picker-filters">
              <div className="inv-search" style={{ flex: 1, minWidth: 180 }}>
                <Search size={15} />
                <input value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} placeholder="Buscar producto" />
              </div>
              <select value={pickCat} onChange={(e) => setPickCat(e.target.value)}>
                <option value="">Toda categoria</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select value={pickBrand} onChange={(e) => setPickBrand(e.target.value)}>
                <option value="">Toda marca</option>
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <button className="secondary-button" onClick={selectAllFiltered}>
                Marcar todos
              </button>
              {selectedIds.size > 0 && (
                <button className="secondary-button" onClick={() => setSelectedIds(new Set())}>
                  Limpiar ({selectedIds.size})
                </button>
              )}
            </div>
            <div className="offer-picker-list">
              {pickList.length === 0 ? (
                <p className="mini-note">Sin productos con ese filtro.</p>
              ) : (
                pickList.map((p) => (
                  <label className={`offer-pick-item ${selectedIds.has(p.id) ? "on" : ""}`} key={p.id}>
                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleId(p.id)} />
                    <span className="offer-pick-name">
                      <strong>{p.name}</strong>
                      <em>
                        {p.internal_code ?? p.sku} · {[p.brand, p.size, p.color].filter(Boolean).join(" · ") || "—"}
                      </em>
                    </span>
                    <b>{lps(p.sale_price)}</b>
                  </label>
                ))
              )}
            </div>
          </div>
        )}

        <p className="offer-affected">
          Afecta a <strong>{affected}</strong> producto(s).
        </p>
        <div className="offer-actions">
          <button className="primary-button" disabled={!canApply} onClick={() => void apply(pct)}>
            <Tag size={16} /> Aplicar {pct}% de descuento
          </button>
          <button className="secondary-button" disabled={!canApply} onClick={() => void apply(0)}>
            Quitar descuento de este grupo
          </button>
        </div>
      </div>

      <h3 className="offer-list-title">Productos en oferta ({onSale.length})</h3>
      {onSale.length === 0 ? (
        <EmptyWork title="Sin ofertas activas" text="Aplica un descuento arriba para poner productos en oferta." />
      ) : (
        <DataTable
          headers={["Producto", "Categoria / marca", "Precio normal", "Descuento", "Precio final"]}
          rows={onSale.map((p) => [
            <span>
              <strong>{p.name}</strong> <span className="muted">· {p.internal_code ?? p.sku}</span>
            </span>,
            `${p.category}${p.brand ? " · " + p.brand : ""}`,
            <span style={{ textDecoration: "line-through", color: "#98a2ac" }}>{lps(p.sale_price)}</span>,
            <span className="stock-badge out">-{p.discount_pct}%</span>,
            <strong>{lps(p.price_final)}</strong>,
          ])}
        />
      )}
    </section>
  );
}
