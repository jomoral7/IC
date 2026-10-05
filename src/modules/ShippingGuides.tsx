import { Edit3, Plus, Save, Truck, X } from "lucide-react";
import { useState } from "react";
import type { Account, ShippingGuide, ShippingGuideForm } from "../types";
import { lps } from "../lib/format";
import { EmptyWork } from "../ui";

export function ShippingGuides({ guides, accounts, onSave, onReceive, onArchive }: {
  guides: ShippingGuide[]; accounts: Account[];
  onSave: (form: ShippingGuideForm, id?: string) => Promise<boolean>;
  onReceive: (id: string, quantity: number, purchase: boolean, date: string) => Promise<boolean>;
  onArchive: (id: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ShippingGuide | null | undefined>(undefined);
  const [receiving, setReceiving] = useState<ShippingGuide | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [purchase, setPurchase] = useState(true);
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [busy, setBusy] = useState(false);
  const shown = guides.filter(g => g.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  async function receive() {
    if (!receiving || busy || !Number.isInteger(quantity) || quantity <= 0) return;
    setBusy(true);
    try { if (await onReceive(receiving.id, quantity, purchase, date)) setReceiving(null); } finally { setBusy(false); }
  }
  return <section className="panel full-panel">
    <div className="panel-heading"><div><p className="section-label">Envíos</p><h2>Guías de envío</h2></div><button className="primary-button" onClick={() => setEditing(null)}><Plus size={17} />Nueva guía</button></div>
    <p className="mini-note">Compra y cobro al mismo costo. Las compras nuevas generan su partida; las existencias ya contabilizadas se registran sin repetirla.</p>
    <label>Buscar guía<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nombre de la guía" /></label>
    {shown.length === 0 ? <EmptyWork title="Sin guías" text="Crea una guía con su precio y cantidad disponible para seleccionarla en POS." /> : <div className="inv-table-wrap"><table className="inv-table">
      <thead><tr><th>Guía</th><th>Costo / cobro</th><th>Disponibles</th><th>Cuenta por recuperar</th><th>Acciones</th></tr></thead>
      <tbody>{shown.map(g => <tr key={g.id}><td><strong>{g.name}</strong></td><td>{lps(g.price)}</td><td><span className={`stock-badge ${g.stock <= g.min_stock ? "low" : "ok"}`}>{g.stock}</span></td><td>{accounts.find(a => a.id === g.receivable_account_id)?.name ?? "Cuenta no disponible"}</td><td><div className="row-actions"><button className="mini-button" onClick={() => { setQuantity(1); setReceiving(g); }}><Plus size={16} />Agregar</button><button className="icon-button" aria-label={`Editar ${g.name}`} onClick={() => setEditing(g)}><Edit3 size={16} /></button><button className="icon-button" aria-label={`Archivar ${g.name}`} onClick={() => { if (window.confirm(`¿Archivar ${g.name}? Se conservará su historial.`)) void onArchive(g.id); }}><X size={16} /></button></div></td></tr>)}</tbody>
    </table></div>}
    {editing !== undefined && <GuideDrawer guide={editing} accounts={accounts} onSave={onSave} onClose={() => setEditing(undefined)} />}
    {receiving && <div className="drawer-backdrop"><aside className="drawer small-drawer shipping-guide-drawer" role="dialog" aria-modal="true" aria-label="Agregar guías compradas">
      <div className="panel-heading"><div><h2>{receiving.name}</h2><p className="mini-note">Costo por guía: {lps(receiving.price)}</p></div><button className="icon-button" disabled={busy} aria-label="Cerrar" onClick={() => setReceiving(null)}><X size={18} /></button></div>
      <label>Tipo de entrada<select value={purchase ? "purchase" : "existing"} onChange={e=>setPurchase(e.target.value==="purchase")}><option value="purchase">Compra nueva · generar partida</option><option value="existing">Ya contabilizada · solo existencias</option></select></label>
      <label>Cantidad comprada<input autoFocus type="number" min={1} step={1} value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label>
      {purchase && <label>Fecha de compra<input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>}
      <p className="mini-note">{purchase ? `Total pagado desde Banco: ${lps(quantity*receiving.price)}. Debe cuenta por recuperar; Haber Banco.` : "La partida ya existe: esta entrada no genera otra compra."}</p>
      <div className="drawer-footer"><button className="primary-button wide" disabled={busy || quantity <= 0 || !Number.isInteger(quantity) || (purchase && !date)} aria-busy={busy} onClick={() => void receive()}><Truck size={17} />{purchase ? "Registrar compra" : "Agregar existencias"}</button></div>
    </aside></div>}
  </section>;
}

function GuideDrawer({ guide, accounts, onSave, onClose }: { guide: ShippingGuide | null; accounts: Account[]; onSave: (form: ShippingGuideForm,id?: string)=>Promise<boolean>; onClose: ()=>void }) {
  const eligible = accounts.filter(a => a.active && a.is_postable && a.type === "asset" && !["bank","cash"].includes(a.system_key ?? ""));
  const [form,setForm] = useState<ShippingGuideForm>(() => ({ name:guide?.name ?? "", price:guide?.price ?? 0, initial_stock:0, min_stock:guide?.min_stock ?? 0, receivable_account_id:guide?.receivable_account_id ?? "", initial_purchase:true, entry_date:new Date().toLocaleDateString("en-CA") }));
  const [busy,setBusy] = useState(false);
  const valid = !!form.name.trim() && Number.isFinite(form.price) && form.price > 0 && Number.isInteger(form.initial_stock) && form.initial_stock >= 0 && Number.isInteger(form.min_stock) && form.min_stock >= 0 && eligible.some(a=>a.id===form.receivable_account_id) && (!!guide || !form.initial_purchase || form.initial_stock===0 || !!form.entry_date);
  async function save() { if (!valid || busy) return; setBusy(true); try { if (await onSave(form,guide?.id)) onClose(); } finally { setBusy(false); } }
  return <div className="drawer-backdrop"><aside className="drawer small-drawer shipping-guide-drawer" role="dialog" aria-modal="true" aria-label="Registrar guía de envío">
    <div className="panel-heading"><div><p className="section-label">Guías de envío</p><h2>{guide ? "Editar guía" : "Crear guía"}</h2></div><button disabled={busy} className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={18}/></button></div>
    <div className="form-grid two">
      <label className="span-2">Nombre<input autoFocus value={form.name} onChange={e=>setForm({...form,name:e.target.value})} /></label>
      <label>Costo y cobro por guía<input type="number" disabled={!!guide && guide.stock>0} min="0.01" step="0.01" value={form.price} onChange={e=>setForm({...form,price:Number(e.target.value)})}/></label>
      <label>Mínimo para alerta<input type="number" min={0} step={1} value={form.min_stock} onChange={e=>setForm({...form,min_stock:Number(e.target.value)})}/></label>
      {!guide && <><label className="span-2">Tipo de entrada inicial<select value={form.initial_purchase ? "purchase" : "existing"} onChange={e=>setForm({...form,initial_purchase:e.target.value==="purchase"})}><option value="purchase">Compra nueva · generar partida</option><option value="existing">Ya contabilizada · solo existencias</option></select></label><label>Cantidad comprada<input type="number" min={0} step={1} value={form.initial_stock} onChange={e=>setForm({...form,initial_stock:Number(e.target.value)})}/></label>{form.initial_purchase && <label>Fecha de compra<input type="date" value={form.entry_date} onChange={e=>setForm({...form,entry_date:e.target.value})}/></label>}</>}
      <label className="span-2">Cuenta de guías por recuperar<select disabled={!!guide && guide.stock>0} value={form.receivable_account_id} onChange={e=>setForm({...form,receivable_account_id:e.target.value})}><option value="">Selecciona la cuenta</option>{eligible.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
    </div><p className="mini-note">{!guide && form.initial_stock>0 && form.initial_purchase ? `Compra: ${lps(form.initial_stock*form.price)}. Debe cuenta por recuperar; Haber Banco.` : "Las existencias ya contabilizadas no repiten su partida. Al cobrar se registra Debe Banco y Haber cuenta por recuperar."} Si cambia el costo, crea otra referencia para conservar el valor de las guías anteriores.</p>
    <div className="drawer-footer"><button className="primary-button wide" disabled={!valid || busy} aria-busy={busy} onClick={()=>void save()}><Save size={17}/>Guardar guía</button></div>
  </aside></div>;
}
