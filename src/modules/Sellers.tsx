import { Edit3, Plus, Save, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { BonusPayment, Commission, Seller, SellerGoal, UserProfile } from "../types";
import { lps, shortDate } from "../lib/format";
import { EmptyWork } from "../ui";

type SellerForm = { name: string; code: string; phone: string; commissionPct: number; active: boolean; userId: string };

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function sameMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export function Sellers({
  rows,
  users,
  commissions,
  goals,
  bonusPayments,
  onSave,
  onDelete,
  onPayCommission,
  onSaveGoal,
  onDeleteGoal,
  onPayBonus,
  onOpenInvoice,
}: {
  rows: Seller[];
  users: UserProfile[];
  commissions: Commission[];
  goals: SellerGoal[];
  bonusPayments: BonusPayment[];
  onSave: (form: { name: string; code: string; phone: string; commission_rate: number; active: boolean; user_id: string | null }, id?: string) => Promise<void>;
  onDelete: (seller: Seller) => Promise<void>;
  onPayCommission: (commissionId: string) => Promise<void>;
  onSaveGoal: (sellerId: string, form: { name: string; min_sales: number; bonus: number }, id?: string) => Promise<void>;
  onDeleteGoal: (goalId: string) => Promise<void>;
  onPayBonus: (sellerId: string, goalId: string, period: string, sales: number, bonus: number) => Promise<void>;
  onOpenInvoice: (documentId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Seller | null>(null);
  const [creating, setCreating] = useState(false);
  const [panel, setPanel] = useState<Seller | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.name, r.code, r.phone].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [rows, query]);

  function pendingFor(sellerId: string) {
    return commissions
      .filter((c) => c.seller_id === sellerId && c.status === "pending")
      .reduce((s, c) => s + c.commission_amount, 0);
  }

  return (
    <>
      <section className="panel full-panel">
        <div className="inv-toolbar">
          <div className="inv-search">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar vendedor por nombre o codigo" />
          </div>
          <div className="inv-actions">
            <button className="primary-button" onClick={() => setCreating(true)}>
              <Plus size={16} /> Nuevo vendedor
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyWork title="Sin vendedores" text="Registra a tus vendedores con su codigo y % de comision." />
        ) : (
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Codigo</th>
                  <th className="num">Comision</th>
                  <th className="num">Por pagar</th>
                  <th className="center">Estado</th>
                  <th className="actions-col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                    </td>
                    <td className="muted">{r.code}</td>
                    <td className="num">{Math.round(r.commission_rate * 100)}%</td>
                    <td className="num">
                      <strong className={pendingFor(r.id) > 0 ? "profit-neg" : ""}>{lps(pendingFor(r.id))}</strong>
                    </td>
                    <td className="center">
                      <span className={`stock-badge ${r.active ? "ok" : "out"}`}>{r.active ? "Activo" : "Inactivo"}</span>
                    </td>
                    <td className="actions-col">
                      <div className="row-actions">
                        <button className="icon-action" title="Comisiones y metas" onClick={() => setPanel(r)}>
                          <Search size={15} />
                        </button>
                        <button className="icon-action" title="Editar" onClick={() => setEditing(r)}>
                          <Edit3 size={15} />
                        </button>
                        <button className="icon-action danger" title="Eliminar" onClick={() => void onDelete(r)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(creating || editing) && (
        <SellerDrawer
          seller={editing}
          users={users}
          goals={editing ? goals.filter((g) => g.seller_id === editing.id) : []}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={(form, id) =>
            onSave(
              {
                name: form.name,
                code: form.code,
                phone: form.phone,
                commission_rate: form.commissionPct / 100,
                active: form.active,
                user_id: form.userId || null,
              },
              id,
            )
          }
          onSaveGoal={onSaveGoal}
          onDeleteGoal={onDeleteGoal}
        />
      )}

      {panel && (
        <SellerPanel
          seller={panel}
          commissions={commissions.filter((c) => c.seller_id === panel.id)}
          goals={goals.filter((g) => g.seller_id === panel.id && g.active)}
          bonusPayments={bonusPayments.filter((b) => b.seller_id === panel.id)}
          onClose={() => setPanel(null)}
          onPayCommission={onPayCommission}
          onPayBonus={onPayBonus}
          onOpenInvoice={onOpenInvoice}
        />
      )}
    </>
  );
}

function SellerPanel({
  seller,
  commissions,
  goals,
  bonusPayments,
  onClose,
  onPayCommission,
  onPayBonus,
  onOpenInvoice,
}: {
  seller: Seller;
  commissions: Commission[];
  goals: SellerGoal[];
  bonusPayments: BonusPayment[];
  onClose: () => void;
  onPayCommission: (commissionId: string) => Promise<void>;
  onPayBonus: (sellerId: string, goalId: string, period: string, sales: number, bonus: number) => Promise<void>;
  onOpenInvoice: (documentId: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<"pending" | "hold" | "paid" | "goals">("pending");

  const porPagar = commissions.filter((c) => c.status === "pending");
  const enEspera = commissions.filter((c) => c.status === "hold");
  const pagadas = commissions.filter((c) => c.status === "paid");
  const totalPorPagar = porPagar.reduce((s, c) => s + c.commission_amount, 0);

  // Ventas del mes actual (neto) para metas
  const monthSales = commissions
    .filter((c) => c.status !== "cancelled" && sameMonth(c.created_at))
    .reduce((s, c) => s + c.base_amount, 0);
  const period = currentPeriod();

  const list = tab === "pending" ? porPagar : tab === "hold" ? enEspera : pagadas;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="invoice-modal" onClick={(e) => e.stopPropagation()}>
        <div className="invoice-modal-head">
          <div>
            <p className="section-label">Comisiones</p>
            <h2>{seller.name}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="seller-tabs">
          <button className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")}>
            Por pagar ({lps(totalPorPagar)})
          </button>
          <button className={tab === "hold" ? "active" : ""} onClick={() => setTab("hold")}>
            En espera (credito)
          </button>
          <button className={tab === "paid" ? "active" : ""} onClick={() => setTab("paid")}>
            Pagadas
          </button>
          <button className={tab === "goals" ? "active" : ""} onClick={() => setTab("goals")}>
            Metas
          </button>
        </div>

        {tab !== "goals" && (
          <div className="commission-list">
            {list.length === 0 ? (
              <EmptyWork title="Nada aqui" text="No hay comisiones en este estado." />
            ) : (
              list.map((c) => (
                <div className="commission-row" key={c.id}>
                  <div className="commission-info">
                    <strong>#{c.doc?.document_number ?? "—"}</strong>
                    <span>
                      {c.doc?.customer_name ?? "Cliente final"} · {shortDate(c.created_at)} · Venta {lps(c.base_amount)}
                    </span>
                  </div>
                  <b className="commission-amt">{lps(c.commission_amount)}</b>
                  <div className="commission-actions">
                    <button className="mini-button" title="Ver factura" onClick={() => void onOpenInvoice(c.document_id)}>
                      <Search size={14} /> Factura
                    </button>
                    {c.status === "pending" && (
                      <button className="primary-button pay-btn" onClick={() => void onPayCommission(c.id)}>
                        Pagar
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "goals" && (() => {
          const tiers = [...goals].sort((a, b) => a.min_sales - b.min_sales);
          const reached = tiers.filter((g) => monthSales >= g.min_sales);
          const applicable = reached.length ? reached[reached.length - 1] : null;
          const paidThisMonth = bonusPayments.some((b) => b.period === period && b.status === "paid");
          const topMeta = tiers.length ? tiers[tiers.length - 1].min_sales : 0;
          const pct = topMeta > 0 ? Math.min(100, Math.round((monthSales / topMeta) * 100)) : 0;
          return (
            <div className="goals-panel">
              <p className="goals-sales">
                Ventas de este mes: <strong>{lps(monthSales)}</strong>
              </p>
              {tiers.length === 0 ? (
                <EmptyWork title="Sin rangos de bono" text="Agrega los rangos (ej. 20,000 vendidos da 1,000 de bono) desde el editor del vendedor." />
              ) : (
                <>
                  <div className="goal-bar">
                    <div className="goal-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="tier-list">
                    {tiers.map((g) => {
                      const hit = monthSales >= g.min_sales;
                      const isApplicable = applicable?.id === g.id;
                      return (
                        <div className={`tier-row ${hit ? "hit" : ""} ${isApplicable ? "applicable" : ""}`} key={g.id}>
                          <span>Vende {lps(g.min_sales)}</span>
                          <b>Bono {lps(g.bonus)}</b>
                          {isApplicable && <span className="tier-tag">Aplica</span>}
                        </div>
                      );
                    })}
                  </div>
                  {applicable ? (
                    paidThisMonth ? (
                      <p className="adj-result">
                        Bono del mes: <strong>{lps(applicable.bonus)}</strong> · <span className="stock-badge ok">Pagado</span>
                      </p>
                    ) : (
                      <button
                        className="primary-button wide"
                        onClick={() => void onPayBonus(seller.id, applicable.id, period, monthSales, applicable.bonus)}
                      >
                        Pagar bono {lps(applicable.bonus)}
                      </button>
                    )
                  ) : (
                    <p className="adj-result">Aun no alcanza el primer rango de bono.</p>
                  )}
                </>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function SellerDrawer({
  seller,
  users,
  goals,
  onClose,
  onSave,
  onSaveGoal,
  onDeleteGoal,
}: {
  seller: Seller | null;
  users: UserProfile[];
  goals: SellerGoal[];
  onClose: () => void;
  onSave: (form: SellerForm, id?: string) => Promise<void>;
  onSaveGoal: (sellerId: string, form: { name: string; min_sales: number; bonus: number }, id?: string) => Promise<void>;
  onDeleteGoal: (goalId: string) => Promise<void>;
}) {
  const [form, setForm] = useState<SellerForm>({
    name: seller?.name ?? "",
    code: seller?.code ?? "",
    phone: seller?.phone ?? "",
    commissionPct: seller ? Math.round(seller.commission_rate * 100) : 10,
    active: seller?.active ?? true,
    userId: seller?.user_id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [goalName, setGoalName] = useState("");
  const [goalMin, setGoalMin] = useState(0);
  const [goalBonus, setGoalBonus] = useState(0);
  const canSave = form.name.trim().length > 0 && form.code.trim().length > 0 && !saving;

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    await onSave(form, seller?.id);
    setSaving(false);
    onClose();
  }

  async function addGoal() {
    if (!seller || goalMin <= 0 || goalBonus <= 0) return;
    await onSaveGoal(seller.id, { name: goalName.trim() || "Meta", min_sales: goalMin, bonus: goalBonus });
    setGoalName("");
    setGoalMin(0);
    setGoalBonus(0);
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer small-drawer seller-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="panel-heading">
          <div>
            <p className="section-label">{seller ? "Editar vendedor" : "Nuevo vendedor"}</p>
            <h2>{seller ? seller.name : "Crear vendedor"}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="form-grid one">
          <label>
            Nombre <em className="req">*</em>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre del vendedor" />
          </label>
          <label>
            Codigo <em className="req">*</em>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Ej. V001 (unico)" />
          </label>
          <label>
            Telefono
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Opcional" />
          </label>
          <label>
            Comision (%)
            <input
              type="number"
              min={0}
              max={100}
              value={form.commissionPct}
              onChange={(e) => setForm({ ...form, commissionPct: Number(e.target.value) })}
            />
          </label>
          <label>
            Usuario del sistema (para que venda con su login)
            <select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
              <option value="">Sin usuario vinculado</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.username || u.id}
                </option>
              ))}
            </select>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            <span>Vendedor activo</span>
          </label>
        </div>
        <button className="primary-button wide" disabled={!canSave} onClick={() => void submit()}>
          <Save size={18} /> {saving ? "Guardando..." : "Guardar vendedor"}
        </button>

        {seller && (
          <div className="goals-editor">
            <h3>Rangos de bono por ventas del mes</h3>
            {goals.length === 0 && <p className="mini-note">Sin rangos. Ej: 20,000 vendidos → 1,000 de bono; 50,000 → 2,500. Se paga el rango mas alto alcanzado.</p>}
            {goals.map((g) => (
              <div className="goal-line" key={g.id}>
                <div>
                  <strong>{g.name}</strong>
                  <span>
                    Meta {lps(g.min_sales)} · Bono {lps(g.bonus)}
                  </span>
                </div>
                <button className="ticket-remove" title="Quitar meta" onClick={() => void onDeleteGoal(g.id)}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <div className="goal-add">
              <label>
                <span>Etiqueta opcional</span>
                <input value={goalName} onChange={(e) => setGoalName(e.target.value)} placeholder="Ej. Bono nivel 1" />
              </label>
              <label>
                <span>Ventas mínimas (L)</span>
                <input type="number" min={0} value={goalMin || ""} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setGoalMin(Number(e.target.value))} placeholder="Ej. 20,000" />
              </label>
              <label>
                <span>Bono a pagar (L)</span>
                <input type="number" min={0} value={goalBonus || ""} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setGoalBonus(Number(e.target.value))} placeholder="Ej. 1,000" />
              </label>
              <button className="secondary-button" disabled={goalMin <= 0 || goalBonus <= 0} onClick={() => void addGoal()}>
                <Plus size={15} /> Agregar
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
