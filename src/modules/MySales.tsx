import { FileText, Search } from "lucide-react";
import { useState } from "react";
import type { BonusPayment, Commission, SellerGoal } from "../types";
import { lps, shortDate } from "../lib/format";
import { EmptyWork } from "../ui";

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function sameMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export function MySales({
  sellerName,
  commissions,
  goals,
  bonusPayments,
  onOpenInvoice,
}: {
  sellerName: string | null;
  commissions: Commission[];
  goals: SellerGoal[];
  bonusPayments: BonusPayment[];
  onOpenInvoice: (documentId: string) => void;
}) {
  const [tab, setTab] = useState<"pending" | "hold" | "paid">("pending");

  if (!sellerName) {
    return (
      <section className="panel full-panel">
        <div className="panel-heading">
          <div>
            <p className="section-label">Mi cuenta</p>
            <h2>Mis ventas</h2>
          </div>
        </div>
        <EmptyWork title="Sin vendedor vinculado" text="Tu usuario no esta vinculado a un vendedor. Pide a un administrador que lo configure." />
      </section>
    );
  }

  const porPagar = commissions.filter((c) => c.status === "pending");
  const enEspera = commissions.filter((c) => c.status === "hold");
  const pagadas = commissions.filter((c) => c.status === "paid");
  const totalPorPagar = porPagar.reduce((s, c) => s + c.commission_amount, 0);
  const totalPagadas = pagadas.reduce((s, c) => s + c.commission_amount, 0);

  const monthSales = commissions
    .filter((c) => c.status !== "cancelled" && sameMonth(c.created_at))
    .reduce((s, c) => s + c.base_amount, 0);
  const period = currentPeriod();

  const tiers = [...goals].sort((a, b) => a.min_sales - b.min_sales);
  const reached = tiers.filter((g) => monthSales >= g.min_sales);
  const applicable = reached.length ? reached[reached.length - 1] : null;
  const paidThisMonth = bonusPayments.some((b) => b.period === period && b.status === "paid");
  const topMeta = tiers.length ? tiers[tiers.length - 1].min_sales : 0;
  const pct = topMeta > 0 ? Math.min(100, Math.round((monthSales / topMeta) * 100)) : 0;
  const nextTier = tiers.find((g) => monthSales < g.min_sales);

  const list = tab === "pending" ? porPagar : tab === "hold" ? enEspera : pagadas;

  return (
    <section className="panel full-panel">
      <div className="panel-heading">
        <div>
          <p className="section-label">Mi cuenta</p>
          <h2>Mis ventas · {sellerName}</h2>
        </div>
      </div>

      <div className="acc-summary">
        <div className="acc-card">
          <span>Ventas del mes</span>
          <strong>{lps(monthSales)}</strong>
        </div>
        <div className="acc-card income">
          <span>Comision por pagar</span>
          <strong>{lps(totalPorPagar)}</strong>
        </div>
        <div className="acc-card">
          <span>Comision pagada</span>
          <strong>{lps(totalPagadas)}</strong>
        </div>
      </div>

      {/* Metas / bono */}
      <div className="fin-section">
        <h3>Bono del mes</h3>
        {tiers.length === 0 ? (
          <p className="fin-empty">Aun no tienes rangos de bono configurados.</p>
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
                    {isApplicable && <span className="tier-tag">Vas por este</span>}
                  </div>
                );
              })}
            </div>
            {applicable ? (
              <p className="adj-result">
                Bono que alcanzaste: <strong>{lps(applicable.bonus)}</strong> ·{" "}
                {paidThisMonth ? <span className="stock-badge ok">Ya te lo pagaron</span> : <span className="stock-badge out">Pendiente de pago</span>}
              </p>
            ) : (
              <p className="adj-result">
                Aun no alcanzas el primer bono.{" "}
                {nextTier && (
                  <>
                    Te faltan <strong>{lps(nextTier.min_sales - monthSales)}</strong> para el bono de {lps(nextTier.bonus)}.
                  </>
                )}
              </p>
            )}
          </>
        )}
      </div>

      {/* Comisiones */}
      <div className="seller-tabs" style={{ marginTop: 8 }}>
        <button className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")}>
          Por pagar ({lps(totalPorPagar)})
        </button>
        <button className={tab === "hold" ? "active" : ""} onClick={() => setTab("hold")}>
          En espera (credito)
        </button>
        <button className={tab === "paid" ? "active" : ""} onClick={() => setTab("paid")}>
          Pagadas
        </button>
      </div>

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
                <button className="mini-button" title="Ver detalle y comision" onClick={() => onOpenInvoice(c.document_id)}>
                  <FileText size={14} /> Ver detalle
                </button>
                {c.status === "paid" && <span className="stock-badge ok">Pagada</span>}
              </div>
            </div>
          ))
        )}
      </div>
      <p className="mini-note" style={{ marginTop: 10 }}>
        <Search size={12} /> Aqui ves solo tus ventas y comisiones.
      </p>
    </section>
  );
}
