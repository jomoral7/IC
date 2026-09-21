import { AlertTriangle, Banknote, Boxes, Edit3, Landmark, PackagePlus, Plus, Save, Trash2, Truck, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { PackagingMaterial, PackagingMaterialForm, PackagingStockRequest, Party } from "../types";
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
  requests,
  suppliers,
  saveMaterial,
  createOrder,
  receiveOrder,
  cancelOrder,
  deleteMaterial,
}: {
  materials: PackagingMaterial[];
  requests: PackagingStockRequest[];
  suppliers: Party[];
  saveMaterial: (form: PackagingMaterialForm, id?: string) => Promise<void>;
  createOrder: (material: PackagingMaterial, quantity: number, supplierId: string | null) => Promise<void>;
  receiveOrder: (request: PackagingStockRequest, quantity: number, unitCost: number, paymentAccount: "cash" | "bank") => Promise<void>;
  cancelOrder: (request: PackagingStockRequest) => Promise<void>;
  deleteMaterial: (material: PackagingMaterial) => Promise<void>;
}) {
  const [editing, setEditing] = useState<PackagingMaterial | null>(null);
  const [creating, setCreating] = useState(false);
  const [buying, setBuying] = useState<PackagingMaterial | null>(null);
  const [showOrders, setShowOrders] = useState(false);
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
          <button className={showOrders ? "secondary-button active" : "secondary-button"} onClick={() => setShowOrders((open) => !open)}><Truck size={17} /> Pedidos{requests.length ? ` (${requests.length})` : ""}</button>
          <button className="primary-button" onClick={() => setCreating(true)}><Plus size={17} /> Nuevo material</button>
        </div>
        {showOrders ? <PackagingOrders requests={requests} materials={materials} suppliers={suppliers} onReceive={(request) => {
          const material = materials.find((entry) => entry.id === request.material_id);
          if (material) setBuying(material);
        }} onCancel={cancelOrder} /> : shown.length === 0 ? <EmptyWork title="Sin materiales de empaque" text="Registra la primera bolsa, caja, etiqueta, papel o cinta que se use en las ventas." /> : (
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
                <div className="packaging-card-actions"><button className="secondary-button" onClick={() => setBuying(material)}><Truck size={16} /> Pedir o recibir</button><button className="icon-button" title="Editar material" onClick={() => setEditing(material)}><Edit3 size={16} /></button><button className="icon-button packaging-delete" title="Eliminar material" onClick={() => void deleteMaterial(material)}><Trash2 size={16} /></button></div>
              </article>;
            })}
          </div>
        )}
      </section>
      {(creating || editing) && <MaterialDrawer material={editing} onClose={() => { setCreating(false); setEditing(null); }} onSave={saveMaterial} />}
      {buying && <PackagingOrderDrawer material={buying} requests={requests.filter((request) => request.material_id === buying.id)} suppliers={suppliers} onClose={() => setBuying(null)} onOrder={createOrder} onReceive={receiveOrder} onCancel={cancelOrder} />}
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

function PackagingOrders({ requests, materials, suppliers, onReceive, onCancel }: { requests: PackagingStockRequest[]; materials: PackagingMaterial[]; suppliers: Party[]; onReceive: (request: PackagingStockRequest) => void; onCancel: (request: PackagingStockRequest) => Promise<void> }) {
  if (!requests.length) return <EmptyWork title="Sin pedidos de empaque" text="Desde cada material usa Pedir o recibir para registrar una reposición." />;
  return <div className="packaging-orders">{requests.map((request) => {
    const material = materials.find((entry) => entry.id === request.material_id);
    const supplier = suppliers.find((entry) => entry.id === request.supplier_id);
    const pending = Math.max(0, request.requested_quantity - request.received_quantity);
    return <article key={request.id} className="packaging-order-row"><div><strong>{material?.name ?? "Material"}</strong><span>{supplier?.name ?? "Sin proveedor"} · solicitado {request.requested_quantity} · recibido {request.received_quantity} · pendiente {pending}</span></div><div className="packaging-card-actions"><button className="secondary-button" onClick={() => onReceive(request)}><PackagePlus size={16} /> Recibir</button><button className="icon-button packaging-delete" title="Cancelar pedido" onClick={() => void onCancel(request)}><X size={16} /></button></div></article>;
  })}</div>;
}

function PackagingOrderDrawer({ material, requests, suppliers, onClose, onOrder, onReceive, onCancel }: { material: PackagingMaterial; requests: PackagingStockRequest[]; suppliers: Party[]; onClose: () => void; onOrder: (material: PackagingMaterial, quantity: number, supplierId: string | null) => Promise<void>; onReceive: (request: PackagingStockRequest, quantity: number, unitCost: number, paymentAccount: "cash" | "bank") => Promise<void>; onCancel: (request: PackagingStockRequest) => Promise<void> }) {
  const [tab, setTab] = useState<"order" | "receive">("order");
  const [quantity, setQuantity] = useState(1);
  const [supplierId, setSupplierId] = useState("");
  const [selectedId, setSelectedId] = useState(requests[0]?.id ?? "");
  const selected = requests.find((request) => request.id === selectedId) ?? null;
  const pending = selected ? Math.max(0, selected.requested_quantity - selected.received_quantity) : 0;
  const [receivedQuantity, setReceivedQuantity] = useState(Math.max(1, pending));
  const [unitCost, setUnitCost] = useState(material.unit_cost);
  const [paymentAccount, setPaymentAccount] = useState<"cash" | "bank">("bank");
  const [saving, setSaving] = useState(false);
  function pickRequest(id: string) { setSelectedId(id); const request = requests.find((entry) => entry.id === id); setReceivedQuantity(Math.max(1, (request?.requested_quantity ?? 1) - (request?.received_quantity ?? 0))); }
  async function submitOrder() { if (quantity <= 0 || saving) return; setSaving(true); await onOrder(material, quantity, supplierId || null); setSaving(false); onClose(); }
  async function submitReceive() { if (!selected || receivedQuantity <= 0 || saving) return; setSaving(true); await onReceive(selected, receivedQuantity, unitCost, paymentAccount); setSaving(false); onClose(); }
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="drawer small-drawer material-drawer" role="dialog" aria-modal="true" aria-labelledby="material-purchase-title" onMouseDown={(event) => event.stopPropagation()}>
    <header className="panel-heading"><div><p className="section-label">Reposición de empaque</p><h2 id="material-purchase-title">{material.name}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></header>
    <div className="material-drawer-body form-grid"><div className="material-stock-note span-2"><AlertTriangle size={16} /><span>Existencia actual: <strong>{material.stock} {material.unit}{material.stock !== 1 ? "es" : ""}</strong></span></div><div className="payment-toggle span-2"><button className={tab === "order" ? "active" : ""} onClick={() => setTab("order")}>Pedir</button><button className={tab === "receive" ? "active" : ""} onClick={() => setTab("receive")}>Recibir</button></div>
      {tab === "order" ? <><label className="span-2">Proveedor<select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Sin proveedor</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className="span-2">Cantidad a pedir<input autoFocus type="number" min={1} step="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></label></> : <>{requests.length === 0 ? <p className="mini-note span-2">No hay un pedido pendiente para este material. Primero registra el pedido.</p> : <><label className="span-2">Pedido pendiente<select value={selectedId} onChange={(e) => pickRequest(e.target.value)}>{requests.map((request) => <option key={request.id} value={request.id}>Faltan {Math.max(0, request.requested_quantity - request.received_quantity)} de {request.requested_quantity} {material.unit}</option>)}</select></label><div className="order-receipt-summary span-2"><span>Solicitado<strong>{selected?.requested_quantity ?? 0}</strong></span><span>Recibido<strong>{selected?.received_quantity ?? 0}</strong></span><span>Pendiente<strong>{pending}</strong></span></div><label>Cantidad que llegó<input type="number" min={1} max={pending} value={receivedQuantity} onChange={(e) => setReceivedQuantity(Number(e.target.value))} /></label><label>Costo nuevo por {material.unit}<div className="money-input"><b>L</b><input type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(Number(e.target.value))} /></div></label><label className="span-2">Cuenta de pago<select value={paymentAccount} onChange={(e) => setPaymentAccount(e.target.value as "cash" | "bank")}><option value="bank">Banco</option><option value="cash">Caja</option></select></label><p className="mini-note span-2">El costo nuevo será el vigente para próximos consumos; los consumos anteriores no se modifican.</p></>}</>}</div>
    <footer className="drawer-footer">{tab === "order" ? <button className="primary-button wide" disabled={quantity <= 0 || saving} onClick={() => void submitOrder()}><Truck size={17} />{saving ? "Registrando..." : "Registrar pedido"}</button> : <button className="primary-button wide" disabled={!selected || receivedQuantity <= 0 || saving} onClick={() => void submitReceive()}>{paymentAccount === "bank" ? <Landmark size={17} /> : <Banknote size={17} />}{saving ? "Registrando..." : "Registrar recepción"}</button>}{selected && tab === "receive" && <button className="danger-button wide" onClick={() => void onCancel(selected).then(onClose)}><X size={16} />Cancelar pedido</button>}</footer>
  </aside></div>;
}
