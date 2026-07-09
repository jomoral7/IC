import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Building2,
  ClipboardList,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  LogOut,
  Menu,
  PackagePlus,
  Plus,
  QrCode,
  ReceiptText,
  RotateCcw,
  Save,
  Search,
  ShoppingBag,
  Trash2,
  Truck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { utils, writeFile } from "xlsx";
import { clsx } from "clsx";
import { supabase } from "./lib/supabase";

type ModuleName = (typeof modules)[number]["label"];
type Party = { id: string; name: string; kind: "supplier" | "customer" };
type Location = { id: string; name: string };
type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  barcode: string | null;
  min_stock: number;
  cost: number;
  price: number;
  real_cost: number;
  sale_price: number;
  supplier_id: string | null;
  active: boolean;
  stock: number;
};
type ProductForm = Omit<Product, "id" | "active" | "stock"> & { stock: number };
type CartLine = Product & { qty: number };

const modules = [
  { label: "Dashboard", icon: BarChart3 },
  { label: "POS", icon: ShoppingBag },
  { label: "Inventario", icon: Boxes },
  { label: "Stock bajo", icon: AlertTriangle },
  { label: "Ajustes", icon: RotateCcw },
  { label: "Facturas", icon: ReceiptText },
  { label: "Kardex", icon: ClipboardList },
  { label: "Vendedores", icon: UserRound },
  { label: "Clientes", icon: Users },
  { label: "Proveedores", icon: Truck },
  { label: "Reportes", icon: FileSpreadsheet },
] as const;

const emptyProduct: ProductForm = {
  sku: "",
  name: "",
  category: "",
  barcode: "",
  min_stock: 0,
  cost: 0,
  price: 0,
  real_cost: 0,
  sale_price: 0,
  supplier_id: null,
  stock: 0,
};

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState<ModuleName>("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [customers, setCustomers] = useState<Party[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [kardex, setKardex] = useState<any[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) void loadWorkspace();
  }, [session]);

  async function loadWorkspace() {
    if (!supabase) return;
    setLoading(true);
    const [productRes, stockRes, supplierRes, customerRes, locationRes, documentRes, kardexRes] = await Promise.all([
      supabase.from("products").select("*").eq("active", true).order("name"),
      supabase.from("stock_levels").select("product_id, quantity, location_id"),
      supabase.from("parties").select("id, name, kind").eq("kind", "supplier").order("name"),
      supabase.from("parties").select("id, name, kind").eq("kind", "customer").order("name"),
      supabase.from("inventory_locations").select("id, name").order("name"),
      supabase.from("documents").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("inventory_kardex").select("*").order("created_at", { ascending: false }).limit(100),
    ]);

    if (productRes.error) setNotice(productRes.error.message);
    const stockByProduct = new Map((stockRes.data ?? []).map((row) => [row.product_id, row.quantity]));
    setProducts((productRes.data ?? []).map((product) => ({ ...product, stock: Number(stockByProduct.get(product.id) ?? 0) })));
    setSuppliers((supplierRes.data ?? []) as Party[]);
    setCustomers((customerRes.data ?? []) as Party[]);
    setLocations((locationRes.data ?? []) as Location[]);
    setDocuments(documentRes.data ?? []);
    setKardex(kardexRes.data ?? []);
    setLoading(false);
  }

  async function ensureLocation() {
    if (!supabase) throw new Error("Supabase no configurado");
    if (locations[0]) return locations[0];
    const { data, error } = await supabase.from("inventory_locations").insert({ name: "Bodega Central", kind: "warehouse" }).select("id, name").single();
    if (error) throw error;
    setLocations([data]);
    return data;
  }

  async function saveProduct(form: ProductForm, id?: string) {
    if (!supabase) return;
    const payload = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      category: form.category.trim(),
      barcode: form.barcode || null,
      min_stock: Number(form.min_stock),
      cost: Number(form.real_cost || form.cost),
      price: Number(form.sale_price || form.price),
      real_cost: Number(form.real_cost || form.cost),
      sale_price: Number(form.sale_price || form.price),
      supplier_id: form.supplier_id || null,
      active: true,
    };
    const location = await ensureLocation();
    const { data, error } = id
      ? await supabase.from("products").update(payload).eq("id", id).select("*").single()
      : await supabase.from("products").insert(payload).select("*").single();
    if (error) {
      setNotice(error.message);
      return;
    }
    await supabase.from("stock_levels").upsert({ product_id: data.id, location_id: location.id, quantity: Number(form.stock) });
    setNotice("Producto guardado");
    await loadWorkspace();
  }

  async function deleteProduct(product: Product) {
    if (!supabase) return;
    const ok = window.confirm(`Eliminar ${product.name}? Quedara inactivo para conservar historial.`);
    if (!ok) return;
    const { error } = await supabase.from("products").update({ active: false }).eq("id", product.id);
    if (error) setNotice(error.message);
    await loadWorkspace();
  }

  async function createStockRequest(product: Product) {
    if (!supabase) return;
    const location = await ensureLocation();
    const requested_quantity = Math.max(product.min_stock * 2 - product.stock, 1);
    const { error } = await supabase.from("stock_requests").insert({
      product_id: product.id,
      location_id: location.id,
      min_quantity: product.min_stock,
      current_quantity: product.stock,
      requested_quantity,
      supplier_id: product.supplier_id,
      status: "pending",
    });
    setNotice(error ? error.message : `Pedido creado por ${requested_quantity} unidades`);
  }

  async function registerAdjustment(productId: string, quantityDelta: number, reason: string, notes: string) {
    if (!supabase) return;
    const location = await ensureLocation();
    const { error } = await supabase.from("stock_adjustments").insert({
      product_id: productId,
      location_id: location.id,
      reason,
      quantity_delta: quantityDelta,
      notes,
    });
    if (error) {
      setNotice(error.message);
      return;
    }
    const current = products.find((product) => product.id === productId)?.stock ?? 0;
    await supabase.from("stock_levels").upsert({ product_id: productId, location_id: location.id, quantity: Math.max(0, current + quantityDelta) });
    setNotice("Ajuste registrado");
    await loadWorkspace();
  }

  function addToCart(product: Product) {
    setCart((current) => {
      const existing = current.find((line) => line.id === product.id);
      if (existing) return current.map((line) => line.id === product.id ? { ...line, qty: line.qty + 1 } : line);
      return [...current, { ...product, qty: 1 }];
    });
  }

  async function issueSale(customerId: string | null, paymentTerms: "cash" | "credit") {
    if (!supabase || cart.length === 0) return;
    const location = await ensureLocation();
    const subtotal = cart.reduce((sum, line) => sum + line.qty * line.sale_price, 0);
    const documentNumber = String(Date.now()).slice(-6);
    const { data: document, error } = await supabase.from("documents").insert({
      kind: "sale",
      document_number: documentNumber,
      party_id: customerId || null,
      location_id: location.id,
      status: paymentTerms === "cash" ? "paid" : "issued",
      payment_terms: paymentTerms,
      subtotal,
      total: subtotal,
      paid_amount: paymentTerms === "cash" ? subtotal : 0,
    }).select("*").single();
    if (error) {
      setNotice(error.message);
      return;
    }
    await supabase.from("document_items").insert(cart.map((line) => ({
      document_id: document.id,
      product_id: line.id,
      quantity: line.qty,
      unit_cost: line.real_cost,
      unit_price: line.sale_price,
      line_total: line.qty * line.sale_price,
    })));
    if (paymentTerms === "cash") {
      await supabase.from("payments").insert({ document_id: document.id, amount: subtotal, method: "cash" });
    }
    for (const line of cart) {
      const nextQty = Math.max(0, line.stock - line.qty);
      await supabase.from("stock_levels").upsert({ product_id: line.id, location_id: location.id, quantity: nextQty });
      await supabase.from("inventory_movements").insert({
        product_id: line.id,
        location_id: location.id,
        document_id: document.id,
        movement_type: "sale",
        quantity: line.qty,
        unit_cost: line.real_cost,
        unit_price: line.sale_price,
        notes: `Venta POS ${document.document_number}`,
      });
    }
    setCart([]);
    setNotice(`Factura ${document.document_number} emitida`);
    generateInvoicePdf(document.document_number, subtotal);
    await loadWorkspace();
  }

  function exportExcel() {
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, utils.json_to_sheet(products), "Inventario");
    utils.book_append_sheet(workbook, utils.json_to_sheet(documents), "Facturas");
    utils.book_append_sheet(workbook, utils.json_to_sheet(kardex), "Kardex");
    writeFile(workbook, "inversiones-del-caribe.xlsx");
  }

  function generateInvoicePdf(number = "SIN-GUARDAR", total = cart.reduce((sum, line) => sum + line.qty * line.sale_price, 0)) {
    const pdf = new jsPDF({ unit: "pt", format: "letter" });
    pdf.setFillColor("#FFFFFF");
    pdf.rect(0, 0, 612, 792, "F");
    pdf.setTextColor("#14384C");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setCharSpace(3);
    pdf.text("INVERSIONES", 56, 62);
    pdf.setCharSpace(0);
    pdf.setFontSize(18);
    pdf.text("DEL CARIBE", 56, 84);
    pdf.setFillColor("#D9A13B");
    pdf.rect(170, 77, 6, 6, "F");
    pdf.setFontSize(22);
    pdf.text("FACTURA", 438, 62);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor("#667782");
    pdf.text(`No. ${number} · ${new Date().toLocaleDateString("es-HN")}`, 420, 82);
    pdf.setDrawColor("#14384C");
    pdf.line(56, 135, 556, 135);
    let y = 164;
    cart.forEach((line) => {
      pdf.setTextColor("#0B2533");
      pdf.text(`${line.qty} x ${line.name}`, 56, y);
      pdf.text(`L ${(line.qty * line.sale_price).toLocaleString("es-HN")}`, 482, y);
      y += 25;
    });
    pdf.setFillColor("#F6F1E7");
    pdf.roundedRect(56, 650, 500, 48, 6, 6, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor("#14384C");
    pdf.text("TOTAL", 78, 680);
    pdf.text(`L ${total.toLocaleString("es-HN")}`, 462, 680);
    pdf.setDrawColor("#D9A13B");
    pdf.setLineWidth(4);
    pdf.line(56, 720, 556, 720);
    pdf.save(`factura-${number}.pdf`);
  }

  async function signOut() {
    await supabase?.auth.signOut();
  }

  const filteredProducts = products.filter((product) => [product.sku, product.name, product.category].join(" ").toLowerCase().includes(query.toLowerCase()));
  const lowStock = products.filter((product) => product.stock <= product.min_stock);
  const cartTotal = cart.reduce((sum, line) => sum + line.qty * line.sale_price, 0);

  if (!supabase) return <LoginScreen message="Configura Supabase en .env.local para usar el sistema." />;
  if (loading) return <div className="loading-screen">Cargando sistema...</div>;
  if (!session) return <AuthScreen onDone={() => void loadWorkspace()} />;

  return (
    <div className="app-shell">
      <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button>
      <aside className={clsx("sidebar", sidebarOpen && "is-open")}>
        <div className="sidebar-header">
          <BrandMark />
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menu"><X size={18} /></button>
        </div>
        <nav className="nav-list">
          {modules.map((item) => {
            const Icon = item.icon;
            return <button key={item.label} className={clsx("nav-item", selectedModule === item.label && "active")} onClick={() => { setSelectedModule(item.label); setSidebarOpen(false); }}><Icon size={18} /><span>{item.label}</span></button>;
          })}
        </nav>
        <button className="session-button" onClick={signOut}><LogOut size={17} /> Cerrar sesion</button>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div><p className="section-label">Inversiones del Caribe</p><h1>{selectedModule}</h1></div>
          <div className="topbar-actions">
            <div className="searchbox"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto, cliente, factura o proveedor" /></div>
            <button className="branch-button"><Building2 size={17} /> Todas las sucursales</button>
            <button className="primary-button" onClick={exportExcel}><Download size={17} /> Excel</button>
          </div>
        </header>
        {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice("")}>Cerrar</button></div>}
        {selectedModule === "Dashboard" && <Dashboard products={products} documents={documents} lowStock={lowStock} setSelectedModule={setSelectedModule} />}
        {selectedModule === "POS" && <POS products={filteredProducts} cart={cart} setCart={setCart} addToCart={addToCart} customers={customers} issueSale={issueSale} total={cartTotal} />}
        {selectedModule === "Inventario" && <Inventory products={filteredProducts} suppliers={suppliers} saveProduct={saveProduct} deleteProduct={deleteProduct} createStockRequest={createStockRequest} />}
        {selectedModule === "Stock bajo" && <LowStock products={lowStock} createStockRequest={createStockRequest} />}
        {selectedModule === "Ajustes" && <Adjustments products={products} registerAdjustment={registerAdjustment} />}
        {selectedModule === "Facturas" && <Invoices documents={documents} />}
        {selectedModule === "Kardex" && <Kardex rows={kardex} />}
        {selectedModule === "Clientes" && <Parties rows={customers} title="Clientes" />}
        {selectedModule === "Proveedores" && <Parties rows={suppliers} title="Proveedores" />}
        {selectedModule === "Reportes" && <Reports products={products} documents={documents} kardex={kardex} exportExcel={exportExcel} />}
        {selectedModule === "Vendedores" && <EmptyWork title="Vendedores y comisiones" text="El modelo de vendedores y reglas ya existe en Supabase. El siguiente paso es el CRUD de vendedores y liquidacion de comisiones." />}
      </main>
    </div>
  );
}

function AuthScreen({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");

  async function submit() {
    if (!supabase) return;
    setError("");
    if (mode === "login") {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) setError(loginError.message);
      return;
    }
    const { data, error: signupError } = await supabase.auth.signUp({ email, password });
    if (signupError) {
      setError(signupError.message);
      return;
    }
    if (data.user) {
      const adminProfile = await supabase.from("profiles").insert({ id: data.user.id, full_name: name || email, role: "admin" });
      if (adminProfile.error) {
        await supabase.from("profiles").insert({ id: data.user.id, full_name: name || email, role: "sales" });
      }
      if (!data.session) {
        setError("Usuario creado. Revisa si Supabase pide confirmar el correo antes de entrar.");
        return;
      }
    }
    onDone();
  }

  return (
    <LoginScreen>
      <div className="auth-card">
        <BrandMark />
        <h1>{mode === "login" ? "Entrar al sistema" : "Crear primer usuario"}</h1>
        <p>Inventario, POS, facturacion y Kardex conectados a Supabase.</p>
        {mode === "signup" && <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} /></label>}
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Contrasena<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <div className="error-box">{error}</div>}
        <button className="primary-button wide" onClick={submit}>{mode === "login" ? "Entrar" : "Crear cuenta"}</button>
        <button className="link-button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Crear usuario inicial" : "Ya tengo usuario"}</button>
      </div>
    </LoginScreen>
  );
}

function Dashboard({ products, documents, lowStock, setSelectedModule }: { products: Product[]; documents: any[]; lowStock: Product[]; setSelectedModule: (module: ModuleName) => void }) {
  return (
    <>
      <section className="kpi-grid">
        <Metric label="Productos activos" value={String(products.length)} detail="Catalogo real de Supabase" />
        <Metric label="Stock bajo" value={String(lowStock.length)} detail="Requieren pedido" tone="warning" />
        <Metric label="Facturas" value={String(documents.length)} detail="Ultimos documentos" />
        <Metric label="Valor inventario" value={`L ${products.reduce((sum, product) => sum + product.stock * product.real_cost, 0).toLocaleString("es-HN")}`} detail="Costo real x stock" />
      </section>
      <section className="work-queue">
        <button onClick={() => setSelectedModule("Inventario")}><Boxes size={18} /><strong>Gestionar productos</strong><span>Crear, editar, eliminar y QR.</span></button>
        <button onClick={() => setSelectedModule("POS")}><ShoppingBag size={18} /><strong>Abrir POS</strong><span>Buscar, vender y emitir factura.</span></button>
        <button onClick={() => setSelectedModule("Stock bajo")}><AlertTriangle size={18} /><strong>Reponer stock</strong><span>Crear pedidos por minimo.</span></button>
        <button onClick={() => setSelectedModule("Kardex")}><ClipboardList size={18} /><strong>Ver Kardex</strong><span>Historial real de movimientos.</span></button>
      </section>
    </>
  );
}

function POS({ products, cart, setCart, addToCart, customers, issueSale, total }: { products: Product[]; cart: CartLine[]; setCart: (cart: CartLine[]) => void; addToCart: (product: Product) => void; customers: Party[]; issueSale: (customerId: string | null, terms: "cash" | "credit") => Promise<void>; total: number }) {
  const [customerId, setCustomerId] = useState("");
  const [terms, setTerms] = useState<"cash" | "credit">("cash");
  return (
    <section className="pos-workspace">
      <section className="catalog-panel">
        <div className="panel-heading"><div><p className="section-label">Productos</p><h2>Agregar al ticket</h2></div></div>
        {products.length === 0 ? <EmptyWork title="Sin productos" text="Crea productos en Inventario para vender desde POS." /> : <div className="catalog-list">{products.map((product) => <button key={product.id} onClick={() => addToCart(product)} disabled={product.stock <= 0}><strong>{product.name}</strong><span>{product.sku} · Stock {product.stock}</span><b>L {product.sale_price.toLocaleString("es-HN")}</b></button>)}</div>}
      </section>
      <section className="ticket-panel">
        <div className="panel-heading"><div><p className="section-label">Venta</p><h2>Ticket actual</h2></div><button className="secondary-button" onClick={() => setCart([])}>Limpiar</button></div>
        <div className="ticket-list editable">
          {cart.map((line) => <div className="ticket-line" key={line.id}><div><strong>{line.name}</strong><span>L {line.sale_price} · Stock {line.stock}</span></div><input type="number" min={1} max={line.stock} value={line.qty} onChange={(event) => setCart(cart.map((item) => item.id === line.id ? { ...item, qty: Number(event.target.value) } : item))} /><b>L {(line.qty * line.sale_price).toLocaleString("es-HN")}</b><button onClick={() => setCart(cart.filter((item) => item.id !== line.id))}><X size={16} /></button></div>)}
        </div>
        <div className="total-box"><span>Total</span><strong>L {total.toLocaleString("es-HN")}</strong></div>
      </section>
      <section className="checkout-panel">
        <p className="section-label">Cobro</p>
        <h2>Emitir factura</h2>
        <label>Cliente opcional<select value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Cliente final</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        <label>Condicion<select value={terms} onChange={(event) => setTerms(event.target.value as "cash" | "credit")}><option value="cash">Contado</option><option value="credit">Credito</option></select></label>
        <button className="primary-button wide" disabled={cart.length === 0} onClick={() => void issueSale(customerId || null, terms)}><FileText size={18} /> Facturar y descargar PDF</button>
      </section>
    </section>
  );
}

function Inventory({ products, suppliers, saveProduct, deleteProduct, createStockRequest }: { products: Product[]; suppliers: Party[]; saveProduct: (form: ProductForm, id?: string) => Promise<void>; deleteProduct: (product: Product) => Promise<void>; createStockRequest: (product: Product) => Promise<void> }) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [qrProduct, setQrProduct] = useState<Product | null>(null);
  return (
    <>
      <section className="panel full-panel">
        <div className="panel-heading"><div><p className="section-label">Catalogo</p><h2>Productos</h2></div><button className="primary-button" onClick={() => setCreating(true)}><Plus size={17} /> Nuevo producto</button></div>
        {products.length === 0 ? <EmptyWork title="No hay productos" text="Agrega el primer producto con costo real, precio de venta, minimo y stock inicial." /> : <DataTable headers={["SKU", "Producto", "Stock", "Min", "Costo", "Venta", "Acciones"]} rows={products.map((product) => [product.sku, <><strong>{product.name}</strong><span>{product.category}</span></>, product.stock, product.min_stock, `L ${product.real_cost}`, `L ${product.sale_price}`, <div className="row-actions"><button onClick={() => setEditing(product)}><Edit3 size={15} />Editar</button><button onClick={() => setQrProduct(product)}><QrCode size={15} />QR</button><button onClick={() => void createStockRequest(product)}><PackagePlus size={15} />Pedir</button><button className="danger" onClick={() => void deleteProduct(product)}><Trash2 size={15} />Eliminar</button></div>])} />}
      </section>
      {(creating || editing) && <ProductDrawer product={editing} suppliers={suppliers} onClose={() => { setCreating(false); setEditing(null); }} onSave={saveProduct} />}
      {qrProduct && <QrModal product={qrProduct} onClose={() => setQrProduct(null)} />}
    </>
  );
}

function ProductDrawer({ product, suppliers, onClose, onSave }: { product: Product | null; suppliers: Party[]; onClose: () => void; onSave: (form: ProductForm, id?: string) => Promise<void> }) {
  const [form, setForm] = useState<ProductForm>(product ? { sku: product.sku, name: product.name, category: product.category, barcode: product.barcode, min_stock: product.min_stock, cost: product.cost, price: product.price, real_cost: product.real_cost, sale_price: product.sale_price, supplier_id: product.supplier_id, stock: product.stock } : emptyProduct);
  function set<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  return (
    <div className="drawer-backdrop">
      <aside className="drawer">
        <div className="panel-heading"><div><p className="section-label">{product ? "Editar" : "Nuevo"}</p><h2>Producto</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>
        <div className="form-grid one">
          <label>SKU<input value={form.sku} onChange={(event) => set("sku", event.target.value)} /></label>
          <label>Producto<input value={form.name} onChange={(event) => set("name", event.target.value)} /></label>
          <label>Categoria<input value={form.category} onChange={(event) => set("category", event.target.value)} /></label>
          <label>Codigo de barras<input value={form.barcode ?? ""} onChange={(event) => set("barcode", event.target.value)} /></label>
          <label>Proveedor<select value={form.supplier_id ?? ""} onChange={(event) => set("supplier_id", event.target.value || null)}><option value="">Sin proveedor</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          <div className="split-fields"><label>Stock<input type="number" value={form.stock} onChange={(event) => set("stock", Number(event.target.value))} /></label><label>Minimo<input type="number" value={form.min_stock} onChange={(event) => set("min_stock", Number(event.target.value))} /></label></div>
          <div className="split-fields"><label>Costo real<input type="number" value={form.real_cost} onChange={(event) => set("real_cost", Number(event.target.value))} /></label><label>Precio venta<input type="number" value={form.sale_price} onChange={(event) => set("sale_price", Number(event.target.value))} /></label></div>
        </div>
        <button className="primary-button wide" onClick={() => void onSave(form, product?.id).then(onClose)}><Save size={18} /> Guardar producto</button>
      </aside>
    </div>
  );
}

function QrModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [qr, setQr] = useState("");
  useEffect(() => { QRCode.toDataURL(`SKU:${product.sku}|${product.name}|L${product.sale_price}`).then(setQr); }, [product]);
  return <div className="drawer-backdrop"><div className="qr-modal"><button className="icon-button modal-close" onClick={onClose}><X size={18} /></button><p className="section-label">{product.sku}</p><h2>{product.name}</h2>{qr && <img src={qr} alt={`QR ${product.sku}`} />}<button className="secondary-button" onClick={() => window.print()}><QrCode size={18} /> Imprimir etiqueta</button></div></div>;
}

function LowStock({ products, createStockRequest }: { products: Product[]; createStockRequest: (product: Product) => Promise<void> }) {
  return <section className="panel full-panel"><div className="panel-heading"><div><p className="section-label">Reabastecimiento</p><h2>Stock bajo</h2></div></div>{products.length === 0 ? <EmptyWork title="Sin productos bajo minimo" text="Cuando un producto llegue a su minimo aparecera aqui." /> : <DataTable headers={["SKU", "Producto", "Actual", "Minimo", "Sugerido", "Accion"]} rows={products.map((product) => [product.sku, product.name, product.stock, product.min_stock, Math.max(product.min_stock * 2 - product.stock, 1), <button className="mini-button" onClick={() => void createStockRequest(product)}><PackagePlus size={15} />Crear pedido</button>])} />}</section>;
}

function Adjustments({ products, registerAdjustment }: { products: Product[]; registerAdjustment: (productId: string, quantityDelta: number, reason: string, notes: string) => Promise<void> }) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(-1);
  const [reason, setReason] = useState("damaged");
  const [notes, setNotes] = useState("");
  return <section className="panel full-panel"><div className="panel-heading"><div><p className="section-label">Inventario</p><h2>Ajuste manual</h2></div></div><div className="form-grid"><label>Producto<select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Seleccionar</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></label><label>Motivo<select value={reason} onChange={(event) => setReason(event.target.value)}><option value="damaged">Dañado</option><option value="return">Devolucion</option><option value="manual_count">Conteo fisico</option><option value="lost">Perdida</option></select></label><label>Cantidad +/-<input type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label></div><label>Notas<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Detalle del ajuste" /></label><button className="primary-button" disabled={!productId || quantity === 0} onClick={() => void registerAdjustment(productId, quantity, reason, notes)}><Save size={18} /> Registrar ajuste</button></section>;
}

function Invoices({ documents }: { documents: any[] }) {
  return <section className="panel full-panel"><div className="panel-heading"><div><p className="section-label">Facturacion</p><h2>Facturas</h2></div></div>{documents.length === 0 ? <EmptyWork title="Sin facturas" text="Las ventas emitidas desde POS apareceran aqui." /> : <DataTable headers={["No.", "Tipo", "Estado", "Pago", "Total", "Fecha"]} rows={documents.map((doc) => [doc.document_number, doc.kind, doc.status, doc.payment_terms, `L ${Number(doc.total).toLocaleString("es-HN")}`, new Date(doc.created_at).toLocaleDateString("es-HN")])} />}</section>;
}

function Kardex({ rows }: { rows: any[] }) {
  return <section className="panel full-panel"><div className="panel-heading"><div><p className="section-label">Movimientos</p><h2>Kardex de inventario</h2></div></div>{rows.length === 0 ? <EmptyWork title="Sin movimientos" text="Compras, ventas y ajustes generaran el historial aqui." /> : <DataTable headers={["Fecha", "SKU", "Producto", "Movimiento", "Cantidad", "Documento"]} rows={rows.map((row) => [new Date(row.created_at).toLocaleDateString("es-HN"), row.sku, row.product_name, row.movement_type, row.signed_quantity, row.document_number ?? "-"])} />}</section>;
}

function Parties({ rows, title }: { rows: Party[]; title: string }) {
  return <section className="panel full-panel"><div className="panel-heading"><div><p className="section-label">Registro</p><h2>{title}</h2></div><button className="primary-button"><Plus size={17} /> Nuevo</button></div>{rows.length === 0 ? <EmptyWork title={`Sin ${title.toLowerCase()}`} text="El CRUD de terceros queda listo para conectar en esta tabla." /> : <DataTable headers={["Nombre", "Tipo"]} rows={rows.map((row) => [row.name, row.kind])} />}</section>;
}

function Reports({ products, documents, kardex, exportExcel }: { products: Product[]; documents: any[]; kardex: any[]; exportExcel: () => void }) {
  return <section className="panel full-panel"><div className="panel-heading"><div><p className="section-label">Descargas</p><h2>Reportes</h2></div><button className="primary-button" onClick={exportExcel}><Download size={17} /> Exportar Excel</button></div><DataTable headers={["Reporte", "Registros"]} rows={[["Inventario", products.length], ["Facturas", documents.length], ["Kardex", kardex.length]]} /></section>;
}

function EmptyWork({ title, text }: { title: string; text: string }) {
  return <div className="empty-work"><strong>{title}</strong><p>{text}</p></div>;
}

function LoginScreen({ children, message }: { children?: React.ReactNode; message?: string }) {
  return <main className="login-screen">{children ?? <div className="auth-card"><BrandMark /><h1>Sistema no configurado</h1><p>{message}</p></div>}</main>;
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "warning" }) {
  return <article className={clsx("metric-card", tone)}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function BrandMark() {
  return <div className="brandmark" aria-label="Inversiones del Caribe"><img src="/brand/ic-01.svg" alt="" aria-hidden="true" /></div>;
}
