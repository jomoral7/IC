import { FileText, Search } from "lucide-react";
import { useState } from "react";
import type { BonusPayment, Commission, Seller, SellerGoal } from "../types";
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

function saleDiscount(commission: Commission): number {
  const itemDiscount = commission.doc?.items.reduce((sum, item) => sum + item.discount, 0) ?? 0;
  return itemDiscount + Number(commission.doc?.discount ?? 0);
}

function grossSale(commission: Commission): number {
  return commission.base_amount + saleDiscount(commission);
}

export function MySales({
  sellerName,
  commissions,
  goals,
  bonusPayments,
  onOpenInvoice,
  sellerOptions,
  selectedSellerId,
  onSelectSeller,
}: {
  sellerName: string | null;
  commissions: Commission[];
  goals: SellerGoal[];
  bonusPayments: BonusPayment[];
  onOpenInvoice: (documentId: string) => void;
  sellerOptions?: Seller[];
  selectedSellerId?: string;
  onSelectSeller?: (sellerId: string) => void;
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

  const monthCommissions = commissions.filter((c) => c.status !== "cancelled" && sameMonth(c.created_at));
  const monthNetSales = monthCommissions.reduce((sum, commission) => sum + commission.base_amount, 0);
  const monthDiscounts = monthCommissions.reduce((sum, commission) => sum + saleDiscount(commission), 0);
  const monthGrossSales = monthNetSales + monthDiscounts;
  const period = currentPeriod();

  const tiers = [...goals].sort((a, b) => a.min_sales - b.min_sales);
  const reached = tiers.filter((g) => monthNetSales >= g.min_sales);
  const applicable = reached.length ? reached[reached.length - 1] : null;
  const paidThisMonth = bonusPayments.some((b) => b.period === period && b.status === "paid");
  const topMeta = tiers.length ? tiers[tiers.length - 1].min_sales : 0;
  const pct = topMeta > 0 ? Math.min(100, Math.round((monthNetSales / topMeta) * 100)) : 0;
  const nextTier = tiers.find((g) => monthNetSales < g.min_sales);

  const list = tab === "pending" ? porPagar : tab === "hold" ? enEspera : pagadas;

  return (
    <section className="panel full-panel">
      <div className="panel-heading">
        <div>
          <p className="section-label">Mi cuenta</p>
          <h2>{sellerOptions ? "Ventas por vendedor" : "Mis ventas"} · {sellerName}</h2>
        </div>
        {sellerOptions && onSelectSeller && (
          <label className="seller-view-select">
            <span>Vendedor</span>
            <select value={selectedSellerId} onChange={(event) => onSelectSeller(event.target.value)}>
              {sellerOptions.map((seller) => (
                <option key={seller.id} value={seller.id}>{seller.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="acc-summary my-sales-summary">
        <div className="acc-card sales-equation-card">
          <span>Ventas del mes</span>
          <div className="sales-equation" aria-label={`Venta bruta ${lps(monthGrossSales)}, menos descuentos ${lps(monthDiscounts)}, igual a venta neta ${lps(monthNetSales)}`}>
            <div>
              <small>Venta bruta</small>
              <strong>{lps(monthGrossSales)}</strong>
            </div>
            <b className="sales-equation-sign" aria-hidden="true">−</b>
            <div className="sales-equation-discount">
              <small>Descuentos</small>
              <strong>{lps(monthDiscounts)}</strong>
            </div>
            <b className="sales-equation-sign" aria-hidden="true">=</b>
            <div className="sales-equation-net">
              <small>Venta neta</small>
              <strong>{lps(monthNetSales)}</strong>
            </div>
          </div>
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
                const hit = monthNetSales >= g.min_sales;
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
                    Te faltan <strong>{lps(nextTier.min_sales - monthNetSales)}</strong> para el bono de {lps(nextTier.bonus)}.
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
          list.map((c) => {
            const discount = saleDiscount(c);
            return (
              <div className="commission-row" key={c.id}>
                <div className="commission-info">
                  <strong>#{c.doc?.document_number ?? "—"}</strong>
                  <span>{c.doc?.customer_name ?? "Cliente final"} · {shortDate(c.created_at)}</span>
                  <div className="commission-sale-equation">
                    <span>Venta {lps(grossSale(c))}</span>
                    <b>−</b>
                    <span className="is-discount">Descuento {lps(discount)}</span>
                    <b>=</b>
                    <strong>Venta neta {lps(c.base_amount)}</strong>
                  </div>
                </div>
                <div className="commission-value">
                  <span>Comisión</span>
                  <b className="commission-amt">{lps(c.commission_amount)}</b>
                </div>
                <div className="commission-actions">
                  <button className="mini-button" title="Ver detalle y comision" onClick={() => onOpenInvoice(c.document_id)}>
                    <FileText size={14} /> Ver detalle
                  </button>
                  {c.status === "paid" && <span className="stock-badge ok">Pagada</span>}
                </div>
              </div>
            );
          })
        )}
      </div>
      <p className="mini-note" style={{ marginTop: 10 }}>
        <Search size={12} /> La comision y el bono se calculan sobre la venta neta, despues de descuentos.
      </p>
    </section>
  );
}
