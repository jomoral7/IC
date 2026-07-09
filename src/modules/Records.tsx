import { Download, Plus, Printer, Save, Search, X } from "lucide-react";
import { useState } from "react";
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

export function Kardex({ rows }: { rows: any[] }) {
  return (
    <section className="panel full-panel">
      <div className="panel-heading">
        <div>
          <p className="section-label">Movimientos</p>
          <h2>Kardex de inventario</h2>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyWork title="Sin movimientos" text="Compras, ventas y ajustes generaran el historial aqui." />
      ) : (
        <DataTable
          headers={["Fecha", "SKU", "Producto", "Movimiento", "Cantidad", "Documento"]}
          rows={rows.map((row) => [
            shortDate(row.created_at),
            row.sku,
            row.product_name,
            row.movement_type,
            row.signed_quantity,
            row.document_number ?? "-",
          ])}
        />
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
