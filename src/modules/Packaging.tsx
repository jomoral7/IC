import { AlertTriangle, Banknote, Boxes, Edit3, Landmark, PackagePlus, Plus, Save, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { PackagingMaterial, PackagingMaterialForm } from "../types";
import { lps, stockState } from "../lib/format";
import { EmptyWork } from "../ui";

const emptyForm = (): PackagingMaterialForm => ({
  name: "",
  kind: "Bolsa",
  description: "",
  size: "",
  color: "",
  unit: "unidad",
  min_stock: 0,
  unit_cost: 4.59,
  initial_stock: 0,
  payment_account: "bank",
});

export function Packaging({
  materials,
  saveMaterial,
  registerPurchase,
  deleteMaterial,
}: {
  materials: PackagingMaterial[];
  saveMaterial: (form: PackagingMaterialForm, id?: string) => Promise<void>;
  registerPurchase: (material: PackagingMaterial, quantity: number, unitCost: number, paymentAccount: "cash" | "bank") => Promise<void>;
  deleteMaterial: (material: PackagingMaterial) => Promise<void>;
}) {
  const [editing, setEditing] = useState<PackagingMaterial | null>(null);
  const [creating, setCreating] = useState(false);
  const [buying, setBuying] = useState<PackagingMaterial | null>(null);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q ? materials : materials.filter((m) => [m.name, m.internal_code, m.kind, m.size, m.color, m.description].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [materials, query]);
  const stockValue = materials.reduce((sum, material) => sum + material.stock * material.unit_cost, 0);
  const low = materials.filter((material) => stockState(material.stock, material.min_stock) !== "ok").length;

  return (
    <>
      <section className="packaging-summary">
        <div className="inv-stat"><span>Materiales activos</span><strong>{materials.length}</strong></div>
        <div className="inv-stat"><span>Unidades disponibles</span><strong>{materials.reduce((sum, material) => sum + material.stock, 0)}</strong></div>
        <div className={`inv-stat ${low ? "is-warning" : ""}`}><span>Stock bajo</span><strong>{low}</strong></div>
        <div className="inv-stat"><span>Valor de empaque</span><strong>{lps(stockValue)}</strong></div>
      </section>
      <section className="panel full-panel packaging-panel">
        <div className="packaging-toolbar">
          <label className="inv-search"><Boxes size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por material, código, tipo, tamaño o color" /></label>
          <button className="primary-button" onClick={() => setCreating(true)}><Plus size={17} /> Nuevo material</button>
        </div>
        {shown.length === 0 ? <EmptyWork title="Sin materiales de empaque" text="Registra la primera bolsa, caja, etiqueta, papel o cinta que se use en las ventas." /> : (
          <div className="packaging-grid">
            {shown.map((material) => {
              const state = stockState(material.stock, material.min_stock);
              return <article className="packaging-card" key={material.id}>
                <div className="packaging-card-head"><div><span>{material.kind}</span><h3>{material.name}</h3><small>{material.internal_code}</small></div><span className={`stock-badge ${state}`}>{state === "ok" ? "En stock" : "Stock bajo"}</span></div>
                <dl>
                  <div><dt>Presentación</dt><dd>{[material.size, material.color].filter(Boolean).join(" · ") || "Sin especificar"}</dd></div>
                  <div><dt>Costo actual</dt><dd>{lps(material.unit_cost)} / {material.unit}</dd></div>
                  <div><dt>Disponibles</dt><dd><strong>{material.stock}</strong> {material.unit}{material.stock !== 1 ? "es" : ""}</dd></div>
                  <div><dt>Mínimo</dt><dd>{material.min_stock}</dd></div>
                </dl>
                <div className="packaging-card-actions"><button className="secondary-button" onClick={() => setBuying(material)}><PackagePlus size={16} /> Registrar compra</button><button className="icon-button" title="Editar material" onClick={() => setEditing(material)}><Edit3 size={16} /></button><button className="icon-button packaging-delete" title="Eliminar material" onClick={() => void deleteMaterial(material)}><Trash2 size={16} /></button></div>
              </article>;
            })}
          </div>
        )}
      </section>
      {(creating || editing) && <MaterialDrawer material={editing} onClose={() => { setCreating(false); setEditing(null); }} onSave={saveMaterial} />}
      {buying && <PurchaseDrawer material={buying} onClose={() => setBuying(null)} onSave={registerPurchase} />}
    </>
  );
}

function MaterialDrawer({ material, onClose, onSave }: { material: PackagingMaterial | null; onClose: () => void; onSave: (form: PackagingMaterialForm, id?: string) => Promise<void> }) {
  const [form, setForm] = useState<PackagingMaterialForm>(() => material ? { name: material.name, kind: material.kind, description: material.description ?? "", size: material.size ?? "", color: material.color ?? "", unit: material.unit, min_stock: material.min_stock, unit_cost: material.unit_cost, initial_stock: 0, payment_account: "bank" } : emptyForm());
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof PackagingMaterialForm>(key: K, value: PackagingMaterialForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  async function submit() { if (!form.name.trim() || saving) return; setSaving(true); await onSave(form, material?.id); setSaving(false); onClose(); }
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="drawer small-drawer material-drawer" role="dialog" aria-modal="true" aria-labelledby="material-title" onMouseDown={(event) => event.stopPropagation()}>
    <header className="panel-heading"><div><p className="section-label">Materiales de empaque</p><h2 id="material-title">{material ? "Editar material" : "Nuevo material"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></header>
    <div className="material-drawer-body form-grid">
      {!material && <div className="material-auto-code"><span>Código interno</span><strong>Se genera al guardar</strong></div>}
      <label className="span-2">Nombre <em className="req">*</em><input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ej. Bolsa boutique mediana" /></label>
      <label>Tipo<select value={form.kind} onChange={(e) => set("kind", e.target.value)}><option>Bolsa</option><option>Caja</option><option>Etiqueta</option><option>Papel de empaque</option><option>Cinta</option><option>Tarjeta</option><option>Otro</option></select></label>
      <label>Unidad<select value={form.unit} onChange={(e) => set("unit", e.target.value)}><option value="unidad">Unidad</option><option value="rollo">Rollo</option><option value="paquete">Paquete</option><option value="metro">Metro</option></select></label>
      <label>Tamaño / presentación<input value={form.size} onChange={(e) => set("size", e.target.value)} placeholder="Ej. Mediana, 30 x 40 cm" /></label>
      <label>Color<input value={form.color} onChange={(e) => set("color", e.target.value)} placeholder="Ej. Blanco, negro, kraft" /></label>
      <label className="span-2">Detalle<input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Material, acabado o notas internas" /></label>
      <label>Mínimo (alerta)<input type="number" min={0} step="1" value={form.min_stock} onChange={(e) => set("min_stock", Number(e.target.value))} /></label>
      <label>Costo por {form.unit}<div className="money-input"><b>L</b><input type="number" min={0} step="0.01" value={form.unit_cost} onChange={(e) => set("unit_cost", Number(e.target.value))} /></div></label>
      {!material && <><div className="material-section span-2"><strong>Compra inicial</strong><span>El valor queda como activo hasta que se use en una venta.</span></div><label>Unidades compradas<input type="number" min={0} step="1" value={form.initial_stock} onChange={(e) => set("initial_stock", Number(e.target.value))} /></label><label>Pagado desde<select value={form.payment_account} onChange={(e) => set("payment_account", e.target.value as "cash" | "bank")}><option value="bank">Banco</option><option value="cash">Caja</option></select></label></>}
    </div>
    <footer className="drawer-footer"><button className="primary-button wide" disabled={!form.name.trim() || saving} onClick={() => void submit()}><Save size={17} />{saving ? "Guardando..." : material ? "Guardar cambios" : "Registrar material"}</button></footer>
  </aside></div>;
}

function PurchaseDrawer({ material, onClose, onSave }: { material: PackagingMaterial; onClose: () => void; onSave: (material: PackagingMaterial, quantity: number, unitCost: number, paymentAccount: "cash" | "bank") => Promise<void> }) {
  const [quantity, setQuantity] = useState(1); const [unitCost, setUnitCost] = useState(material.unit_cost); const [paymentAccount, setPaymentAccount] = useState<"cash" | "bank">("bank"); const [saving, setSaving] = useState(false);
  async function submit() { if (!quantity || saving) return; setSaving(true); await onSave(material, quantity, unitCost, paymentAccount); setSaving(false); onClose(); }
  const total = quantity * unitCost;
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="drawer small-drawer material-drawer" role="dialog" aria-modal="true" aria-labelledby="material-purchase-title" onMouseDown={(event) => event.stopPropagation()}>
    <header className="panel-heading"><div><p className="section-label">Entrada de empaque</p><h2 id="material-purchase-title">Comprar {material.name}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></header>
    <div className="material-drawer-body form-grid"><div className="material-stock-note span-2"><AlertTriangle size={16} /><span>Existencia actual: <strong>{material.stock} {material.unit}{material.stock !== 1 ? "es" : ""}</strong></span></div><label>Cantidad<input autoFocus type="number" min={1} step="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></label><label>Costo por {material.unit}<div className="money-input"><b>L</b><input type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(Number(e.target.value))} /></div></label><label className="span-2">Cuenta de pago<select value={paymentAccount} onChange={(e) => setPaymentAccount(e.target.value as "cash" | "bank")}><option value="bank">Banco</option><option value="cash">Caja</option></select></label><div className="material-purchase-total span-2"><span>Total de compra</span><strong>{lps(total)}</strong><small>{paymentAccount === "bank" ? "Se acredita Banco" : "Se acredita Caja"}</small></div></div>
    <footer className="drawer-footer"><button className="primary-button wide" disabled={quantity <= 0 || saving} onClick={() => void submit()}>{paymentAccount === "bank" ? <Landmark size={17} /> : <Banknote size={17} />}{saving ? "Registrando..." : "Registrar compra"}</button></footer>
  </aside></div>;
}
