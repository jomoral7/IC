import { Download, Plus, Printer, Save, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Party, Product, UserProfile } from "../types";
import { lps, shortDate } from "../lib/format";
import { DataTable, EmptyWork, roleLabel } from "../ui";

export function Invoices({
  documents,
  onDownload,
  onOpen,
}: {
  documents: any[];
  onDownload: (doc: any) => Promise<void>;
  onOpen: (doc: any) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? documents.filter((d) => [d.document_number, d.customer_name].filter(Boolean).join(" ").toLowerCase().includes(q))
    : documents;
  return (
    <section className="panel full-panel">
      <div className="panel-heading">
        <div>
          <p className="section-label">Facturacion</p>
          <h2>Facturas</h2>
        </div>
      </div>
      <div className="inv-search" style={{ marginBottom: 16 }}>
        <Search size={16} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar factura por numero (del QR) o cliente" />
      </div>
      {filtered.length === 0 ? (
        <EmptyWork title="Sin facturas" text="Las ventas emitidas desde POS apareceran aqui." />
      ) : (
        <DataTable
          headers={["No.", "Cliente", "Estado", "Pago", "Total", "Fecha", "Acciones"]}
          rows={filtered.map((doc) => [
            doc.document_number,
            doc.customer_name ?? "Cliente final",
            doc.voided_at ? <span className="stock-badge out">Anulada</span> : <span className="stock-badge ok">Emitida</span>,
            doc.payment_terms === "cash" ? "Contado" : "Credito",
            lps(Number(doc.total)),
            shortDate(doc.created_at),
            <div className="row-actions">
              <button className="icon-action" title="Ver detalle" onClick={() => void onOpen(doc)}>
                <Search size={15} />
              </button>
              <button className="icon-action" title="Generar PDF" onClick={() => void onDownload(doc)}>
                <Printer size={15} />
              </button>
            </div>,
          ])}
        />
      )}
    </section>
  );
}

const MOV_LABEL: Record<string, string> = {
  sale: "Venta",
  purchase: "Compra / entrada",
  adjustment_in: "Ajuste (+)",
  adjustment_out: "Ajuste (-)",
  transfer_in: "Traslado (entra)",
  transfer_out: "Traslado (sale)",
  return: "Devolucion",
};
function movLabel(t: string): string {
  return MOV_LABEL[t] ?? t;
}

export function Kardex({ rows, products }: { rows: any[]; products: Product[] }) {
  const [productId, setProductId] = useState("__all__");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const isAll = productId === "__all__";
  const product = isAll ? null : products.find((p) => p.id === productId) ?? null;

  const inRange = (iso: string) => {
    const d = new Date(iso).toISOString().slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  // Todos los productos: movimientos del rango, mas recientes primero.
  const allRows = useMemo(
    () =>
      rows
        .filter((r) => inRange(r.created_at))
        .slice()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [rows, from, to],
  );

  // Movimientos de ESTE producto, en orden cronologico ascendente.
  const productRows = useMemo(() => {
    if (!product) return [];
    return rows
      .filter((r) => r.sku === product.sku)
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [rows, product]);

  // Saldo corrido (existencias despues de cada movimiento) que termina en el stock actual.
  const withBalance = useMemo(() => {
    if (!product) return [];
    const totalSigned = productRows.reduce((s, r) => s + Number(r.signed_quantity || 0), 0);
    let balance = product.stock - totalSigned; // existencias antes del primer movimiento
    return productRows.map((r) => {
      balance += Number(r.signed_quantity || 0);
      return { ...r, saldo: balance };
    });
  }, [productRows, product]);

  // Filtro por rango de fechas.
  const shown = useMemo(
    () =>
      withBalance.filter((r) => {
        const d = new Date(r.created_at).toISOString().slice(0, 10);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      }),
    [withBalance, from, to],
  );

  const finalBalance = withBalance.length ? withBalance[withBalance.length - 1].saldo : product?.stock ?? 0;

  return (
    <section className="panel full-panel">
      <div className="panel-heading">
        <div>
          <p className="section-label">Movimientos</p>
          <h2>Kardex de inventario</h2>
        </div>
      </div>

      <div className="kardex-filters">
        <label>
          Producto
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="__all__">Todos los productos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {[p.size, p.color].filter(Boolean).join(" ")} ({p.internal_code ?? p.sku})
              </option>
            ))}
          </select>
        </label>
        <label>
          Desde
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Hasta
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {isAll ? (
        allRows.length === 0 ? (
          <EmptyWork title="Sin movimientos" text="No hay movimientos en el rango elegido." />
        ) : (
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Movimiento</th>
                  <th>Documento</th>
                  <th className="num">Entrada</th>
                  <th className="num">Salida</th>
                </tr>
              </thead>
              <tbody>
                {allRows.map((r, i) => {
                  const qty = Number(r.signed_quantity || 0);
                  return (
                    <tr key={i}>
                      <td>{shortDate(r.created_at)}</td>
                      <td>
                        <strong>{r.product_name}</strong> <span className="muted">· {r.sku}</span>
                      </td>
                      <td>{movLabel(r.movement_type)}</td>
                      <td className="muted">{r.document_number ?? "-"}</td>
                      <td className="num" style={{ color: qty > 0 ? "#1f7a4d" : undefined }}>{qty > 0 ? `+${qty}` : ""}</td>
                      <td className="num" style={{ color: qty < 0 ? "#b4231f" : undefined }}>{qty < 0 ? qty : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : !product ? (
        <EmptyWork title="Sin productos" text="Crea productos para ver su kardex." />
      ) : shown.length === 0 ? (
        <EmptyWork title="Sin movimientos" text="Este producto no tiene movimientos en el rango elegido." />
      ) : (
        <>
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Movimiento</th>
                  <th>Documento</th>
                  <th className="num">Entrada</th>
                  <th className="num">Salida</th>
                  <th className="num">Existencias</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => {
                  const qty = Number(r.signed_quantity || 0);
                  return (
                    <tr key={i}>
                      <td>{shortDate(r.created_at)}</td>
                      <td>{movLabel(r.movement_type)}</td>
                      <td className="muted">{r.document_number ?? "-"}</td>
                      <td className="num" style={{ color: qty > 0 ? "#1f7a4d" : undefined }}>{qty > 0 ? `+${qty}` : ""}</td>
                      <td className="num" style={{ color: qty < 0 ? "#b4231f" : undefined }}>{qty < 0 ? qty : ""}</td>
                      <td className="num">
                        <strong>{r.saldo}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="kardex-final">
            Existencias actuales de <strong>{product.name}</strong>: <strong>{finalBalance}</strong>
          </p>
        </>
      )}
    </section>
  );
}

export function Parties({ rows, title }: { rows: Party[]; title: string }) {
  return (
    <section className="panel full-panel">
      <div className="panel-heading">
        <div>
          <p className="section-label">Registro</p>
          <h2>{title}</h2>
        </div>
        <button className="primary-button">
          <Plus size={17} /> Nuevo
        </button>
      </div>
      {rows.length === 0 ? (
        <EmptyWork title={`Sin ${title.toLowerCase()}`} text="El CRUD de terceros queda listo para conectar en esta tabla." />
      ) : (
        <DataTable headers={["Nombre", "Tipo"]} rows={rows.map((row) => [row.name, row.kind])} />
      )}
    </section>
  );
}

export function UsersAdmin({
  users,
  createUser,
}: {
  users: UserProfile[];
  createUser: (payload: { username: string; password: string; full_name: string; role: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", full_name: "", role: "sales" });
  async function submit() {
    await createUser(form);
    setForm({ username: "", password: "", full_name: "", role: "sales" });
    setOpen(false);
  }
  return (
    <>
      <section className="panel full-panel">
        <div className="panel-heading">
          <div>
            <p className="section-label">Accesos privados</p>
            <h2>Usuarios del sistema</h2>
          </div>
          <button className="primary-button" onClick={() => setOpen(true)}>
            <Plus size={17} /> Nuevo usuario
          </button>
        </div>
        <DataTable
          headers={["Nombre", "Usuario", "Perfil", "Estado"]}
          rows={users.map((user) => [
            user.full_name || user.username || user.id,
            user.username ?? "-",
            roleLabel(user.role),
            user.active ? "Activo" : "Inactivo",
          ])}
        />
      </section>
      {open && (
        <div className="drawer-backdrop">
          <aside className="drawer small-drawer">
            <div className="panel-heading">
              <div>
                <p className="section-label">Nuevo acceso</p>
                <h2>Crear usuario</h2>
              </div>
              <button className="icon-button" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="form-grid one">
              <label>
                Nombre
                <input
                  value={form.full_name}
                  onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                  placeholder="Nombre de la persona"
                />
              </label>
              <label>
                Usuario
                <input
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                  placeholder="usuario"
                />
              </label>
              <label>
                Contraseña
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </label>
              <label>
                Perfil
                <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                  <option value="sales">Ventas</option>
                  <option value="warehouse">Inventario</option>
                  <option value="manager">Gerencia</option>
                  <option value="admin">Administrador</option>
                </select>
              </label>
            </div>
            <button className="primary-button wide" disabled={!form.username || !form.password} onClick={() => void submit()}>
              <Save size={18} /> Crear usuario
            </button>
          </aside>
        </div>
      )}
    </>
  );
}

export function Reports({
  products,
  documents,
  kardex,
  exportExcel,
}: {
  products: Product[];
  documents: any[];
  kardex: any[];
  exportExcel: () => void;
}) {
  return (
    <section className="panel full-panel">
      <div className="panel-heading">
        <div>
          <p className="section-label">Descargas</p>
          <h2>Reportes</h2>
        </div>
        <button className="primary-button" onClick={exportExcel}>
          <Download size={17} /> Exportar Excel
        </button>
      </div>
      <DataTable
        headers={["Reporte", "Registros"]}
        rows={[
          ["Inventario", products.length],
          ["Facturas", documents.length],
          ["Kardex", kardex.length],
        ]}
      />
    </section>
  );
}

export function EmptyModule({ title, text }: { title: string; text: string }) {
  return (
    <section className="panel full-panel">
      <div className="panel-heading">
        <div>
          <p className="section-label">En construccion</p>
          <h2>{title}</h2>
        </div>
      </div>
      <EmptyWork title={title} text={text} />
    </section>
  );
}
