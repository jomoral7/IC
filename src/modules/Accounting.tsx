import { Plus, Save, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Account, AccountType, CashMovement, JournalEntryFull } from "../types";
import { ACCOUNT_TYPE_LABEL } from "../types";
import { lps, shortDate } from "../lib/format";
import { DataTable, EmptyWork } from "../ui";

const SOURCE_LABEL: Record<string, string> = {
  sale: "Venta",
  void: "Anulacion",
  expense: "Gasto",
  income: "Ingreso",
  manual: "Manual",
};

type MovementForm = {
  type: "expense" | "income";
  amount: number;
  category_id: string;
  pay_account_id: string;
  entry_date: string;
  memo: string;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

export function Accounting({
  accounts,
  movements,
  journal,
  registerMovement,
  saveAccount,
}: {
  accounts: Account[];
  movements: CashMovement[];
  journal: JournalEntryFull[];
  registerMovement: (form: MovementForm) => Promise<void>;
  saveAccount: (form: { code: string; name: string; type: AccountType }) => Promise<void>;
}) {
  const [tab, setTab] = useState<
    "movimientos" | "diario" | "mayor" | "resultados" | "balance" | "cuentas"
  >("movimientos");
  const [open, setOpen] = useState(false);
  const [newType, setNewType] = useState<"expense" | "income">("expense");

  // Cuentas de pago (donde entra/sale la plata): caja y banco.
  const payAccounts = useMemo(
    () => accounts.filter((a) => a.system_key === "cash" || a.system_key === "bank"),
    [accounts],
  );
  // Categorias segun tipo de movimiento.
  const categories = useMemo(
    () => accounts.filter((a) => a.is_postable && a.type === (newType === "expense" ? "expense" : "income")),
    [accounts, newType],
  );

  const defaultForm = (): MovementForm => ({
    type: newType,
    amount: 0,
    category_id: categories[0]?.id ?? "",
    pay_account_id: payAccounts.find((a) => a.system_key === "cash")?.id ?? payAccounts[0]?.id ?? "",
    entry_date: todayStr(),
    memo: "",
  });
  const [form, setForm] = useState<MovementForm>(defaultForm);

  function openFor(type: "expense" | "income") {
    setNewType(type);
    const cats = accounts.filter((a) => a.is_postable && a.type === type);
    setForm({
      type,
      amount: 0,
      category_id: cats[0]?.id ?? "",
      pay_account_id: payAccounts.find((a) => a.system_key === "cash")?.id ?? payAccounts[0]?.id ?? "",
      entry_date: todayStr(),
      memo: "",
    });
    setOpen(true);
  }

  async function submit() {
    if (!form.amount || !form.category_id || !form.pay_account_id) return;
    await registerMovement(form);
    setOpen(false);
  }

  const totalIngresos = movements.filter((m) => m.type === "income").reduce((s, m) => s + m.amount, 0);
  const totalGastos = movements.filter((m) => m.type === "expense").reduce((s, m) => s + m.amount, 0);
  const balance = totalIngresos - totalGastos;

  return (
    <section className="panel full-panel">
      <div className="panel-heading">
        <div>
          <p className="section-label">Contabilidad</p>
          <h2>Gastos e ingresos</h2>
        </div>
        <div className="acc-actions">
          <button className="primary-button" onClick={() => openFor("income")}>
            <Plus size={16} /> Ingreso
          </button>
          <button className="danger-button" onClick={() => openFor("expense")}>
            <Plus size={16} /> Gasto
          </button>
        </div>
      </div>

      <div className="acc-summary">
        <div className="acc-card income">
          <span>Ingresos</span>
          <strong>{lps(totalIngresos)}</strong>
        </div>
        <div className="acc-card expense">
          <span>Gastos</span>
          <strong>{lps(totalGastos)}</strong>
        </div>
        <div className={`acc-card ${balance >= 0 ? "income" : "expense"}`}>
          <span>Balance</span>
          <strong>{lps(balance)}</strong>
        </div>
      </div>

      <div className="tab-row">
        <button className={tab === "movimientos" ? "active" : ""} onClick={() => setTab("movimientos")}>
          Movimientos
        </button>
        <button className={tab === "diario" ? "active" : ""} onClick={() => setTab("diario")}>
          Libro Diario
        </button>
        <button className={tab === "mayor" ? "active" : ""} onClick={() => setTab("mayor")}>
          Libro Mayor
        </button>
        <button className={tab === "resultados" ? "active" : ""} onClick={() => setTab("resultados")}>
          Estado de Resultados
        </button>
        <button className={tab === "balance" ? "active" : ""} onClick={() => setTab("balance")}>
          Balance General
        </button>
        <button className={tab === "cuentas" ? "active" : ""} onClick={() => setTab("cuentas")}>
          Catalogo de cuentas
        </button>
      </div>

      {tab === "movimientos" ? (
        movements.length === 0 ? (
          <EmptyWork title="Sin movimientos" text="Registra un gasto o ingreso con los botones de arriba." />
        ) : (
          <DataTable
            headers={["Fecha", "Tipo", "Categoria", "Cuenta", "Detalle", "Monto"]}
            rows={movements.map((m) => [
              shortDate(m.entry_date),
              m.type === "income" ? (
                <span className="stock-badge ok">Ingreso</span>
              ) : (
                <span className="stock-badge out">Gasto</span>
              ),
              m.category_name ?? "-",
              m.pay_account_name ?? "-",
              m.memo ?? "-",
              (() => {
                const signed = m.type === "income" ? m.amount : -m.amount;
                return (
                  <b style={{ color: signed >= 0 ? "#1f7a4d" : "#b4231f" }}>
                    {signed >= 0 ? "+" : "-"} {lps(Math.abs(signed))}
                  </b>
                );
              })(),
            ])}
          />
        )
      ) : tab === "diario" ? (
        <LibroDiario journal={journal} />
      ) : tab === "mayor" ? (
        <LibroMayor journal={journal} />
      ) : tab === "resultados" ? (
        <EstadoResultados journal={journal} />
      ) : tab === "balance" ? (
        <BalanceGeneral journal={journal} />
      ) : (
        <CatalogView accounts={accounts} saveAccount={saveAccount} />
      )}

      {open && (
        <div className="drawer-backdrop">
          <aside className="drawer small-drawer">
            <div className="panel-heading">
              <div>
                <p className="section-label">Nuevo registro</p>
                <h2>{form.type === "income" ? "Registrar ingreso" : "Registrar gasto"}</h2>
              </div>
              <button className="icon-button" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="form-grid one">
              <label>
                Fecha
                <input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
              </label>
              <label>
                Monto (L)
                <input
                  type="number"
                  min={0}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: Math.max(0, Number(e.target.value)) })}
                />
              </label>
              <label>
                {form.type === "income" ? "Categoria de ingreso" : "Categoria de gasto"}
                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {form.type === "income" ? "Entra a" : "Se paga con"}
                <select value={form.pay_account_id} onChange={(e) => setForm({ ...form, pay_account_id: e.target.value })}>
                  {payAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Detalle
                <input
                  value={form.memo}
                  onChange={(e) => setForm({ ...form, memo: e.target.value })}
                  placeholder="Ej. Pago de renta local julio"
                />
              </label>
            </div>
            <button
              className="primary-button wide"
              disabled={!form.amount || !form.category_id || !form.pay_account_id}
              onClick={() => void submit()}
            >
              <Save size={18} /> Guardar {form.type === "income" ? "ingreso" : "gasto"}
            </button>
          </aside>
        </div>
      )}
    </section>
  );
}

function LibroDiario({ journal }: { journal: JournalEntryFull[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? journal.filter((e) =>
        `${e.memo ?? ""} ${SOURCE_LABEL[e.source] ?? e.source} ${e.lines.map((l) => l.account_name).join(" ")}`
          .toLowerCase()
          .includes(q),
      )
    : journal;

  if (journal.length === 0) {
    return <EmptyWork title="Sin asientos" text="Las ventas, gastos e ingresos generaran asientos aqui." />;
  }
  return (
    <>
      <div className="inv-search" style={{ marginBottom: 14 }}>
        <Search size={16} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por cuenta, detalle o tipo" />
      </div>
      <div className="diario-list">
        {filtered.map((e) => {
          const totalDebit = e.lines.reduce((s, l) => s + l.debit, 0);
          return (
            <div className="diario-entry" key={e.id}>
              <div className="diario-head">
                <div>
                  <strong>{shortDate(e.entry_date)}</strong>
                  <span className="diario-memo">{e.memo ?? SOURCE_LABEL[e.source] ?? e.source}</span>
                </div>
                <span className={`stock-badge ${e.source === "void" ? "out" : "ok"}`}>
                  {SOURCE_LABEL[e.source] ?? e.source}
                </span>
              </div>
              <table className="diario-table">
                <thead>
                  <tr>
                    <th>Cuenta</th>
                    <th className="num">Debe</th>
                    <th className="num">Haber</th>
                  </tr>
                </thead>
                <tbody>
                  {e.lines.map((l, i) => (
                    <tr key={i}>
                      <td>
                        <span className="acc-code">{l.account_code}</span> {l.account_name}
                      </td>
                      <td className="num">{l.debit > 0 ? lps(l.debit) : ""}</td>
                      <td className="num">{l.credit > 0 ? lps(l.credit) : ""}</td>
                    </tr>
                  ))}
                  <tr className="diario-total">
                    <td>Totales</td>
                    <td className="num">{lps(totalDebit)}</td>
                    <td className="num">{lps(totalDebit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </>
  );
}

function LibroMayor({ journal }: { journal: JournalEntryFull[] }) {
  const [query, setQuery] = useState("");
  const ledger = useMemo(() => {
    const map = new Map<string, { code: string; name: string; type: string; debit: number; credit: number }>();
    for (const e of journal) {
      for (const l of e.lines) {
        const key = l.account_id;
        const acc = map.get(key) ?? {
          code: l.account_code,
          name: l.account_name,
          type: l.account_type ?? "",
          debit: 0,
          credit: 0,
        };
        acc.debit += l.debit;
        acc.credit += l.credit;
        map.set(key, acc);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [journal]);

  const q = query.trim().toLowerCase();
  const rows = q ? ledger.filter((a) => `${a.code} ${a.name}`.toLowerCase().includes(q)) : ledger;

  if (ledger.length === 0) {
    return <EmptyWork title="Sin movimientos" text="El Libro Mayor se llena con los asientos del Libro Diario." />;
  }

  // Saldo segun el lado normal de la cuenta (debito para activo/gasto, credito para el resto).
  function saldoOf(a: { type: string; debit: number; credit: number }): number {
    return a.type === "asset" || a.type === "expense" ? a.debit - a.credit : a.credit - a.debit;
  }

  return (
    <>
      <div className="inv-search" style={{ marginBottom: 14 }}>
        <Search size={16} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cuenta" />
      </div>
      <DataTable
        headers={["Codigo", "Cuenta", "Debe", "Haber", "Saldo"]}
        rows={rows.map((a) => [
          a.code,
          a.name,
          lps(a.debit),
          lps(a.credit),
          <b>{lps(saldoOf(a))}</b>,
        ])}
      />
    </>
  );
}

// Agrupa las lineas por cuenta dentro de un rango de fechas, devolviendo el neto por tipo.
function accountTotals(journal: JournalEntryFull[], from?: string, to?: string) {
  const map = new Map<string, { code: string; name: string; type: string; debit: number; credit: number }>();
  for (const e of journal) {
    if (from && e.entry_date < from) continue;
    if (to && e.entry_date > to) continue;
    for (const l of e.lines) {
      const acc = map.get(l.account_id) ?? {
        code: l.account_code,
        name: l.account_name,
        type: l.account_type ?? "",
        debit: 0,
        credit: 0,
      };
      acc.debit += l.debit;
      acc.credit += l.credit;
      map.set(l.account_id, acc);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}

const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
const todayISO = () => new Date().toISOString().slice(0, 10);

function EstadoResultados({ journal }: { journal: JournalEntryFull[] }) {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayISO());

  const totals = useMemo(() => accountTotals(journal, from, to), [journal, from, to]);
  const income = totals.filter((a) => a.type === "income").map((a) => ({ ...a, val: a.credit - a.debit }));
  const expense = totals.filter((a) => a.type === "expense").map((a) => ({ ...a, val: a.debit - a.credit }));
  const totalIncome = income.reduce((s, a) => s + a.val, 0);
  const totalExpense = expense.reduce((s, a) => s + a.val, 0);
  const utilidad = totalIncome - totalExpense;

  return (
    <div className="fin-statement">
      <div className="fin-daterange">
        <label>
          Desde
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Hasta
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <div className="fin-section">
        <h3>Ingresos</h3>
        {income.length === 0 ? (
          <p className="fin-empty">Sin ingresos en el periodo.</p>
        ) : (
          income.map((a) => (
            <div className="fin-line" key={a.code}>
              <span>
                <em className="acc-code">{a.code}</em> {a.name}
              </span>
              <b>{lps(a.val)}</b>
            </div>
          ))
        )}
        <div className="fin-subtotal">
          <span>Total ingresos</span>
          <b>{lps(totalIncome)}</b>
        </div>
      </div>

      <div className="fin-section">
        <h3>Costos y gastos</h3>
        {expense.length === 0 ? (
          <p className="fin-empty">Sin gastos en el periodo.</p>
        ) : (
          expense.map((a) => (
            <div className="fin-line" key={a.code}>
              <span>
                <em className="acc-code">{a.code}</em> {a.name}
              </span>
              <b>{lps(a.val)}</b>
            </div>
          ))
        )}
        <div className="fin-subtotal">
          <span>Total costos y gastos</span>
          <b>{lps(totalExpense)}</b>
        </div>
      </div>

      <div className={`fin-result ${utilidad >= 0 ? "pos" : "neg"}`}>
        <span>{utilidad >= 0 ? "Utilidad del periodo" : "Perdida del periodo"}</span>
        <strong>{lps(utilidad)}</strong>
      </div>
    </div>
  );
}

function BalanceGeneral({ journal }: { journal: JournalEntryFull[] }) {
  const [asOf, setAsOf] = useState(todayISO());
  const totals = useMemo(() => accountTotals(journal, undefined, asOf), [journal, asOf]);

  const assets = totals.filter((a) => a.type === "asset").map((a) => ({ ...a, val: a.debit - a.credit }));
  const liabilities = totals.filter((a) => a.type === "liability").map((a) => ({ ...a, val: a.credit - a.debit }));
  const equityAccts = totals.filter((a) => a.type === "equity").map((a) => ({ ...a, val: a.credit - a.debit }));

  const totalAssets = assets.reduce((s, a) => s + a.val, 0);
  const totalLiab = liabilities.reduce((s, a) => s + a.val, 0);
  // Utilidad acumulada (ingresos - gastos) hasta la fecha: forma parte del patrimonio.
  const netIncome =
    totals.filter((a) => a.type === "income").reduce((s, a) => s + (a.credit - a.debit), 0) -
    totals.filter((a) => a.type === "expense").reduce((s, a) => s + (a.debit - a.credit), 0);
  const totalEquity = equityAccts.reduce((s, a) => s + a.val, 0) + netIncome;
  const totalPasPat = totalLiab + totalEquity;
  const cuadra = Math.round((totalAssets - totalPasPat) * 100) === 0;

  return (
    <div className="fin-statement">
      <div className="fin-daterange">
        <label>
          Al dia
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </label>
      </div>

      <div className="fin-section">
        <h3>Activos</h3>
        {assets.map((a) => (
          <div className="fin-line" key={a.code}>
            <span>
              <em className="acc-code">{a.code}</em> {a.name}
            </span>
            <b>{lps(a.val)}</b>
          </div>
        ))}
        <div className="fin-subtotal">
          <span>Total activos</span>
          <b>{lps(totalAssets)}</b>
        </div>
      </div>

      <div className="fin-section">
        <h3>Pasivos</h3>
        {liabilities.length === 0 ? (
          <p className="fin-empty">Sin pasivos.</p>
        ) : (
          liabilities.map((a) => (
            <div className="fin-line" key={a.code}>
              <span>
                <em className="acc-code">{a.code}</em> {a.name}
              </span>
              <b>{lps(a.val)}</b>
            </div>
          ))
        )}
        <div className="fin-subtotal">
          <span>Total pasivos</span>
          <b>{lps(totalLiab)}</b>
        </div>
      </div>

      <div className="fin-section">
        <h3>Patrimonio</h3>
        {equityAccts.map((a) => (
          <div className="fin-line" key={a.code}>
            <span>
              <em className="acc-code">{a.code}</em> {a.name}
            </span>
            <b>{lps(a.val)}</b>
          </div>
        ))}
        <div className="fin-line">
          <span>Utilidad acumulada</span>
          <b>{lps(netIncome)}</b>
        </div>
        <div className="fin-subtotal">
          <span>Total patrimonio</span>
          <b>{lps(totalEquity)}</b>
        </div>
      </div>

      <div className={`fin-result ${cuadra ? "pos" : "neg"}`}>
        <span>Pasivo + Patrimonio</span>
        <strong>{lps(totalPasPat)}</strong>
      </div>
      {!cuadra && (
        <p className="fin-warn">
          Aviso: el balance no cuadra con los activos ({lps(totalAssets)}). Revisa asientos manuales sin contrapartida.
        </p>
      )}
    </div>
  );
}

function CatalogView({
  accounts,
  saveAccount,
}: {
  accounts: Account[];
  saveAccount: (form: { code: string; name: string; type: AccountType }) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ code: string; name: string; type: AccountType }>({
    code: "",
    name: "",
    type: "expense",
  });
  const q = query.trim().toLowerCase();
  const filtered = q
    ? accounts.filter((a) => `${a.code} ${a.name}`.toLowerCase().includes(q))
    : accounts;

  async function submit() {
    if (!form.code.trim() || !form.name.trim()) return;
    await saveAccount({ code: form.code.trim(), name: form.name.trim(), type: form.type });
    setForm({ code: "", name: "", type: "expense" });
    setOpen(false);
  }

  return (
    <>
      <div className="catalog-toolbar">
        <div className="inv-search" style={{ flex: 1 }}>
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cuenta por codigo o nombre" />
        </div>
        <button className="secondary-button" onClick={() => setOpen(true)}>
          <Plus size={16} /> Nueva cuenta
        </button>
      </div>
      <DataTable
        headers={["Codigo", "Cuenta", "Tipo", "Movimiento"]}
        rows={filtered.map((a) => [
          a.code,
          <span style={{ fontWeight: a.is_postable ? 400 : 700 }}>{a.name}</span>,
          ACCOUNT_TYPE_LABEL[a.type],
          a.is_postable ? "Si" : "Agrupacion",
        ])}
      />
      {open && (
        <div className="drawer-backdrop">
          <aside className="drawer small-drawer">
            <div className="panel-heading">
              <div>
                <p className="section-label">Catalogo</p>
                <h2>Nueva cuenta</h2>
              </div>
              <button className="icon-button" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="form-grid one">
              <label>
                Codigo
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Ej. 5210" />
              </label>
              <label>
                Nombre
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Papeleria" />
              </label>
              <label>
                Tipo
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}>
                  <option value="expense">Gasto</option>
                  <option value="income">Ingreso</option>
                  <option value="asset">Activo</option>
                  <option value="liability">Pasivo</option>
                  <option value="equity">Patrimonio</option>
                </select>
              </label>
            </div>
            <button className="primary-button wide" disabled={!form.code.trim() || !form.name.trim()} onClick={() => void submit()}>
              <Save size={18} /> Crear cuenta
            </button>
          </aside>
        </div>
      )}
    </>
  );
}
