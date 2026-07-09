import { Edit3, KeyRound, Plus, Power, Save, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { UserProfile } from "../types";
import { EmptyWork, roleLabel } from "../ui";

type UpdatePayload = { id: string; full_name?: string; role?: string; active?: boolean; password?: string };

export function Users({
  users,
  onCreate,
  onUpdate,
}: {
  users: UserProfile[];
  onCreate: (payload: { username: string; password: string; full_name: string; role: string }) => Promise<void>;
  onUpdate: (payload: UpdatePayload) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [resetting, setResetting] = useState<UserProfile | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => [u.full_name, u.username, roleLabel(u.role)].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [users, query]);

  return (
    <>
      <section className="panel full-panel">
        <div className="inv-toolbar">
          <div className="inv-search">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar usuario por nombre, usuario o rol" />
          </div>
          <div className="inv-actions">
            <button className="primary-button" onClick={() => setCreating(true)}>
              <Plus size={16} /> Nuevo usuario
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyWork title="Sin usuarios" text="Crea el primer usuario del sistema." />
        ) : (
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Usuario</th>
                  <th>Perfil</th>
                  <th className="center">Estado</th>
                  <th className="actions-col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.full_name || u.username || u.id}</strong>
                    </td>
                    <td className="muted">{u.username ?? "-"}</td>
                    <td className="muted">{roleLabel(u.role)}</td>
                    <td className="center">
                      <span className={`stock-badge ${u.active ? "ok" : "out"}`}>{u.active ? "Activo" : "Inactivo"}</span>
                    </td>
                    <td className="actions-col">
                      <div className="row-actions">
                        <button title="Editar" onClick={() => setEditing(u)}>
                          <Edit3 size={15} />
                        </button>
                        <button title="Resetear contrasena" onClick={() => setResetting(u)}>
                          <KeyRound size={15} />
                        </button>
                        <button
                          title={u.active ? "Desactivar" : "Activar"}
                          className={u.active ? "danger" : ""}
                          onClick={() => void onUpdate({ id: u.id, active: !u.active })}
                        >
                          <Power size={15} />
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

      {creating && <CreateDrawer onClose={() => setCreating(false)} onCreate={onCreate} />}
      {editing && <EditDrawer user={editing} onClose={() => setEditing(null)} onUpdate={onUpdate} />}
      {resetting && <ResetModal user={resetting} onClose={() => setResetting(null)} onUpdate={onUpdate} />}
    </>
  );
}

function CreateDrawer({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (payload: { username: string; password: string; full_name: string; role: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({ username: "", password: "", full_name: "", role: "sales" });
  const [saving, setSaving] = useState(false);
  const canSave = form.username.trim() !== "" && form.password.length >= 6 && !saving;

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    await onCreate(form);
    setSaving(false);
    onClose();
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer small-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="panel-heading">
          <div>
            <p className="section-label">Nuevo acceso</p>
            <h2>Crear usuario</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="form-grid one">
          <label>
            Nombre
            <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Nombre de la persona" />
          </label>
          <label>
            Usuario <em className="req">*</em>
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="usuario" />
          </label>
          <label>
            Contraseña <em className="req">*</em>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Minimo 6 caracteres" />
          </label>
          <label>
            Perfil
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="sales">Ventas</option>
              <option value="warehouse">Inventario</option>
              <option value="manager">Gerencia</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
        </div>
        <button className="primary-button wide" disabled={!canSave} onClick={() => void submit()}>
          <Save size={18} /> {saving ? "Creando..." : "Crear usuario"}
        </button>
      </aside>
    </div>
  );
}

function EditDrawer({
  user,
  onClose,
  onUpdate,
}: {
  user: UserProfile;
  onClose: () => void;
  onUpdate: (payload: UpdatePayload) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [role, setRole] = useState(user.role);
  const [active, setActive] = useState(user.active);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    await onUpdate({ id: user.id, full_name: fullName, role, active });
    setSaving(false);
    onClose();
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer small-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="panel-heading">
          <div>
            <p className="section-label">Editar usuario</p>
            <h2>{user.username ?? user.full_name}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="form-grid one">
          <label>
            Nombre
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
          <label>
            Perfil
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="sales">Ventas</option>
              <option value="warehouse">Inventario</option>
              <option value="manager">Gerencia</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>Usuario activo</span>
          </label>
        </div>
        <button className="primary-button wide" disabled={saving} onClick={() => void submit()}>
          <Save size={18} /> {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </aside>
    </div>
  );
}

function ResetModal({
  user,
  onClose,
  onUpdate,
}: {
  user: UserProfile;
  onClose: () => void;
  onUpdate: (payload: UpdatePayload) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const canSave = password.length >= 6 && !saving;

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    await onUpdate({ id: user.id, password });
    setSaving(false);
    onClose();
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="qr-modal adjustment-modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-button modal-close" onClick={onClose}>
          <X size={18} />
        </button>
        <p className="section-label">Resetear contrasena</p>
        <h2>{user.full_name || user.username}</h2>
        <div className="form-grid one">
          <label>
            Nueva contrasena
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimo 6 caracteres" />
          </label>
        </div>
        <button className="primary-button wide" disabled={!canSave} onClick={() => void submit()}>
          <KeyRound size={18} /> {saving ? "Aplicando..." : "Cambiar contrasena"}
        </button>
      </div>
    </div>
  );
}
