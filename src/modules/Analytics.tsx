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
  const [tab, setTab] = useState<"salud" | "abc" | "mensual" | "estrella" | "flojos">("salud");

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
    const map = new Map<
      string,
      { name: string; code: string | null; units: number; revenue: number; cost: number; profit: number; lastDate: string | null }
    >();
    for (const s of sales) {
      const agg = map.get(s.product_id) ?? { name: s.name, code: s.code, units: 0, revenue: 0, cost: 0, profit: 0, lastDate: null };
      agg.units += s.qty;
      agg.revenue += s.revenue;
      agg.cost += s.cost;
      agg.profit += s.revenue - s.cost;
      if (!agg.lastDate || s.date > agg.lastDate) agg.lastDate = s.date;
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

  // ---- Metricas de decision (retail) ----
  const GRACE_DAYS = 30; // un producto nuevo no se juzga hasta tener este tiempo en tienda
  const DEAD_DAYS = 60; // dias sin venta para considerar stock muerto

  const decision = useMemo(() => {
    // Valor del inventario actual a costo (plata parada).
    const inventoryValue = products.reduce((s, p) => s + p.stock * (p.real_cost || 0), 0);
    const cogs = sales.reduce((s, x) => s + x.cost, 0);
    const grossMargin = sales.reduce((s, x) => s + (x.revenue - x.cost), 0);

    // Cuanto historial hay: desde el primer producto creado o la primera venta.
    const dates = sales.map((s) => new Date(s.date).getTime());
    const createdTimes = products
      .map((p) => (p.created_at ? new Date(p.created_at).getTime() : null))
      .filter((t): t is number => t !== null);
    const allTimes = [...dates, ...createdTimes];
    const earliest = allTimes.length ? Math.min(...allTimes) : Date.now();
    const dataDays = Math.floor((Date.now() - earliest) / 86400000);
    const MIN_HISTORY = 60; // dias minimos para que rotacion/GMROI sean confiables
    const ready = dataDays >= MIN_HISTORY && sales.length > 0;

    // Rotacion anualizada = COGS / inventario * (365 / dias de historial). Solo confiable con historial.
    const spanDays = Math.max(30, dataDays);
    const rotacion = inventoryValue > 0 ? (cogs / inventoryValue) * (365 / spanDays) : 0;
    // GMROI = margen bruto / inventario (cuanta ganancia devuelve cada L invertido)
    const gmroi = inventoryValue > 0 ? grossMargin / inventoryValue : 0;

    // Stock muerto: con stock, ya paso el periodo de gracia, y sin venderse hace >= DEAD_DAYS.
    // Los productos nuevos (menos de GRACE_DAYS en tienda) NO se juzgan.
    const now = Date.now();
    const dead = products
      .filter((p) => p.stock > 0)
      .map((p) => {
        const agg = byProduct.get(p.id);
        const last = agg?.lastDate ? new Date(agg.lastDate).getTime() : null;
        const created = p.created_at ? new Date(p.created_at).getTime() : null;
        const ageDays = created ? Math.floor((now - created) / 86400000) : null;
        // "sin venderse": dias desde la ultima venta; si nunca vendio, la edad en tienda.
        const idleDays = last ? Math.floor((now - last) / 86400000) : ageDays;
        return {
          name: p.name,
          code: p.internal_code ?? p.sku,
          stock: p.stock,
          value: p.stock * (p.real_cost || 0),
          idleDays,
          ageDays,
          neverSold: !last,
        };
      })
      // Solo productos con suficiente tiempo en tienda (o edad desconocida) que llevan mucho sin venderse.
      .filter((d) => (d.ageDays === null || d.ageDays >= GRACE_DAYS) && (d.idleDays === null || d.idleDays >= DEAD_DAYS))
      .sort((a, b) => b.value - a.value);
    const deadValue = dead.reduce((s, d) => s + d.value, 0);

    // ABC: ordenar por ingreso, acumulado. A<=80%, B<=95%, C resto.
    const ranked = Array.from(byProduct.values()).sort((a, b) => b.revenue - a.revenue);
    const totalRev = ranked.reduce((s, r) => s + r.revenue, 0) || 1;
    let cum = 0;
    const abc = ranked.map((r) => {
      cum += r.revenue;
      const cumPct = (cum / totalRev) * 100;
      const cls = cumPct <= 80 ? "A" : cumPct <= 95 ? "B" : "C";
      return { ...r, cumPct, cls, pctOfTotal: (r.revenue / totalRev) * 100 };
    });
    const aList = abc.filter((r) => r.cls === "A");
    const countA = aList.length;
    const revAPct = totalRev > 0 ? (aList.reduce((s, r) => s + r.revenue, 0) / totalRev) * 100 : 0;
    const topA = aList.slice(0, 3).map((r) => r.name);

    return { inventoryValue, cogs, grossMargin, rotacion, gmroi, dead, deadValue, abc, countA, revAPct, topA, ready, dataDays, minHistory: MIN_HISTORY };
  }, [products, sales, byProduct]);

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
        <button className={tab === "salud" ? "active" : ""} onClick={() => setTab("salud")}>
          Salud y decisiones
        </button>
        <button className={tab === "abc" ? "active" : ""} onClick={() => setTab("abc")}>
          Clasificacion ABC
        </button>
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

      {tab === "salud" && <SaludView d={decision} />}
      {tab === "abc" && <AbcView abc={decision.abc} countA={decision.countA} revAPct={decision.revAPct} />}

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

type Decision = {
  inventoryValue: number;
  cogs: number;
  grossMargin: number;
  rotacion: number;
  gmroi: number;
  dead: { name: string; code: string | null; stock: number; value: number; idleDays: number | null; ageDays: number | null; neverSold: boolean }[];
  deadValue: number;
  abc: { name: string; code: string | null; revenue: number; units: number; profit: number; cumPct: number; cls: string; pctOfTotal: number }[];
  countA: number;
  revAPct: number;
  topA: string[];
  ready: boolean;
  dataDays: number;
  minHistory: number;
};

function SaludView({ d }: { d: Decision }) {
  const rotClass = !d.ready ? "" : d.rotacion >= 4 ? "good" : d.rotacion >= 2 ? "mid" : "bad";
  const gmroiClass = !d.ready ? "" : d.gmroi >= 1.5 ? "good" : d.gmroi >= 1 ? "mid" : "bad";
  const faltan = Math.max(0, d.minHistory - d.dataDays);

  // Decisiones sugeridas en lenguaje simple.
  const tips: { tone: "good" | "warn" | "bad"; text: string }[] = [];

  // Si el negocio es muy nuevo, no se juzga rotacion ni GMROI (saldrian distorsionados).
  if (!d.ready) {
    tips.push({
      tone: "warn",
      text: `Tu negocio tiene ${d.dataDays} dia(s) de historial. La rotacion y el GMROI necesitan al menos ${d.minHistory} dias (${faltan} mas) para ser confiables; por ahora no los tomes como veredicto.`,
    });
  }
  if (d.countA > 0) {
    const nombres = d.topA.join(", ") + (d.countA > d.topA.length ? "…" : "");
    tips.push({
      tone: "good",
      text: `Tus productos estrella (clase A): ${nombres}. Generan el ${d.revAPct.toFixed(0)}% de tus ventas — nunca los dejes sin stock.`,
    });
  }
  if (d.dead.length > 0) {
    const nombres = d.dead.slice(0, 3).map((x) => x.name).join(", ") + (d.dead.length > 3 ? "…" : "");
    tips.push({
      tone: "bad",
      text: `Productos parados (30+ dias en tienda, 60+ sin venderse): ${nombres}. Tienen ${lps(d.deadValue)} de tu dinero detenido — considera rebaja, combo o liquidacion.`,
    });
  }
  if (d.ready && d.rotacion > 0 && d.rotacion < 2) {
    tips.push({
      tone: "warn",
      text: `Tu inventario rota solo ${d.rotacion.toFixed(1)} veces al año (lento). Mucha plata dormida: compra menos variedad y repone lo que si gira.`,
    });
  } else if (d.ready && d.rotacion >= 4) {
    tips.push({ tone: "good", text: `Buena rotacion (${d.rotacion.toFixed(1)}x al año): tu stock se convierte en ventas rapido.` });
  }
  if (d.ready && d.gmroi > 0 && d.gmroi < 1) {
    tips.push({
      tone: "bad",
      text: `GMROI de ${lps(d.gmroi)}: cada Lempira en inventario te devuelve menos de 1 en ganancia. Revisa precios o reduce stock lento.`,
    });
  }
  if (tips.length === 0) {
    tips.push({ tone: "warn", text: "Aun no hay suficientes ventas para sugerir decisiones. Sigue registrando y vuelve pronto." });
  }

  return (
    <>
      <div className="kpi-grid">
        <div className={`kpi-card ${rotClass ? `kpi-${rotClass}` : ""}`}>
          <span>Rotacion de inventario</span>
          <strong>{d.ready ? `${d.rotacion.toFixed(1)}x` : "—"}</strong>
          <em>{d.ready ? `veces al año · ${rotClass === "good" ? "rapida" : rotClass === "mid" ? "normal" : "lenta"}` : `recopilando datos (${faltan}d)`}</em>
        </div>
        <div className={`kpi-card ${gmroiClass ? `kpi-${gmroiClass}` : ""}`}>
          <span>GMROI</span>
          <strong>{d.ready ? lps(d.gmroi) : "—"}</strong>
          <em>{d.ready ? "ganancia por L invertido" : `recopilando datos (${faltan}d)`}</em>
        </div>
        <div className="kpi-card">
          <span>Valor de inventario</span>
          <strong>{lps(d.inventoryValue)}</strong>
          <em>dinero en mercaderia (costo)</em>
        </div>
        <div className={`kpi-card ${d.dead.length ? "kpi-bad" : "kpi-good"}`}>
          <span>Stock muerto</span>
          <strong>{d.dead.length}</strong>
          <em>{d.dead.length ? `${lps(d.deadValue)} atrapados` : "sin productos parados"}</em>
        </div>
      </div>

      <h3 className="decisions-title">Decisiones sugeridas</h3>
      <div className="decisions-list">
        {tips.map((t, i) => (
          <div className={`decision-card tone-${t.tone}`} key={i}>
            {t.text}
          </div>
        ))}
      </div>

      {d.dead.length > 0 && (
        <div className="analytics-table" style={{ marginTop: 18 }}>
          <h3 className="decisions-title">Productos parados (candidatos a liquidar)</h3>
          <table className="inv-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="num">Stock</th>
                <th className="num">Dinero atrapado</th>
                <th className="num">Sin venderse</th>
              </tr>
            </thead>
            <tbody>
              {d.dead.slice(0, 15).map((p) => (
                <tr key={p.code ?? p.name}>
                  <td>
                    <strong>{p.name}</strong>
                    <span className="muted"> · {p.code}</span>
                  </td>
                  <td className="num">{p.stock}</td>
                  <td className="num">{lps(p.value)}</td>
                  <td className="num">
                    {p.neverSold
                      ? p.ageDays !== null
                        ? `Nunca (${p.ageDays}d en tienda)`
                        : "Nunca"
                      : `${p.idleDays} dias`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function AbcView({
  abc,
  countA,
  revAPct,
}: {
  abc: Decision["abc"];
  countA: number;
  revAPct: number;
}) {
  if (abc.length === 0) {
    return <EmptyWork title="Sin datos" text="Cuando haya ventas, aqui veras la clasificacion ABC de tus productos." />;
  }
  return (
    <>
      <p className="mini-note">
        Regla 80/20: la clase <b>A</b> son los pocos productos que hacen la mayor parte de tus ventas ({countA} producto(s) = {revAPct.toFixed(0)}%).
        La <b>C</b> son muchos que aportan poco. Prioriza A, vigila B, cuestiona C.
      </p>
      <div className="analytics-table">
        <table className="inv-table">
          <thead>
            <tr>
              <th>Clase</th>
              <th>Producto</th>
              <th className="num">Ventas</th>
              <th className="num">% del total</th>
              <th className="num">Ganancia</th>
            </tr>
          </thead>
          <tbody>
            {abc.map((r) => (
              <tr key={r.code ?? r.name}>
                <td>
                  <span className={`abc-badge abc-${r.cls}`}>{r.cls}</span>
                </td>
                <td>
                  <strong>{r.name}</strong>
                </td>
                <td className="num">{lps(r.revenue)}</td>
                <td className="num">{r.pctOfTotal.toFixed(1)}%</td>
                <td className="num">{lps(r.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
