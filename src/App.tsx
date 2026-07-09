import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Building2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  PackagePlus,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { clsx } from "clsx";
import { isSupabaseConfigured } from "./lib/supabase";

type Role = "Administrador" | "Gerencia" | "Bodega" | "Ventas";

const modules = [
  { label: "Dashboard", icon: LayoutDashboard, roles: ["Administrador", "Gerencia", "Bodega", "Ventas"] },
  { label: "Inventario", icon: Boxes, roles: ["Administrador", "Gerencia", "Bodega"] },
  { label: "Compras", icon: PackagePlus, roles: ["Administrador", "Gerencia", "Bodega"] },
  { label: "Ventas", icon: ShoppingBag, roles: ["Administrador", "Gerencia", "Ventas"] },
  { label: "Movimientos", icon: ClipboardList, roles: ["Administrador", "Gerencia", "Bodega"] },
  { label: "Reportes", icon: BarChart3, roles: ["Administrador", "Gerencia"] },
  { label: "Usuarios", icon: Users, roles: ["Administrador"] },
] satisfies Array<{ label: string; icon: typeof LayoutDashboard; roles: Role[] }>;

const inventory = [
  { sku: "IC-CAM-024", name: "Camisa Oxford Azul", category: "Ropa", stock: 126, min: 40, cost: 340, price: 595, branch: "San Pedro Sula" },
  { sku: "IC-ZAP-118", name: "Zapato Urbano Negro", category: "Calzado", stock: 18, min: 25, cost: 620, price: 1090, branch: "Bodega Central" },
  { sku: "IC-BOL-041", name: "Bolso Casual Arena", category: "Accesorios", stock: 74, min: 20, cost: 255, price: 489, branch: "Tegucigalpa" },
  { sku: "IC-PAN-077", name: "Pantalon Stretch Marino", category: "Ropa", stock: 9, min: 18, cost: 410, price: 760, branch: "San Pedro Sula" },
  { sku: "IC-REL-013", name: "Reloj Ejecutivo IC", category: "Accesorios", stock: 43, min: 12, cost: 840, price: 1490, branch: "Online" },
];

const movementData = [
  { day: "Lun", entradas: 48, salidas: 32 },
  { day: "Mar", entradas: 38, salidas: 46 },
  { day: "Mie", entradas: 52, salidas: 39 },
  { day: "Jue", entradas: 61, salidas: 55 },
  { day: "Vie", entradas: 44, salidas: 67 },
  { day: "Sab", entradas: 73, salidas: 58 },
];

const activities = [
  { type: "entrada", title: "Entrada por compra #OC-1042", detail: "86 unidades recibidas en Bodega Central", time: "09:42" },
  { type: "salida", title: "Venta POS #V-8831", detail: "12 articulos descontados de San Pedro Sula", time: "10:18" },
  { type: "alerta", title: "Stock bajo", detail: "Zapato Urbano Negro bajo minimo permitido", time: "11:05" },
  { type: "entrada", title: "Ajuste autorizado", detail: "Conteo fisico actualizado por rol Bodega", time: "12:12" },
];

export function App() {
  const [role, setRole] = useState<Role>("Administrador");
  const [selectedModule, setSelectedModule] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const visibleModules = useMemo(
    () => modules.filter((module) => module.roles.includes(role)),
    [role],
  );

  const stockValue = inventory.reduce((sum, item) => sum + item.stock * item.cost, 0);
  const lowStock = inventory.filter((item) => item.stock <= item.min).length;
  const margin = Math.round(
    inventory.reduce((sum, item) => sum + (item.price - item.cost) / item.price, 0) /
      inventory.length *
      100,
  );

  return (
    <div className="app-shell">
      <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu">
        <Menu size={20} />
      </button>

      <aside className={clsx("sidebar", sidebarOpen && "is-open")}>
        <div className="sidebar-header">
          <BrandMark />
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menu">
            <X size={18} />
          </button>
        </div>

        <nav className="nav-list">
          {visibleModules.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                className={clsx("nav-item", selectedModule === item.label && "active")}
                onClick={() => {
                  setSelectedModule(item.label);
                  setSidebarOpen(false);
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="security-panel">
          <ShieldCheck size={18} />
          <div>
            <strong>Acceso por rol</strong>
            <span>{role} puede ver {visibleModules.length} modulos</span>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="section-label">Administrador de inventarios</p>
            <h1>{selectedModule}</h1>
          </div>
          <div className="topbar-actions">
            <div className="searchbox">
              <Search size={17} />
              <input placeholder="Buscar SKU, producto o factura" />
            </div>
            <button className="branch-button">
              <Building2 size={17} />
              Todas las sucursales
              <ChevronDown size={16} />
            </button>
            <label className="role-select">
              <LockKeyhole size={16} />
              <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
                <option>Administrador</option>
                <option>Gerencia</option>
                <option>Bodega</option>
                <option>Ventas</option>
              </select>
            </label>
          </div>
        </header>

        {!isSupabaseConfigured && (
          <div className="setup-banner">
            <Settings size={18} />
            Modo local con datos demo. Agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para conectar Supabase.
          </div>
        )}

        <section className="kpi-grid">
          <Metric icon={CircleDollarSign} label="Valor inventario" value={`L ${stockValue.toLocaleString("es-HN")}`} trend="+8.4%" />
          <Metric icon={AlertTriangle} label="Stock bajo" value={`${lowStock} productos`} trend="Revisar hoy" tone="warning" />
          <Metric icon={ArrowDownLeft} label="Compras mes" value="L 184,200" trend="+12 ordenes" />
          <Metric icon={ArrowUpRight} label="Margen promedio" value={`${margin}%`} trend="+3.1 pts" />
        </section>

        <section className="content-grid">
          <div className="panel inventory-panel">
            <div className="panel-heading">
              <div>
                <p className="section-label">Control principal</p>
                <h2>Inventario activo</h2>
              </div>
              <button className="primary-button">
                <PackagePlus size={17} />
                Nueva entrada
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Producto</th>
                    <th>Stock</th>
                    <th>Costo</th>
                    <th>Precio</th>
                    <th>Margen</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((item) => {
                    const itemMargin = Math.round(((item.price - item.cost) / item.price) * 100);
                    const status = item.stock <= item.min ? "Bajo" : "Disponible";
                    return (
                      <tr key={item.sku}>
                        <td className="sku">{item.sku}</td>
                        <td>
                          <strong>{item.name}</strong>
                          <span>{item.category} · {item.branch}</span>
                        </td>
                        <td>{item.stock}</td>
                        <td>L {item.cost.toLocaleString("es-HN")}</td>
                        <td>L {item.price.toLocaleString("es-HN")}</td>
                        <td>{itemMargin}%</td>
                        <td><span className={clsx("status", status === "Bajo" && "low")}>{status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="side-stack">
            <div className="panel chart-panel">
              <div className="panel-heading compact">
                <div>
                  <p className="section-label">Semana actual</p>
                  <h2>Entradas vs salidas</h2>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={movementData}>
                  <CartesianGrid stroke="#e7dcc8" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={30} />
                  <Tooltip cursor={{ fill: "#f6f1e7" }} />
                  <Bar dataKey="entradas" fill="#14384C" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="salidas" fill="#D9A13B" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="panel activity-panel">
              <div className="panel-heading compact">
                <div>
                  <p className="section-label">Auditoria</p>
                  <h2>Movimientos recientes</h2>
                </div>
              </div>
              <div className="activity-list">
                {activities.map((activity) => (
                  <div className="activity" key={`${activity.title}-${activity.time}`}>
                    <span className={clsx("activity-dot", activity.type)} />
                    <div>
                      <strong>{activity.title}</strong>
                      <p>{activity.detail}</p>
                    </div>
                    <time>{activity.time}</time>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="modules-strip">
          <ModuleCard title="Compras" text="Ordenes, recepcion, costos y proveedores." />
          <ModuleCard title="Ventas" text="Facturas, descuentos, devoluciones y utilidad." />
          <ModuleCard title="Usuarios" text="Roles, sucursales, permisos y bitacora." />
        </section>
      </main>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="brandmark" aria-label="Inversiones del Caribe">
      <img src="/brand/ic-01.svg" alt="" aria-hidden="true" />
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  trend,
  tone,
}: {
  icon: typeof CircleDollarSign;
  label: string;
  value: string;
  trend: string;
  tone?: "warning";
}) {
  return (
    <article className={clsx("metric-card", tone)}>
      <div className="metric-icon"><Icon size={20} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{trend}</small>
    </article>
  );
}

function ModuleCard({ title, text }: { title: string; text: string }) {
  return (
    <article className="module-card">
      <ReceiptText size={19} />
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </article>
  );
}
