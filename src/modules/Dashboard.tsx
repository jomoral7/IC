import { useMemo, useState } from "react";
import type { Commission, Product, Seller } from "../types";
import { lps } from "../lib/format";
import { EmptyWork } from "../ui";

type Period = "hoy" | "7d" | "mes" | "custom";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function fmtDay(d: Date) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return cur > 0 ? 100 : null;
  return ((cur - prev) / prev) * 100;
}

export function Dashboard({
  products,
  documents,
  salesLines,
  sellers,
  commissions,
  goTo,
}: {
  products: Product[];
  documents: any[];
  salesLines: { product_id: string; name: string; qty: number; revenue: number; cost: number; date: string }[];
  sellers: Seller[];
  commissions: Commission[];
  goTo: (m: string) => void;
}) {
  const [period, setPeriod] = useState<Period>("7d");
  const [cFrom, setCFrom] = useState("");
  const [cTo, setCTo] = useState("");
  const [hover, setHover] = useState<number | null>(null);

  const { from, to, prevFrom, prevTo, bucketBy } = useMemo(() => {
    const now = new Date();
    let f: Date;
    let t: Date = now;
    let bucket: "hour" | "day" = "day";
    if (period === "hoy") {
      f = startOfDay(now);
      bucket = "hour";
    } else if (period === "7d") {
      f = startOfDay(new Date(now.getTime() - 6 * 86400000));
    } else if (period === "mes") {
      f = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      f = cFrom ? new Date(cFrom + "T00:00:00") : startOfDay(new Date(now.getTime() - 6 * 86400000));
      t = cTo ? new Date(cTo + "T23:59:59") : now;
      const days = (t.getTime() - f.getTime()) / 86400000;
      bucket = days <= 1 ? "hour" : "day";
    }
    const len = t.getTime() - f.getTime();
    return { from: f, to: t, prevFrom: new Date(f.getTime() - len), prevTo: new Date(f.getTime()), bucketBy: bucket };
  }, [period, cFrom, cTo]);

  const inRange = (iso: string, a: Date, b: Date) => {
    const d = new Date(iso).getTime();
    return d >= a.getTime() && d <= b.getTime();
  };

  const sales = useMemo(() => documents.filter((d) => d.kind === "sale"), [documents]);
  const curSales = useMemo(() => sales.filter((d) => !d.voided_at && inRange(d.created_at, from, to)), [sales, from, to]);
  const prevSales = useMemo(() => sales.filter((d) => !d.voided_at && inRange(d.created_at, prevFrom, prevTo)), [sales, prevFrom, prevTo]);

  const ventas = curSales.reduce((s, d) => s + Number(d.total || 0), 0);
  const pedidos = curSales.length;
  const ticket = pedidos > 0 ? ventas / pedidos : 0;
  const curLines = salesLines.filter((l) => inRange(l.date, from, to));
  const ganancia = curLines.reduce((s, l) => s + (l.revenue - l.cost), 0);

  const pVentas = prevSales.reduce((s, d) => s + Number(d.total || 0), 0);
  const pPedidos = prevSales.length;
  const pTicket = pPedidos > 0 ? pVentas / pPedidos : 0;
  const pLines = salesLines.filter((l) => inRange(l.date, prevFrom, prevTo));
  const pGanancia = pLines.reduce((s, l) => s + (l.revenue - l.cost), 0);

  const series = useMemo(() => {
    const buckets: { key: string; label: string; ventas: number; pedidos: number; prev: number }[] = [];
    if (bucketBy === "hour") {
      for (let h = 0; h < 24; h++) buckets.push({ key: String(h), label: `${h}:00`, ventas: 0, pedidos: 0, prev: 0 });
      for (const d of curSales) {
        const h = new Date(d.created_at).getHours();
        buckets[h].ventas += Number(d.total || 0);
        buckets[h].pedidos += 1;
      }
      for (const d of prevSales) buckets[new Date(d.created_at).getHours()].prev += Number(d.total || 0);
    } else {
      const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
      for (let i = 0; i < days; i++) {
        const day = new Date(from.getTime() + i * 86400000);
        buckets.push({ key: startOfDay(day).toISOString(), label: fmtDay(day), ventas: 0, pedidos: 0, prev: 0 });
      }
      const idx = (iso: string) => Math.round((startOfDay(new Date(iso)).getTime() - from.getTime()) / 86400000);
      for (const d of curSales) {
        const i = idx(d.created_at);
        if (i >= 0 && i < buckets.length) {
          buckets[i].ventas += Number(d.total || 0);
          buckets[i].pedidos += 1;
        }
      }
      for (const d of prevSales) {
        const i = Math.round((startOfDay(new Date(d.created_at)).getTime() - prevFrom.getTime()) / 86400000);
        if (i >= 0 && i < buckets.length) buckets[i].prev += Number(d.total || 0);
      }
    }
    return buckets;
  }, [curSales, prevSales, bucketBy, from, to, prevFrom]);

  const estados = useMemo(() => {
    const rangeAll = sales.filter((d) => inRange(d.created_at, from, to));
    const pagadas = rangeAll.filter((d) => !d.voided_at && d.payment_terms === "cash").length;
    const credito = rangeAll.filter((d) => !d.voided_at && d.payment_terms === "credit").length;
    const anuladas = rangeAll.filter((d) => d.voided_at).length;
    return [
      { label: "Pagadas", value: pagadas, color: "#1f7a4d" },
      { label: "A credito", value: credito, color: "#d9a13b" },
      { label: "Anuladas", value: anuladas, color: "#b4231f" },
    ];
  }, [sales, from, to]);
  const estadosTotal = estados.reduce((s, e) => s + e.value, 0);

  const topProductos = useMemo(() => {
    const map = new Map<string, { name: string; units: number; revenue: number; variants: Map<string, number> }>();
    for (const l of curLines) {
      const g = map.get(l.name) ?? { name: l.name, units: 0, revenue: 0, variants: new Map() };
      g.units += l.qty;
      g.revenue += l.revenue;
      g.variants.set(l.product_id, (g.variants.get(l.product_id) ?? 0) + l.qty);
      map.set(l.name, g);
    }
    return Array.from(map.values())
      .sort((a, b) => b.units - a.units)
      .slice(0, 5)
      .map((g) => {
        let topVarId = "";
        let max = 0;
        for (const [id, q] of g.variants) if (q > max) { max = q; topVarId = id; }
        const p = products.find((x) => x.id === topVarId);
        const variant = p ? [p.size, p.color].filter(Boolean).join(" / ") : "";
        return { name: g.name, units: g.units, revenue: g.revenue, variant };
      });
  }, [curLines, products]);
  const maxUnits = Math.max(1, ...topProductos.map((p) => p.units));

  const agotados = products.filter((p) => p.stock <= 0);
  const bajos = products.filter((p) => p.stock > 0 && p.stock <= p.min_stock);
  const alertas = [...agotados, ...bajos].slice(0, 5);

  const porVendedor = useMemo(() => {
    const map = new Map<string, { name: string; pedidos: number; total: number }>();
    for (const c of commissions) {
      if (c.status === "cancelled") continue;
      if (!inRange(c.created_at, from, to)) continue;
      const seller = sellers.find((s) => s.id === c.seller_id);
      const g = map.get(c.seller_id) ?? { name: seller?.name ?? "—", pedidos: 0, total: 0 };
      g.pedidos += 1;
      g.total += c.base_amount;
      map.set(c.seller_id, g);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [commissions, sellers, from, to]);

  const hasData = curSales.length > 0;

  return (
    <div className="dash">
      <div className="dash-periods">
        {([["hoy", "Hoy"], ["7d", "Ultimos 7 dias"], ["mes", "Este mes"], ["custom", "Personalizado"]] as [Period, string][]).map(
          ([p, label]) => (
            <button key={p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>
              {label}
            </button>
          ),
        )}
        {period === "custom" && (
          <div className="dash-custom">
            <input type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} />
            <span>a</span>
            <input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} />
          </div>
        )}
      </div>

      <div className="dash-kpis">
        <KpiCard title="Ventas totales" value={lps(ventas)} change={pctChange(ventas, pVentas)} onClick={() => goTo("Facturas")} />
        <KpiCard title="Pedidos" value={String(pedidos)} change={pctChange(pedidos, pPedidos)} onClick={() => goTo("Facturas")} />
        <KpiCard title="Ticket promedio" value={lps(ticket)} change={pctChange(ticket, pTicket)} onClick={() => goTo("Analisis")} />
        <KpiCard title="Ganancia estimada" value={lps(ganancia)} change={pctChange(ganancia, pGanancia)} onClick={() => goTo("Analisis")} />
      </div>

      {!hasData ? (
        <div className="panel full-panel">
          <EmptyWork title="Sin ventas en este periodo" text="Elige otro periodo o registra ventas en el POS para ver el resumen." />
        </div>
      ) : (
        <>
          <div className="dash-row-3">
            <div className="panel dash-chart-panel">
              <div className="dash-panel-head">
                <h3>Evolucion de ventas</h3>
                <span className="dash-hint">Linea punteada = periodo anterior</span>
              </div>
              <SalesChart series={series} hover={hover} setHover={setHover} />
            </div>
            <div className="panel dash-donut-panel">
              <div className="dash-panel-head">
                <h3>Estado de pedidos</h3>
              </div>
              {estadosTotal === 0 ? <p className="fin-empty">Sin pedidos.</p> : <Donut segments={estados} total={estadosTotal} />}
            </div>
          </div>

          <div className="dash-row-4">
            <div className="panel">
              <div className="dash-panel-head">
                <h3>Productos mas vendidos</h3>
                <button className="dash-link" onClick={() => goTo("Analisis")}>Ver reporte</button>
              </div>
              <div className="dash-topprod">
                {topProductos.map((p) => (
                  <div className="dash-prod-row" key={p.name}>
                    <div className="dash-prod-info">
                      <strong>{p.name}</strong>
                      <span>
                        {p.units} u · {lps(p.revenue)}
                        {p.variant ? ` · top: ${p.variant}` : ""}
                      </span>
                      <div className="dash-prod-bar">
                        <div style={{ width: `${(p.units / maxUnits) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="dash-panel-head">
                <h3>Alertas de inventario</h3>
                <button className="dash-link" onClick={() => goTo("Inventario")}>Ir a inventario</button>
              </div>
              <div className="dash-alert-counts">
                <div className="dash-alert-badge low">
                  <strong>{bajos.length}</strong> <span>stock bajo</span>
                </div>
                <div className="dash-alert-badge out">
                  <strong>{agotados.length}</strong> <span>agotados</span>
                </div>
              </div>
              {alertas.length === 0 ? (
                <p className="fin-empty">Todo el inventario esta bien.</p>
              ) : (
                <div className="dash-alert-list">
                  {alertas.map((p) => (
                    <div className="dash-alert-item" key={p.id}>
                      <span>
                        <strong>{p.name}</strong>
                        <em>{[p.color, p.size].filter(Boolean).join(" · ") || "—"}</em>
                      </span>
                      <b className={p.stock <= 0 ? "profit-neg" : ""}>{p.stock} u</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="panel full-panel">
            <div className="dash-panel-head">
              <h3>Ventas por vendedor</h3>
              <button className="dash-link" onClick={() => goTo("Vendedores")}>Ver reporte</button>
            </div>
            {porVendedor.length === 0 ? (
              <p className="fin-empty">Sin ventas con vendedor en el periodo.</p>
            ) : (
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    <th className="num">Pedidos</th>
                    <th className="num">Total vendido</th>
                    <th className="num">Ticket promedio</th>
                  </tr>
                </thead>
                <tbody>
                  {porVendedor.map((v) => (
                    <tr key={v.name}>
                      <td><strong>{v.name}</strong></td>
                      <td className="num">{v.pedidos}</td>
                      <td className="num">{lps(v.total)}</td>
                      <td className="num">{lps(v.pedidos > 0 ? v.total / v.pedidos : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ title, value, change, onClick }: { title: string; value: string; change: number | null; onClick: () => void }) {
  return (
    <button className="dash-kpi" onClick={onClick}>
      <span className="dash-kpi-title">{title}</span>
      <strong className="dash-kpi-value">{value}</strong>
      {change === null ? (
        <em className="dash-kpi-change muted">— sin comparacion</em>
      ) : (
        <em className={`dash-kpi-change ${change >= 0 ? "up" : "down"}`}>
          {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(0)}% vs periodo anterior
        </em>
      )}
    </button>
  );
}

function SalesChart({
  series,
  hover,
  setHover,
}: {
  series: { label: string; ventas: number; pedidos: number; prev: number }[];
  hover: number | null;
  setHover: (i: number | null) => void;
}) {
  const W = 720;
  const H = 240;
  const pad = { l: 8, r: 8, t: 16, b: 24 };
  const max = Math.max(1, ...series.map((s) => Math.max(s.ventas, s.prev)));
  const n = series.length;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const line = (key: "ventas" | "prev") => series.map((s, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(s[key])}`).join(" ");
  const area = `${line("ventas")} L ${x(n - 1)} ${H - pad.b} L ${x(0)} ${H - pad.b} Z`;

  return (
    <div className="dash-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="dash-svg">
        <defs>
          <linearGradient id="dashArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14384c" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#14384c" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#dashArea)" />
        <path d={line("prev")} fill="none" stroke="#98a2ac" strokeWidth="1.5" strokeDasharray="4 4" />
        <path d={line("ventas")} fill="none" stroke="#14384c" strokeWidth="2.5" />
        {series.map((s, i) => (
          <g key={i}>
            {hover === i && <circle cx={x(i)} cy={y(s.ventas)} r="4" fill="#14384c" />}
            <rect
              x={x(i) - (W - pad.l - pad.r) / (2 * Math.max(1, n - 1))}
              y={0}
              width={(W - pad.l - pad.r) / Math.max(1, n - 1)}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
      </svg>
      {hover !== null && series[hover] && (
        <div className="dash-tooltip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <strong>{series[hover].label}</strong>
          <span>{lps(series[hover].ventas)}</span>
          <em>{series[hover].pedidos} pedido(s)</em>
        </div>
      )}
      <div className="dash-xaxis">
        {series.map((s, i) => (
          <span key={i} style={{ opacity: n > 12 && i % 2 !== 0 ? 0 : 1 }}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Donut({ segments, total }: { segments: { label: string; value: number; color: string }[]; total: number }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="dash-donut">
      <svg viewBox="0 0 140 140" className="dash-donut-svg">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#eef0ee" strokeWidth="18" />
        {segments.map((s) => {
          if (s.value === 0) return null;
          const frac = s.value / total;
          const dash = `${frac * C} ${C - frac * C}`;
          const el = (
            <circle
              key={s.label}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="18"
              strokeDasharray={dash}
              strokeDashoffset={-offset * C}
              transform="rotate(-90 70 70)"
            />
          );
          offset += frac;
          return el;
        })}
        <text x="70" y="66" textAnchor="middle" className="dash-donut-total">{total}</text>
        <text x="70" y="84" textAnchor="middle" className="dash-donut-label">pedidos</text>
      </svg>
      <div className="dash-donut-legend">
        {segments.map((s) => (
          <div key={s.label}>
            <span className="dot" style={{ background: s.color }} />
            {s.label}: <strong>{s.value}</strong> ({total > 0 ? Math.round((s.value / total) * 100) : 0}%)
          </div>
        ))}
      </div>
    </div>
  );
}
