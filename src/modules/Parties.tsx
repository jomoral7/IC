import { Edit3, Plus, Save, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Party } from "../types";
import { EmptyWork } from "../ui";

type PartyForm = { name: string; tax_id: string; phone: string };

export function Parties({
  rows,
  title,
  kind,
  onSave,
  onDelete,
}: {
  rows: Party[];
  title: string;
  kind: "customer" | "supplier";
  onSave: (form: PartyForm, kind: "customer" | "supplier", id?: string) => Promise<void>;
  onDelete: (party: Party) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Party | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.name, r.tax_id, r.phone].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [rows, query]);

  const label = kind === "customer" ? "cliente" : "proveedor";

  return (
    <>
      <section className="panel full-panel">
        <div className="inv-toolbar">
          <div className="inv-search">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Buscar ${label} por nombre, RTN o telefono`} />
          </div>
          <div className="inv-actions">
            <button className="primary-button" onClick={() => setCreating(true)}>
              <Plus size={16} /> Nuevo {label}
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyWork title={`Sin ${title.toLowerCase()}`} text={`Agrega tu primer ${label} con el boton de arriba.`} />
        ) : (
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>RTN / Identidad</th>
                  <th>Telefono</th>
                  <th className="actions-col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                    </td>
                    <td className="muted">{r.tax_id || "-"}</td>
                    <td className="muted">{r.phone || "-"}</td>
                    <td className="actions-col">
                      <div className="row-actions">
                        <button title="Editar" onClick={() => setEditing(r)}>
                          <Edit3 size={15} />
                        </button>
                        <button title="Eliminar" className="danger" onClick={() => void onDelete(r)}>
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
        <PartyDrawer
          party={editing}
          label={label}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={(form, id) => onSave(form, kind, id)}
        />
      )}
    </>
  );
}

function PartyDrawer({
  party,
  label,
  onClose,
  onSave,
}: {
  party: Party | null;
  label: string;
  onClose: () => void;
  onSave: (form: PartyForm, id?: string) => Promise<void>;
}) {
  const [form, setForm] = useState<PartyForm>({
    name: party?.name ?? "",
    tax_id: party?.tax_id ?? "",
    phone: party?.phone ?? "",
  });
  const [saving, setSaving] = useState(false);
  const canSave = form.name.trim().length > 0 && !saving;

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    await onSave(form, party?.id);
    setSaving(false);
    onClose();
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer small-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="panel-heading">
          <div>
            <p className="section-label">{party ? `Editar ${label}` : `Nuevo ${label}`}</p>
            <h2>{party ? party.name : `Crear ${label}`}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="form-grid one">
          <label>
            Nombre <em className="req">*</em>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre completo o razon social" />
          </label>
          <label>
            RTN / Identidad
            <input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} placeholder="Opcional" />
          </label>
          <label>
            Telefono
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Opcional" />
          </label>
        </div>
        <button className="primary-button wide" disabled={!canSave} onClick={() => void submit()}>
          <Save size={18} /> {saving ? "Guardando..." : "Guardar"}
        </button>
      </aside>
    </div>
  );
}
