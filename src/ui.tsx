import { clsx } from "clsx";
import { useState } from "react";
import type { ReactNode } from "react";

/**
 * Combo escribible: se puede elegir de la lista (un solo clic) o escribir un valor nuevo.
 * El valor es siempre texto libre; las opciones son solo sugerencias.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;

  return (
    <div className="combobox">
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      {open && filtered.length > 0 && (
        <div className="combobox-list">
          {filtered.slice(0, 60).map((o) => (
            <button
              type="button"
              key={o}
              className="combobox-option"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o);
                setOpen(false);
              }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmptyWork({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-work">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

export function LoginScreen({ children, message }: { children?: ReactNode; message?: string }) {
  return (
    <main className="login-screen">
      {children ?? (
        <div className="auth-card">
          <BrandMark />
          <h1>Sistema no configurado</h1>
          <p>{message}</p>
        </div>
      )}
    </main>
  );
}

export function Metric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "warning" | "danger";
}) {
  return (
    <article className={clsx("metric-card", tone)}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-wrap data-table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} data-label={headers[cellIndex] ?? ""}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BrandMark() {
  return (
    <div className="brandmark" aria-label="Inversiones del Caribe">
      <img src="/brand/ic-01.svg" alt="" aria-hidden="true" />
    </div>
  );
}

export function roleLabel(role: string) {
  if (role === "admin") return "Administrador";
  if (role === "manager") return "Gerencia";
  if (role === "warehouse") return "Inventario";
  return "Ventas";
}
