import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Building2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  Menu,
  PackagePlus,
  Plus,
  QrCode,
  ReceiptText,
  RotateCcw,
  Save,
  Search,
  ShoppingBag,
  Truck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { utils, writeFile } from "xlsx";
import { clsx } from "clsx";

type Product = {
  sku: string;
  name: string;
  category: string;
  stock: number;
  min: number;
  requested: boolean;
  realCost: number;
  salePrice: number;
  supplier: string;
};

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

const productsSeed: Product[] = [
  { sku: "IC-CAM-024", name: "Camisa Oxford Azul", category: "Ropa", stock: 126, min: 40, requested: false, realCost: 340, salePrice: 595, supplier: "Textiles Rivera" },
  { sku: "IC-ZAP-118", name: "Zapato Urbano Negro", category: "Calzado", stock: 18, min: 25, requested: true, realCost: 620, salePrice: 1090, supplier: "Calzado Norte" },
  { sku: "IC-BOL-041", name: "Bolso Casual Arena", category: "Accesorios", stock: 74, min: 20, requested: false, realCost: 255, salePrice: 489, supplier: "Importadora Caribe" },
  { sku: "IC-PAN-077", name: "Pantalon Stretch Marino", category: "Ropa", stock: 9, min: 18, requested: false, realCost: 410, salePrice: 760, supplier: "Textiles Rivera" },
  { sku: "IC-REL-013", name: "Reloj Ejecutivo IC", category: "Accesorios", stock: 43, min: 12, requested: false, realCost: 840, salePrice: 1490, supplier: "Importadora Caribe" },
];

const sellers = [
  { code: "V-001", name: "Mariana Lopez", rule: "5% venta contado", monthSales: 84250, commission: 4212.5 },
  { code: "V-002", name: "Carlos Mejia", rule: "3% venta credito", monthSales: 51600, commission: 1548 },
  { code: "V-003", name: "Andrea Cruz", rule: "7% accesorios", monthSales: 38900, commission: 2723 },
];

const invoices = [
  { number: "001214", date: "01/07/2026", customer: "Cliente final", seller: "Mariana Lopez", terms: "Contado", status: "Pagada", total: 4860 },
  { number: "001215", date: "02/07/2026", customer: "Distribuidora SPS", seller: "Carlos Mejia", terms: "Credito", status: "Pendiente", total: 12840 },
  { number: "001216", date: "03/07/2026", customer: "Cliente final", seller: "Andrea Cruz", terms: "Contado", status: "Anulada", total: 760 },
];

const kardex = [
  { date: "01/07/2026", sku: "IC-ZAP-118", detail: "Venta POS #001214", in: 0, out: 2, balance: 18 },
  { date: "01/07/2026", sku: "IC-CAM-024", detail: "Compra OC-1042", in: 40, out: 0, balance: 126 },
  { date: "02/07/2026", sku: "IC-PAN-077", detail: "Ajuste por producto danado", in: 0, out: 1, balance: 9 },
  { date: "03/07/2026", sku: "IC-BOL-041", detail: "Devolucion cliente", in: 1, out: 0, balance: 74 },
];

export function App() {
  const [selectedModule, setSelectedModule] = useState<(typeof modules)[number]["label"]>("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [products, setProducts] = useState(productsSeed);
  const [cart, setCart] = useState<CartLine[]>([
    { ...productsSeed[0], qty: 2 },
    { ...productsSeed[2], qty: 1 },
  ]);
  const [paymentTerms, setPaymentTerms] = useState("Contado");
  const [customer, setCustomer] = useState("Cliente final");
  const [seller, setSeller] = useState("Mariana Lopez");
  const [qrProduct, setQrProduct] = useState(productsSeed[0]);
  const [qrUrl, setQrUrl] = useState("");

  const lowStock = products.filter((product) => product.stock <= product.min);
  const stockValue = products.reduce((sum, product) => sum + product.stock * product.realCost, 0);
  const cartTotal = cart.reduce((sum, line) => sum + line.qty * line.salePrice, 0);
  const grossProfit = cart.reduce((sum, line) => sum + line.qty * (line.salePrice - line.realCost), 0);

  useEffect(() => {
    QRCode.toDataURL(`SKU:${qrProduct.sku}|${qrProduct.name}|L${qrProduct.salePrice}`).then(setQrUrl);
  }, [qrProduct]);

  function addToCart(product: Product) {
    setCart((current) => {
      const existing = current.find((line) => line.sku === product.sku);
      if (existing) {
        return current.map((line) => line.sku === product.sku ? { ...line, qty: line.qty + 1 } : line);
      }
      return [...current, { ...product, qty: 1 }];
    });
  }

  function createStockRequest(sku: string) {
    setProducts((current) => current.map((product) => product.sku === sku ? { ...product, requested: true } : product));
  }

  function registerAdjustment(sku: string) {
    setProducts((current) => current.map((product) => product.sku === sku ? { ...product, stock: Math.max(0, product.stock - 1) } : product));
  }

  function exportExcel() {
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, utils.json_to_sheet(products), "Inventario");
    utils.book_append_sheet(workbook, utils.json_to_sheet(invoices), "Facturas");
    utils.book_append_sheet(workbook, utils.json_to_sheet(kardex), "Kardex");
    utils.book_append_sheet(workbook, utils.json_to_sheet(sellers), "Comisiones");
    writeFile(workbook, "inversiones-del-caribe-operacion.xlsx");
  }

  function downloadBackup() {
    const data = { generatedAt: new Date().toISOString(), products, invoices, kardex, sellers };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "respaldo-inventario-ic.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function generateInvoicePdf() {
    const pdf = new jsPDF({ unit: "pt", format: "letter" });
    pdf.setFillColor("#F6F1E7");
    pdf.rect(0, 0, 612, 792, "F");
    pdf.setFillColor("#FFFFFF");
    pdf.roundedRect(42, 42, 528, 708, 4, 4, "F");
    pdf.setTextColor("#14384C");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setCharSpace(3);
    pdf.text("INVERSIONES", 62, 70);
    pdf.setCharSpace(0);
    pdf.setFontSize(18);
    pdf.text("DEL CARIBE", 62, 92);
    pdf.setFillColor("#D9A13B");
    pdf.rect(176, 84, 6, 6, "F");
    pdf.setFontSize(22);
    pdf.text("FACTURA", 438, 72);
    pdf.setFontSize(10);
    pdf.setTextColor("#667782");
    pdf.text("No. 001217 · 09/07/2026", 397, 90);
    pdf.setTextColor("#14384C");
    pdf.setFontSize(12);
    pdf.text(`Cliente: ${customer}`, 62, 135);
    pdf.text(`Vendedor: ${seller}`, 62, 154);
    pdf.text(`Condicion: ${paymentTerms}`, 62, 173);
    pdf.setDrawColor("#14384C");
    pdf.line(62, 205, 550, 205);
    let y = 232;
    cart.forEach((line) => {
      pdf.setTextColor("#0B2533");
      pdf.text(`${line.qty} x ${line.name}`, 62, y);
      pdf.text(`L ${(line.qty * line.salePrice).toLocaleString("es-HN")}`, 480, y);
      y += 26;
    });
    pdf.setFillColor("#F6F1E7");
    pdf.roundedRect(62, 640, 488, 54, 6, 6, "F");
    pdf.setTextColor("#14384C");
    pdf.setFontSize(14);
    pdf.text("TOTAL", 84, 673);
    pdf.text(`L ${cartTotal.toLocaleString("es-HN")}`, 456, 673);
    pdf.setDrawColor("#D9A13B");
    pdf.setLineWidth(4);
    pdf.line(62, 715, 550, 715);
    pdf.save("factura-001217.pdf");
  }

  const content = useMemo(() => {
    switch (selectedModule) {
      case "POS":
        return <POS products={products} cart={cart} setCart={setCart} addToCart={addToCart} customer={customer} setCustomer={setCustomer} seller={seller} setSeller={setSeller} paymentTerms={paymentTerms} setPaymentTerms={setPaymentTerms} total={cartTotal} profit={grossProfit} generateInvoicePdf={generateInvoicePdf} />;
      case "Inventario":
        return <Inventory products={products} qrProduct={qrProduct} setQrProduct={setQrProduct} qrUrl={qrUrl} exportExcel={exportExcel} />;
      case "Stock bajo":
        return <LowStock products={lowStock} createStockRequest={createStockRequest} />;
      case "Ajustes":
        return <Adjustments products={products} registerAdjustment={registerAdjustment} />;
      case "Facturas":
        return <Invoices generateInvoicePdf={generateInvoicePdf} />;
      case "Kardex":
        return <Kardex />;
      case "Vendedores":
        return <Sellers />;
      case "Clientes":
        return <Parties kind="clientes" />;
      case "Proveedores":
        return <Parties kind="proveedores" />;
      case "Reportes":
        return <Reports exportExcel={exportExcel} downloadBackup={downloadBackup} />;
      default:
        return <Dashboard stockValue={stockValue} lowStock={lowStock.length} cartTotal={cartTotal} exportExcel={exportExcel} downloadBackup={downloadBackup} />;
    }
  }, [selectedModule, products, cart, customer, seller, paymentTerms, qrProduct, qrUrl, stockValue, lowStock.length, cartTotal, grossProfit]);

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
          {modules.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.label} className={clsx("nav-item", selectedModule === item.label && "active")} onClick={() => { setSelectedModule(item.label); setSidebarOpen(false); }}>
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="security-panel compact-user">
          <UserRound size={18} />
          <div>
            <strong>Sesion activa</strong>
            <span>Permisos aplicados en Supabase RLS</span>
          </div>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="section-label">Inversiones del Caribe</p>
            <h1>{selectedModule}</h1>
          </div>
          <div className="topbar-actions">
            <div className="searchbox">
              <Search size={17} />
              <input placeholder="Buscar producto, cliente, factura o proveedor" />
            </div>
            <button className="branch-button"><Building2 size={17} /> Todas las sucursales</button>
            <button className="primary-button" onClick={exportExcel}><Download size={17} /> Excel</button>
          </div>
        </header>
        {content}
      </main>
    </div>
  );
}

function Dashboard({ stockValue, lowStock, cartTotal, exportExcel, downloadBackup }: { stockValue: number; lowStock: number; cartTotal: number; exportExcel: () => void; downloadBackup: () => void }) {
  return (
    <>
      <section className="kpi-grid">
        <Metric label="Valor inventario" value={`L ${stockValue.toLocaleString("es-HN")}`} detail="Costo real actual" />
        <Metric label="Productos bajos" value={`${lowStock}`} detail="Con minimo configurable" tone="warning" />
        <Metric label="Venta en POS" value={`L ${cartTotal.toLocaleString("es-HN")}`} detail="Ticket actual" />
        <Metric label="Facturas credito" value="1 pendiente" detail="Control de cobro" />
      </section>
      <section className="content-grid">
        <Panel title="Operacion del dia" label="Resumen">
          <DataTable headers={["Area", "Estado", "Accion"]} rows={[
            ["Inventario", "2 productos bajo minimo", "Crear pedidos"],
            ["Facturacion", "Credito y contado activos", "Emitir PDF"],
            ["Comisiones", "Reglas configurables", "Revisar vendedores"],
            ["Kardex", "Movimientos trazables", "Auditar ajustes"],
          ]} />
        </Panel>
        <Panel title="Acciones rapidas" label="Exportar">
          <div className="action-stack">
            <button className="primary-button" onClick={exportExcel}><FileSpreadsheet size={18} /> Descargar Excel</button>
            <button className="secondary-button" onClick={downloadBackup}><Download size={18} /> Respaldo JSON</button>
          </div>
        </Panel>
      </section>
    </>
  );
}

function POS(props: { products: Product[]; cart: CartLine[]; setCart: (lines: CartLine[]) => void; addToCart: (product: Product) => void; customer: string; setCustomer: (value: string) => void; seller: string; setSeller: (value: string) => void; paymentTerms: string; setPaymentTerms: (value: string) => void; total: number; profit: number; generateInvoicePdf: () => void }) {
  return (
    <section className="pos-grid">
      <Panel title="Venta POS" label="Facturacion">
        <div className="form-grid">
          <label>Cliente<input value={props.customer} onChange={(e) => props.setCustomer(e.target.value)} /></label>
          <label>Vendedor<select value={props.seller} onChange={(e) => props.setSeller(e.target.value)}>{sellers.map((s) => <option key={s.code}>{s.name}</option>)}</select></label>
          <label>Pago<select value={props.paymentTerms} onChange={(e) => props.setPaymentTerms(e.target.value)}><option>Contado</option><option>Credito</option></select></label>
        </div>
        <div className="product-picker">
          {props.products.map((product) => <button key={product.sku} className="product-button" onClick={() => props.addToCart(product)}><strong>{product.name}</strong><span>L {product.salePrice}</span></button>)}
        </div>
      </Panel>
      <Panel title="Ticket" label="Carrito">
        <div className="ticket-list">
          {props.cart.map((line) => (
            <div className="ticket-line" key={line.sku}>
              <div><strong>{line.name}</strong><span>{line.qty} x L {line.salePrice}</span></div>
              <b>L {(line.qty * line.salePrice).toLocaleString("es-HN")}</b>
            </div>
          ))}
        </div>
        <div className="total-box"><span>Total</span><strong>L {props.total.toLocaleString("es-HN")}</strong></div>
        <div className="mini-note">Utilidad estimada: L {props.profit.toLocaleString("es-HN")}</div>
        <button className="primary-button wide" onClick={props.generateInvoicePdf}><FileText size={18} /> Generar factura PDF</button>
      </Panel>
      <InvoicePreview total={props.total} />
    </section>
  );
}

function Inventory({ products, qrProduct, setQrProduct, qrUrl, exportExcel }: { products: Product[]; qrProduct: Product; setQrProduct: (product: Product) => void; qrUrl: string; exportExcel: () => void }) {
  return (
    <section className="content-grid">
      <Panel title="Inventario con precios" label="Productos">
        <DataTable headers={["SKU", "Producto", "Stock", "Minimo", "Costo real", "Venta", "Pedido"]} rows={products.map((p) => [p.sku, p.name, p.stock, p.min, `L ${p.realCost}`, `L ${p.salePrice}`, p.requested ? "Pedido creado" : "-"])} />
      </Panel>
      <Panel title="Codigo QR" label="Producto">
        <select value={qrProduct.sku} onChange={(e) => setQrProduct(products.find((p) => p.sku === e.target.value) ?? products[0])}>
          {products.map((p) => <option key={p.sku} value={p.sku}>{p.sku} · {p.name}</option>)}
        </select>
        <div className="qr-box">{qrUrl && <img src={qrUrl} alt={`QR ${qrProduct.sku}`} />}</div>
        <button className="secondary-button" onClick={exportExcel}><QrCode size={18} /> Exportar catalogo</button>
      </Panel>
    </section>
  );
}

function LowStock({ products, createStockRequest }: { products: Product[]; createStockRequest: (sku: string) => void }) {
  return <Panel title="Pedidos por stock bajo" label="Reabastecimiento"><DataTable headers={["SKU", "Producto", "Actual", "Minimo", "Sugerido", "Estado", "Accion"]} rows={products.map((p) => [p.sku, p.name, p.stock, p.min, Math.max(p.min * 2 - p.stock, 1), p.requested ? "Pedido creado" : "Pendiente", <button className="mini-button" disabled={p.requested} onClick={() => createStockRequest(p.sku)}><PackagePlus size={14} /> Pedir</button>])} /></Panel>;
}

function Adjustments({ products, registerAdjustment }: { products: Product[]; registerAdjustment: (sku: string) => void }) {
  return (
    <section className="content-grid">
      <Panel title="Ajuste manual" label="Devolucion / danado / conteo">
        <div className="form-grid">
          <label>Producto<select>{products.map((p) => <option key={p.sku}>{p.sku} · {p.name}</option>)}</select></label>
          <label>Motivo<select><option>Producto danado</option><option>Devolucion cliente</option><option>Conteo fisico</option><option>Perdida</option></select></label>
          <label>Cantidad<input type="number" defaultValue={1} /></label>
        </div>
        <button className="primary-button" onClick={() => registerAdjustment(products[0].sku)}><Save size={18} /> Registrar ajuste</button>
      </Panel>
      <Panel title="Bitacora de ajustes" label="Auditoria">
        <DataTable headers={["Fecha", "Producto", "Motivo", "Cantidad", "Aprobacion"]} rows={[["09/07/2026", "Pantalon Stretch Marino", "Producto danado", "-1", "Pendiente admin"], ["08/07/2026", "Bolso Casual Arena", "Devolucion", "+1", "Aprobado"]]} />
      </Panel>
    </section>
  );
}

function Invoices({ generateInvoicePdf }: { generateInvoicePdf: () => void }) {
  return <Panel title="Facturas" label="Contado, credito y anulaciones"><DataTable headers={["No.", "Fecha", "Cliente", "Vendedor", "Termino", "Estado", "Total", "Accion"]} rows={invoices.map((i) => [i.number, i.date, i.customer, i.seller, i.terms, i.status, `L ${i.total.toLocaleString("es-HN")}`, <button className="mini-button" onClick={generateInvoicePdf}><FileText size={14} /> PDF</button>])} /></Panel>;
}

function Kardex() {
  return <Panel title="Kardex de inventario" label="Entradas, salidas y saldo"><DataTable headers={["Fecha", "SKU", "Detalle", "Entrada", "Salida", "Saldo"]} rows={kardex.map((k) => [k.date, k.sku, k.detail, k.in, k.out, k.balance])} /></Panel>;
}

function Sellers() {
  return (
    <section className="content-grid">
      <Panel title="Vendedores y comisiones" label="Configurable">
        <DataTable headers={["Codigo", "Vendedor", "Regla", "Ventas mes", "Comision"]} rows={sellers.map((s) => [s.code, s.name, s.rule, `L ${s.monthSales.toLocaleString("es-HN")}`, `L ${s.commission.toLocaleString("es-HN")}`])} />
      </Panel>
      <Panel title="Reglas de comision" label="Parametros">
        <div className="form-grid one">
          <label>Nombre<input defaultValue="5% venta contado" /></label>
          <label>Porcentaje<input type="number" defaultValue={5} /></label>
          <label>Aplica a<select><option>Todo</option><option>Categoria</option><option>Vendedor</option></select></label>
        </div>
        <button className="primary-button"><Plus size={18} /> Guardar regla</button>
      </Panel>
    </section>
  );
}

function Parties({ kind }: { kind: "clientes" | "proveedores" }) {
  const rows = kind === "clientes"
    ? [["Cliente final", "Contado", "L 0", "Activo"], ["Distribuidora SPS", "Credito", "L 12,840", "Pendiente"]]
    : [["Textiles Rivera", "Ropa", "L 84,200", "Activo"], ["Calzado Norte", "Calzado", "L 42,000", "Activo"]];
  return <Panel title={kind === "clientes" ? "Clientes" : "Proveedores"} label="Registro"><DataTable headers={["Nombre", "Tipo", "Saldo", "Estado"]} rows={rows} /></Panel>;
}

function Reports({ exportExcel, downloadBackup }: { exportExcel: () => void; downloadBackup: () => void }) {
  return (
    <section className="content-grid">
      <Panel title="Reportes" label="Operacion">
        <DataTable headers={["Reporte", "Contenido", "Salida"]} rows={[["Ventas", "Facturas contado/credito, utilidad y vendedor", "Excel/PDF"], ["Inventario", "Stock, minimos, pedidos y Kardex", "Excel"], ["Comisiones", "Ventas por vendedor y reglas", "Excel"]]} />
      </Panel>
      <Panel title="Descargas" label="Administracion">
        <div className="action-stack">
          <button className="primary-button" onClick={exportExcel}><FileSpreadsheet size={18} /> Descargar Excel</button>
          <button className="secondary-button" onClick={downloadBackup}><Download size={18} /> Respaldo base de datos</button>
        </div>
      </Panel>
    </section>
  );
}

function InvoicePreview({ total }: { total: number }) {
  return (
    <div className="invoice-preview">
      <div className="invoice-head">
        <img src="/brand/ic-01.svg" alt="" />
        <div><strong>FACTURA</strong><span>No. 001217 · 09/07/2026</span></div>
      </div>
      <div className="skeleton wide" />
      <div className="skeleton" />
      <hr />
      <div className="invoice-lines"><span /><span /><span /></div>
      <div className="invoice-total"><strong>TOTAL</strong><b>L {total.toLocaleString("es-HN")}</b></div>
      <div className="gold-line" />
    </div>
  );
}

function Panel({ title, label, children }: { title: string; label: string; children: React.ReactNode }) {
  return <section className="panel"><div className="panel-heading"><div><p className="section-label">{label}</p><h2>{title}</h2></div></div>{children}</section>;
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "warning" }) {
  return <article className={clsx("metric-card", tone)}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function BrandMark() {
  return <div className="brandmark" aria-label="Inversiones del Caribe"><img src="/brand/ic-01.svg" alt="" aria-hidden="true" /></div>;
}
