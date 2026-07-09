import { useMemo, useState } from "react";
import type { Product, SalesLine } from "../types";
import { lps } from "../lib/format";
import { EmptyWork } from "../ui";

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

export function Analytics({ products, sales }: { products: Product[]; sales: SalesLine[] }) {
  const [tab, setTab] = useState<"mensual" | "estrella" | "flojos">("mensual");

  // ---- Resumen mensual ----
  const monthly = useMemo(() => {
    const map = new Map<string, { revenue: number; units: number; profit: number }>();
    for (const s of sales) {
      const k = monthKey(s.date);
      const agg = map.get(k) ?? { revenue: 0, units: 0, profit: 0 };
      agg.revenue += s.revenue;
      agg.units += s.qty;
      agg.profit += s.revenue - s.cost;
      map.set(k, agg);
    }
    const rows = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, v]) => ({ key, ...v }));
    // % de cambio respecto al mes anterior
    return rows.map((r, i) => {
      const prev = i > 0 ? rows[i - 1].revenue : 0;
      const pct = prev > 0 ? ((r.revenue - prev) / prev) * 100 : null;
      return { ...r, pct };
    });
  }, [sales]);

  // ---- Por producto ----
  const byProduct = useMemo(() => {
    const map = new Map<string, { name: string; code: string | null; units: number; revenue: number; profit: number }>();
    for (const s of sales) {
      const agg = map.get(s.product_id) ?? { name: s.name, code: s.code, units: 0, revenue: 0, profit: 0 };
      agg.units += s.qty;
      agg.revenue += s.revenue;
      agg.profit += s.revenue - s.cost;
      map.set(s.product_id, agg);
    }
    return map;
  }, [sales]);

  const estrella = useMemo(
    () => Array.from(byProduct.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    [byProduct],
  );

  // Productos flojos: incluye los que NO se han vendido (unidades 0).
  const flojos = useMemo(() => {
    const rows = products.map((p) => {
      const agg = byProduct.get(p.id);
      return {
        name: p.name,
        code: p.internal_code ?? p.sku,
        units: agg?.units ?? 0,
        revenue: agg?.revenue ?? 0,
        stock: p.stock,
      };
    });
    return rows.sort((a, b) => a.units - b.units || a.revenue - b.revenue).slice(0, 10);
  }, [products, byProduct]);

  const maxRevenue = Math.max(1, ...estrella.map((e) => e.revenue));
  const maxMonth = Math.max(1, ...monthly.map((m) => m.revenue));

  const totalRevenue = sales.reduce((s, x) => s + x.revenue, 0);
  const totalUnits = sales.reduce((s, x) => s + x.qty, 0);
  const totalProfit = sales.reduce((s, x) => s + (x.revenue - x.cost), 0);

  if (sales.length === 0) {
    return (
      <section className="panel full-panel">
        <div className="panel-heading">
          <div>
            <p className="section-label">Analisis</p>
            <h2>Analisis de ventas</h2>
          </div>
        </div>
        <EmptyWork title="Sin ventas todavia" text="Cuando hagas ventas en el POS, aqui veras tus tendencias y productos estrella." />
      </section>
    );
  }

  return (
    <section className="panel full-panel">
      <div className="panel-heading">
        <div>
          <p className="section-label">Analisis</p>
          <h2>Analisis de ventas</h2>
        </div>
      </div>

      <div className="acc-summary">
        <div className="acc-card income">
          <span>Ventas totales</span>
          <strong>{lps(totalRevenue)}</strong>
        </div>
        <div className="acc-card">
          <span>Unidades vendidas</span>
          <strong>{totalUnits}</strong>
        </div>
        <div className="acc-card income">
          <span>Ganancia bruta</span>
          <strong>{lps(totalProfit)}</strong>
        </div>
      </div>

      <div className="tab-row">
        <button className={tab === "mensual" ? "active" : ""} onClick={() => setTab("mensual")}>
          Resumen mensual
        </button>
        <button className={tab === "estrella" ? "active" : ""} onClick={() => setTab("estrella")}>
          Productos estrella
        </button>
        <button className={tab === "flojos" ? "active" : ""} onClick={() => setTab("flojos")}>
          Casi no se venden
        </button>
      </div>

      {tab === "mensual" && (
        <div className="analytics-table">
          <table className="inv-table">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="num">Ventas</th>
                <th className="num">Unidades</th>
                <th className="num">Ganancia</th>
                <th className="num">vs mes anterior</th>
                <th>Tendencia</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.key}>
                  <td>
                    <strong>{monthLabel(m.key)}</strong>
                  </td>
                  <td className="num">{lps(m.revenue)}</td>
                  <td className="num">{m.units}</td>
                  <td className="num">{lps(m.profit)}</td>
                  <td className="num">
                    {m.pct === null ? (
                      <span className="muted">—</span>
                    ) : (
                      <span className={m.pct >= 0 ? "profit-pos" : "profit-neg"}>
                        {m.pct >= 0 ? "▲" : "▼"} {Math.abs(m.pct).toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="mini-bar">
                      <div className="mini-bar-fill" style={{ width: `${(m.revenue / maxMonth) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "estrella" && (
        <div className="rank-list">
          {estrella.map((p, i) => (
            <div className="rank-row" key={p.code ?? p.name}>
              <span className="rank-pos">{i + 1}</span>
              <div className="rank-main">
                <div className="rank-head">
                  <strong>{p.name}</strong>
                  <b>{lps(p.revenue)}</b>
                </div>
                <div className="rank-bar">
                  <div className="rank-bar-fill" style={{ width: `${(p.revenue / maxRevenue) * 100}%` }} />
                </div>
                <span className="rank-sub">
                  {p.units} unidades · Ganancia {lps(p.profit)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "flojos" && (
        <div className="analytics-table">
          <p className="mini-note">Productos con menos rotacion (incluye los que aun no se han vendido). Ideas: promocion, descuento o dejar de reponer.</p>
          <table className="inv-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="num">Unidades vendidas</th>
                <th className="num">Ventas</th>
                <th className="num">Stock actual</th>
              </tr>
            </thead>
            <tbody>
              {flojos.map((p) => (
                <tr key={p.code ?? p.name}>
                  <td>
                    <strong>{p.name}</strong>
                    <span className="muted"> · {p.code}</span>
                  </td>
                  <td className="num">
                    {p.units === 0 ? <span className="stock-badge out">0</span> : p.units}
                  </td>
                  <td className="num">{lps(p.revenue)}</td>
                  <td className="num">{p.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
