import {
  BarChart3,
  Boxes,
  ClipboardList,
  Download,
  FileSpreadsheet,
  LogOut,
  Menu,
  Printer,
  ReceiptText,
  ShoppingBag,
  Tag,
  Truck,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { utils, writeFile } from "xlsx";
import { clsx } from "clsx";
import { supabase } from "./lib/supabase";
import type { Account, AccountType, BonusPayment, CashMovement, CartLine, Commission, JournalEntryFull, Location, Party, Product, ProductForm, PurchaseLine, SalesLine, Seller, SellerGoal, UserProfile } from "./types";
import { BrandMark, LoginScreen, roleLabel } from "./ui";
import { Dashboard } from "./modules/Dashboard";
import { POS } from "./modules/Pos";
import { Inventory } from "./modules/Inventory";
import { Invoices, Kardex, Reports } from "./modules/Records";
import { Parties } from "./modules/Parties";
import { Sellers } from "./modules/Sellers";
import { Users as UsersView } from "./modules/Users";
import { Accounting } from "./modules/Accounting";
import { Analytics } from "./modules/Analytics";
import { Labels } from "./modules/Labels";
import { Offers } from "./modules/Offers";
import { MySales } from "./modules/MySales";
import { InvoiceDetailModal, type InvoiceItem } from "./modules/InvoiceDetail";

const modules = [
  { label: "Dashboard", icon: BarChart3 },
  { label: "POS", icon: ShoppingBag },
  { label: "Mis ventas", icon: UserRound },
  { label: "Inventario", icon: Boxes },
  { label: "Ofertas", icon: Tag },
  { label: "Etiquetas", icon: Printer },
  { label: "Facturas", icon: ReceiptText },
  { label: "Kardex", icon: ClipboardList },
  { label: "Vendedores", icon: UserRound },
  { label: "Analisis", icon: BarChart3 },
  { label: "Contabilidad", icon: Wallet },
  { label: "Clientes", icon: Users },
  { label: "Proveedores", icon: Truck },
  { label: "Configuracion", icon: Users },
  { label: "Reportes", icon: FileSpreadsheet },
] as const;

type ModuleName = (typeof modules)[number]["label"];

// Permisos por rol: que modulos ve cada usuario.
// El vendedor (sales) SOLO ve el POS: vende con el precio final, sin costos ni analisis.
const ROLE_PERMISSIONS: Record<string, ModuleName[]> = {
  admin: modules.map((m) => m.label),
  manager: ["Dashboard", "POS", "Inventario", "Ofertas", "Etiquetas", "Facturas", "Kardex", "Vendedores", "Analisis", "Contabilidad", "Clientes", "Proveedores", "Reportes"],
  warehouse: ["Dashboard", "Inventario", "Etiquetas", "Proveedores", "Kardex"],
  sales: ["POS", "Mis ventas", "Etiquetas"],
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
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [goals, setGoals] = useState<SellerGoal[]>([]);
  const [bonusPayments, setBonusPayments] = useState<BonusPayment[]>([]);
  const [stockRequests, setStockRequests] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [journal, setJournal] = useState<JournalEntryFull[]>([]);
  const [salesLines, setSalesLines] = useState<SalesLine[]>([]);
  const [backupDaysAgo, setBackupDaysAgo] = useState<number | null>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const query = "";
  const [notice, setNotice] = useState("");
  const [detailDoc, setDetailDoc] = useState<any | null>(null);
  const [detailItems, setDetailItems] = useState<InvoiceItem[]>([]);
  const [detailCommission, setDetailCommission] = useState<{ sellerName: string | null; amount: number } | null>(null);

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

  // Si el modulo actual no esta permitido para el rol, saltar al primero permitido.
  useEffect(() => {
    const role = users.find((u) => u.id === session?.user?.id)?.role ?? "admin";
    const allow = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.admin;
    setSelectedModule((cur) => (allow.includes(cur) ? cur : allow[0]));
  }, [users, session]);

  // Revisa cuando fue el ultimo respaldo (para el recordatorio semanal).
  useEffect(() => {
    try {
      const last = localStorage.getItem("ic_last_backup");
      if (!last) setBackupDaysAgo(null);
      else setBackupDaysAgo(Math.floor((Date.now() - new Date(last).getTime()) / 86400000));
    } catch {
      setBackupDaysAgo(null);
    }
  }, [session]);

  // Auto-ocultar la notificacion tras unos segundos.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function loadWorkspace() {
    if (!supabase) return;
    setLoading(true);
    const [productRes, stockRes, supplierRes, customerRes, locationRes, documentRes, kardexRes, userRes, sellerRes, requestRes, commissionRes, goalRes, bonusRes, accountRes, movementRes, salesItemsRes, auditRes] =
      await Promise.all([
        supabase.from("products").select("*").eq("active", true).order("name").limit(10000),
        supabase.from("stock_levels").select("product_id, quantity, location_id").limit(20000),
        supabase.from("parties").select("id, name, kind, tax_id, phone").eq("kind", "supplier").order("name"),
        supabase.from("parties").select("id, name, kind, tax_id, phone").eq("kind", "customer").order("name"),
        supabase.from("inventory_locations").select("id, name").order("name"),
        supabase.from("documents").select("*").order("created_at", { ascending: false }).limit(2000),
        supabase.from("inventory_kardex").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("profiles").select("id, full_name, username, role, active").order("full_name"),
        supabase.from("sellers").select("id, name, code, phone, commission_rate, active, user_id").order("name"),
        supabase.from("stock_requests").select("id, product_id, requested_quantity, status, supplier_id, created_at"),
        supabase
          .from("seller_commissions")
          .select("id, seller_id, document_id, base_amount, commission_amount, status, created_at, documents(document_number, customer_name, total, created_at)")
          .order("created_at", { ascending: false }),
        supabase.from("seller_goals").select("*").order("min_sales"),
        supabase.from("seller_bonus_payments").select("id, seller_id, goal_id, period, bonus, status"),
        supabase.from("chart_of_accounts").select("*").eq("active", true).order("code"),
        supabase
          .from("journal_entries")
          .select("id, entry_date, memo, source, created_at, journal_lines(debit, credit, account_id, chart_of_accounts(code, name, type, system_key))")
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("document_items")
          .select("product_id, quantity, unit_price, unit_cost, products(name, internal_code, sku), documents!inner(kind, created_at, voided_at)")
          .eq("documents.kind", "sale")
          .is("documents.voided_at", null)
          .limit(2000),
        supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(300),
      ]);

    if (productRes.error) setNotice(productRes.error.message);

    // Stock total + desglose por sucursal.
    const byLocation = new Map<string, Record<string, number>>();
    const totals = new Map<string, number>();
    const pendingRequests = (requestRes.data ?? []).filter((r: any) => r.status === "pending" || r.status === "ordered");
    const incomingByProduct = new Map<string, number>();
    for (const r of pendingRequests) {
      incomingByProduct.set(r.product_id, (incomingByProduct.get(r.product_id) ?? 0) + Number(r.requested_quantity ?? 0));
    }
    for (const row of stockRes.data ?? []) {
      const qty = Number(row.quantity ?? 0);
      totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + qty);
      const map = byLocation.get(row.product_id) ?? {};
      map[row.location_id] = qty;
      byLocation.set(row.product_id, map);
    }

    setProducts(
      (productRes.data ?? []).map((product) => {
        const discount = Number(product.discount_pct ?? 0);
        const priceFinal = Number((Number(product.sale_price) * (1 - discount / 100)).toFixed(2));
        return {
          ...product,
          stock: Number(totals.get(product.id) ?? 0),
          stockByLocation: byLocation.get(product.id) ?? {},
          incoming: Number(incomingByProduct.get(product.id) ?? 0),
          discount_pct: discount,
          price_final: priceFinal,
        };
      }),
    );
    setSuppliers((supplierRes.data ?? []) as Party[]);
    setCustomers((customerRes.data ?? []) as Party[]);
    setLocations((locationRes.data ?? []) as Location[]);
    setDocuments(documentRes.data ?? []);
    setKardex(kardexRes.data ?? []);
    setUsers((userRes.data ?? []) as UserProfile[]);
    setSellers((sellerRes.data ?? []) as Seller[]);
    setCommissions(
      (commissionRes.data ?? []).map((c: any) => ({
        id: c.id,
        seller_id: c.seller_id,
        document_id: c.document_id,
        base_amount: Number(c.base_amount),
        commission_amount: Number(c.commission_amount),
        status: c.status,
        created_at: c.created_at,
        doc: c.documents
          ? {
              document_number: c.documents.document_number,
              customer_name: c.documents.customer_name ?? null,
              total: Number(c.documents.total),
              created_at: c.documents.created_at,
            }
          : null,
      })) as Commission[],
    );
    setGoals((goalRes.data ?? []) as SellerGoal[]);
    setBonusPayments((bonusRes.data ?? []) as BonusPayment[]);
    setStockRequests(pendingRequests);
    setAuditLog(auditRes.data ?? []);
    setAccounts((accountRes.data ?? []) as Account[]);

    // Libro completo (todos los asientos con sus lineas).
    const fullJournal: JournalEntryFull[] = (movementRes.data ?? []).map((e: any) => ({
      id: e.id,
      entry_date: e.entry_date,
      memo: e.memo ?? null,
      source: e.source,
      created_at: e.created_at,
      lines: (e.journal_lines ?? []).map((l: any) => ({
        account_id: l.account_id,
        account_code: l.chart_of_accounts?.code ?? "",
        account_name: l.chart_of_accounts?.name ?? "",
        account_type: l.chart_of_accounts?.type ?? null,
        debit: Number(l.debit ?? 0),
        credit: Number(l.credit ?? 0),
        description: l.description ?? null,
      })),
    }));
    setJournal(fullJournal);

    // Lineas de venta (facturas no anuladas) para el analisis.
    setSalesLines(
      (salesItemsRes.data ?? []).map((it: any) => ({
        product_id: it.product_id,
        name: it.products?.name ?? "Producto",
        code: it.products?.internal_code ?? it.products?.sku ?? null,
        qty: Number(it.quantity ?? 0),
        revenue: Number(it.quantity ?? 0) * Number(it.unit_price ?? 0),
        cost: Number(it.quantity ?? 0) * Number(it.unit_cost ?? 0),
        date: it.documents?.created_at ?? new Date().toISOString(),
      })) as SalesLine[],
    );

    // Movimientos = todo asiento que afecte ingresos o gastos (ventas, gastos, ingresos, comisiones).
    // Una venta cuenta como ingreso (cuenta Ventas); una comision/gasto como gasto.
    setMovements(
      fullJournal
        .map((e) => {
          const incomeLines = e.lines.filter((l) => l.account_type === "income");
          const expenseLines = e.lines.filter((l) => l.account_type === "expense");
          let type: "income" | "expense";
          let amount: number;
          let categoryLine;
          if (incomeLines.length > 0) {
            type = "income";
            amount = incomeLines.reduce((s, l) => s + (l.credit - l.debit), 0);
            categoryLine = incomeLines[0];
          } else if (expenseLines.length > 0) {
            type = "expense";
            amount = expenseLines.reduce((s, l) => s + (l.debit - l.credit), 0);
            categoryLine = expenseLines[0];
          } else {
            return null; // asiento que no toca resultados (ej. traslado entre cuentas)
          }
          const payLine = e.lines.find((l) => {
            const acc = accountRes.data?.find((a: any) => a.id === l.account_id);
            return acc?.system_key === "cash" || acc?.system_key === "bank";
          });
          return {
            id: e.id,
            entry_date: e.entry_date,
            memo: e.memo ?? (e.source === "sale" ? "Venta" : e.source === "void" ? "Anulacion" : null),
            type,
            amount,
            category_name: categoryLine?.account_name ?? null,
            pay_account_name: payLine?.account_name ?? null,
            created_at: e.created_at,
          } as CashMovement;
        })
        .filter((m): m is CashMovement => m !== null),
    );

    // Bloquear el acceso si el usuario actual fue desactivado.
    const me = (userRes.data ?? []).find((u) => u.id === session?.user?.id);
    if (me && me.active === false) {
      await supabase.auth.signOut();
      setNotice("Tu usuario esta desactivado. Contacta a un administrador.");
      setLoading(false);
      return;
    }
    setLoading(false);
  }

  // Nombre del usuario actual (para huella y registros).
  function currentUserName(): string {
    const me = users.find((u) => u.id === session?.user?.id);
    return me?.full_name || me?.username || session?.user?.email || "Usuario";
  }

  // Registra la huella de quien hace cada accion importante (via funcion segura en la base).
  async function logAudit(action: string, detail: string) {
    if (!supabase) return;
    const { error } = await supabase.rpc("log_action", { p_action: action, p_detail: detail });
    if (error) console.warn("No se pudo registrar en bitacora:", error.message);
  }

  async function ensureLocation() {
    if (!supabase) throw new Error("Supabase no configurado");
    if (locations[0]) return locations[0];
    const { data, error } = await supabase
      .from("inventory_locations")
      .insert({ name: "Bodega Central", kind: "warehouse" })
      .select("id, name")
      .single();
    if (error) throw error;
    setLocations([data]);
    return data;
  }

  async function nextInternalCode() {
    if (!supabase) return `IC-${Date.now().toString().slice(-6)}`;
    const { data } = await supabase.rpc("next_product_internal_code");
    return data ?? `IC-${Date.now().toString().slice(-6)}`;
  }

  async function saveProduct(form: ProductForm, id?: string) {
    if (!supabase) return;
    const generatedCode = form.internal_code || (await nextInternalCode());
    const payload = {
      sku: (form.sku || generatedCode).trim(),
      name: form.name.trim(),
      category: form.category.trim(),
      barcode: form.barcode || generatedCode,
      min_stock: Number(form.min_stock),
      cost: Number(form.real_cost || form.cost),
      price: Number(form.sale_price || form.price),
      real_cost: Number(form.real_cost || form.cost),
      sale_price: Number(form.sale_price || form.price),
      supplier_id: form.supplier_id || null,
      brand: form.brand || null,
      size: form.size || null,
      color: form.color || null,
      gender: form.gender || null,
      season: form.season || null,
      internal_code: generatedCode,
      qr_payload: form.qr_payload || generatedCode,
      active: true,
    };
    const who = currentUserName();
    const now = new Date().toISOString();
    const writePayload = id
      ? { ...payload, updated_by_name: who, updated_at: now }
      : { ...payload, created_by_name: who, updated_by_name: who, updated_at: now };
    const location = await ensureLocation();
    const { data, error } = id
      ? await supabase.from("products").update(writePayload).eq("id", id).select("*").single()
      : await supabase.from("products").insert(writePayload).select("*").single();
    if (error) {
      setNotice(error.message);
      return;
    }
    await supabase
      .from("stock_levels")
      .upsert({ product_id: data.id, location_id: location.id, quantity: Number(form.stock) });
    await logAudit(id ? "Editar producto" : "Crear producto", `${payload.name} (${payload.internal_code})`);
    setNotice("Producto guardado");
    await loadWorkspace();
  }

  // Crea varias variantes (talla x color) de un mismo producto base, de una sola vez.
  async function createProductMatrix(
    base: {
      name: string;
      category: string;
      brand: string;
      gender: string;
      supplier_id: string | null;
      real_cost: number;
      sale_price: number;
      min_stock: number;
    },
    combos: { size: string; color: string; qty: number }[],
  ) {
    if (!supabase || combos.length === 0) return;
    const location = await ensureLocation();
    let created = 0;
    for (const combo of combos) {
      const code = await nextInternalCode();
      const payload = {
        sku: code,
        name: base.name.trim(),
        category: base.category.trim(),
        barcode: code,
        min_stock: Number(base.min_stock),
        cost: Number(base.real_cost),
        price: Number(base.sale_price),
        real_cost: Number(base.real_cost),
        sale_price: Number(base.sale_price),
        supplier_id: base.supplier_id || null,
        brand: base.brand || null,
        size: combo.size || null,
        color: combo.color || null,
        gender: base.gender || null,
        season: null,
        internal_code: code,
        qr_payload: code,
        active: true,
        created_by_name: currentUserName(),
        updated_by_name: currentUserName(),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("products").insert(payload).select("id").single();
      if (error) {
        setNotice(`Error creando ${base.name} ${combo.size}/${combo.color}: ${error.message}`);
        continue;
      }
      await supabase.from("stock_levels").upsert({ product_id: data.id, location_id: location.id, quantity: Number(combo.qty) });
      created++;
    }
    await logAudit("Crear variantes", `${created} variante(s) de "${base.name}"`);
    setNotice(`${created} variante(s) de "${base.name}" creadas`);
    await loadWorkspace();
  }

  // Descuentos en bloque (solo admin/gerencia). scope: todos / categoria / marca / seleccion manual.
  async function applyDiscount(scope: { type: "all" | "category" | "brand" | "selected"; value?: string; ids?: string[] }, pct: number) {
    if (!supabase) return;
    let q = supabase.from("products").update({ discount_pct: pct }).eq("active", true);
    if (scope.type === "category" && scope.value) q = q.eq("category", scope.value);
    else if (scope.type === "brand" && scope.value) q = q.eq("brand", scope.value);
    else if (scope.type === "selected") {
      if (!scope.ids || scope.ids.length === 0) return;
      q = q.in("id", scope.ids);
    }
    const { error } = await q;
    if (error) {
      setNotice(error.message);
      return;
    }
    const alcance = scope.type === "all" ? "todos" : scope.type === "selected" ? `${scope.ids?.length ?? 0} productos` : `${scope.type} ${scope.value ?? ""}`;
    await logAudit("Descuento", pct > 0 ? `${pct}% a ${alcance}` : `Quitar descuento a ${alcance}`);
    setNotice(pct > 0 ? `Descuento de ${pct}% aplicado` : "Descuento quitado");
    await loadWorkspace();
  }

  async function clearAllDiscounts() {
    if (!supabase) return;
    const { error } = await supabase.from("products").update({ discount_pct: 0 }).gt("discount_pct", 0);
    setNotice(error ? error.message : "Todas las ofertas quitadas");
    await loadWorkspace();
  }

  async function createUser(payload: { username: string; password: string; full_name: string; role: string }) {
    if (!supabase) return;
    const { data, error } = await supabase.functions.invoke("admin-create-user", { body: payload });
    if (error || data?.error) {
      setNotice(data?.error ?? error?.message ?? "No se pudo crear usuario");
      return;
    }
    // Si es un usuario de VENTAS, se le crea su ficha de vendedor automaticamente (enlazada).
    if (payload.role === "sales") {
      const { data: prof } = await supabase.from("profiles").select("id").eq("username", payload.username).maybeSingle();
      if (prof?.id) {
        const exists = await supabase.from("sellers").select("id").eq("user_id", prof.id).maybeSingle();
        if (!exists.data) {
          await supabase.from("sellers").insert({
            name: payload.full_name,
            code: `V-${Date.now().toString().slice(-6)}`,
            commission_rate: 0,
            active: true,
            user_id: prof.id,
          });
        }
      }
    }
    await logAudit("Crear usuario", `${payload.full_name} (${payload.username}) · rol ${payload.role}`);
    setNotice(payload.role === "sales" ? "Usuario y vendedor creados" : "Usuario creado");
    await loadWorkspace();
  }

  async function updateUser(payload: { id: string; full_name?: string; role?: string; active?: boolean; password?: string }) {
    if (!supabase) return;
    const { data, error } = await supabase.functions.invoke("admin-update-user", { body: payload });
    if (error || data?.error) {
      setNotice(data?.error ?? error?.message ?? "No se pudo actualizar el usuario");
      return;
    }
    const target = users.find((u) => u.id === payload.id);
    const what = payload.password ? "reset contraseña" : payload.active === false ? "desactivar" : payload.active === true ? "activar" : "editar";
    await logAudit("Editar usuario", `${target?.full_name ?? target?.username ?? payload.id} · ${what}`);
    setNotice(payload.password ? "Contraseña actualizada" : "Usuario actualizado");
    await loadWorkspace();
  }

  async function saveParty(form: { name: string; tax_id: string; phone: string }, kind: "customer" | "supplier", id?: string) {
    if (!supabase) return;
    const payload = {
      kind,
      name: form.name.trim(),
      tax_id: form.tax_id.trim() || null,
      phone: form.phone.trim() || null,
    };
    const { error } = id
      ? await supabase.from("parties").update(payload).eq("id", id)
      : await supabase.from("parties").insert(payload);
    setNotice(error ? error.message : "Guardado");
    await loadWorkspace();
  }

  async function deleteParty(party: Party) {
    if (!supabase) return;
    if (!window.confirm(`Eliminar ${party.name}?`)) return;
    const { error } = await supabase.from("parties").delete().eq("id", party.id);
    setNotice(error ? error.message : "Eliminado");
    await loadWorkspace();
  }

  async function saveSeller(
    form: { name: string; code: string; phone: string; commission_rate: number; active: boolean; user_id: string | null },
    id?: string,
  ) {
    if (!supabase) return;
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      phone: form.phone.trim() || null,
      commission_rate: form.commission_rate,
      active: form.active,
      user_id: form.user_id || null,
    };
    const { error } = id
      ? await supabase.from("sellers").update(payload).eq("id", id)
      : await supabase.from("sellers").insert(payload);
    setNotice(error ? error.message : "Vendedor guardado");
    await loadWorkspace();
  }

  async function deleteSeller(seller: Seller) {
    if (!supabase) return;
    if (!window.confirm(`Eliminar al vendedor ${seller.name}?`)) return;
    const { error } = await supabase.from("sellers").delete().eq("id", seller.id);
    setNotice(error ? error.message : "Vendedor eliminado");
    await loadWorkspace();
  }

  async function payCommission(commissionId: string) {
    if (!supabase) return;
    const { error } = await supabase
      .from("seller_commissions")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", commissionId);
    if (error) {
      setNotice(error.message);
      return;
    }
    // Asiento: Debe Comisiones de vendedores / Haber Caja.
    const comm = commissions.find((c) => c.id === commissionId);
    const seller = comm ? sellers.find((s) => s.id === comm.seller_id) : null;
    if (comm && comm.commission_amount > 0) {
      await postJournal(
        new Date().toISOString().slice(0, 10),
        `Pago comision ${seller?.name ?? ""} · fact ${comm.doc?.document_number ?? ""}`.trim(),
        "expense",
        comm.document_id,
        [
          { account_id: accountIdByKey("commission_expense"), debit: comm.commission_amount, credit: 0, description: "Comision vendedor" },
          { account_id: accountIdByKey("cash"), debit: 0, credit: comm.commission_amount, description: "Pago comision" },
        ],
      );
    }
    await logAudit("Pagar comision", `${seller?.name ?? ""} · L ${(comm?.commission_amount ?? 0).toLocaleString("es-HN")} · fact ${comm?.doc?.document_number ?? ""}`);
    setNotice("Comision pagada");
    await loadWorkspace();
  }

  async function saveGoal(sellerId: string, form: { name: string; min_sales: number; bonus: number }, id?: string) {
    if (!supabase) return;
    const payload = { seller_id: sellerId, name: form.name.trim() || "Meta", min_sales: form.min_sales, bonus: form.bonus, active: true };
    const { error } = id
      ? await supabase.from("seller_goals").update(payload).eq("id", id)
      : await supabase.from("seller_goals").insert(payload);
    setNotice(error ? error.message : "Meta guardada");
    await loadWorkspace();
  }

  async function deleteGoal(goalId: string) {
    if (!supabase) return;
    const { error } = await supabase.from("seller_goals").delete().eq("id", goalId);
    setNotice(error ? error.message : "Meta eliminada");
    await loadWorkspace();
  }

  async function payBonus(sellerId: string, goalId: string, period: string, sales: number, bonus: number) {
    if (!supabase) return;
    const { error } = await supabase
      .from("seller_bonus_payments")
      .upsert(
        { seller_id: sellerId, goal_id: goalId, period, sales, bonus, status: "paid", paid_at: new Date().toISOString() },
        { onConflict: "seller_id,period" },
      );
    if (error) {
      setNotice(error.message);
      return;
    }
    // Asiento: Debe Comisiones de vendedores / Haber Caja (el bono es gasto de comision).
    if (bonus > 0) {
      const seller = sellers.find((s) => s.id === sellerId);
      await postJournal(
        new Date().toISOString().slice(0, 10),
        `Pago bono ${seller?.name ?? ""} · ${period}`.trim(),
        "expense",
        null,
        [
          { account_id: accountIdByKey("commission_expense"), debit: bonus, credit: 0, description: "Bono vendedor" },
          { account_id: accountIdByKey("cash"), debit: 0, credit: bonus, description: "Pago bono" },
        ],
      );
    }
    const bSeller = sellers.find((s) => s.id === sellerId);
    await logAudit("Pagar bono", `${bSeller?.name ?? ""} · L ${bonus.toLocaleString("es-HN")} · ${period}`);
    setNotice("Bono pagado");
    await loadWorkspace();
  }

  async function openInvoiceById(documentId: string) {
    if (!supabase) return;
    const { data, error } = await supabase.from("documents").select("*").eq("id", documentId).single();
    if (error || !data) {
      setNotice(error?.message ?? "No se encontro la factura");
      return;
    }
    await openInvoiceDetail(data);
  }

  async function deleteProduct(product: Product) {
    if (!supabase) return;
    const ok = window.confirm(`Eliminar ${product.name}? Quedara inactivo para conservar historial.`);
    if (!ok) return;
    const { error } = await supabase.from("products").update({ active: false }).eq("id", product.id);
    if (error) setNotice(error.message);
    else await logAudit("Eliminar producto", `${product.name} (${product.internal_code ?? product.sku})`);
    await loadWorkspace();
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
    await supabase
      .from("stock_levels")
      .upsert({ product_id: productId, location_id: location.id, quantity: Math.max(0, current + quantityDelta) });
    const prodName = products.find((p) => p.id === productId)?.name ?? productId;
    await logAudit("Ajuste de stock", `${prodName} · ${quantityDelta > 0 ? "+" : ""}${quantityDelta} · ${reason}`);
    setNotice("Ajuste registrado");
    await loadWorkspace();
  }

  async function registerPurchase(supplierId: string | null, lines: PurchaseLine[]) {
    if (!supabase || lines.length === 0) return;
    const location = await ensureLocation();
    const subtotal = lines.reduce((sum, line) => sum + line.qty * line.unit_cost, 0);
    const documentNumber = String(Date.now()).slice(-6);
    const { data: document, error } = await supabase
      .from("documents")
      .insert({
        kind: "purchase",
        document_number: documentNumber,
        party_id: supplierId,
        location_id: location.id,
        status: "received",
        payment_terms: "cash",
        subtotal,
        total: subtotal,
        paid_amount: subtotal,
      })
      .select("*")
      .single();
    if (error) {
      setNotice(error.message);
      return;
    }
    await supabase.from("document_items").insert(
      lines.map((line) => ({
        document_id: document.id,
        product_id: line.product.id,
        quantity: line.qty,
        unit_cost: line.unit_cost,
        unit_price: line.product.sale_price,
        line_total: line.qty * line.unit_cost,
      })),
    );
    for (const line of lines) {
      const nextQty = line.product.stock + line.qty;
      await supabase
        .from("stock_levels")
        .upsert({ product_id: line.product.id, location_id: location.id, quantity: nextQty });
      await supabase.from("inventory_movements").insert({
        product_id: line.product.id,
        location_id: location.id,
        document_id: document.id,
        movement_type: "purchase",
        quantity: line.qty,
        unit_cost: line.unit_cost,
        unit_price: line.product.sale_price,
        notes: `Entrada pedido ${document.document_number}`,
      });
    }
    // Marcar como recibidos los pedidos pendientes de estos productos (ya no van "en camino").
    for (const line of lines) {
      await supabase
        .from("stock_requests")
        .update({ status: "received", received_at: new Date().toISOString() })
        .eq("product_id", line.product.id)
        .in("status", ["pending", "ordered"]);
    }
    setNotice(`Entrada ${document.document_number} registrada · +${lines.reduce((s, l) => s + l.qty, 0)} unidades`);
    await loadWorkspace();
  }

  async function createOrder(product: Product, quantity: number, supplierId: string | null) {
    if (!supabase || quantity <= 0) return;
    const location = await ensureLocation();
    const { error } = await supabase.from("stock_requests").insert({
      product_id: product.id,
      location_id: location.id,
      min_quantity: product.min_stock,
      current_quantity: product.stock,
      requested_quantity: quantity,
      supplier_id: supplierId ?? product.supplier_id ?? null,
      status: "ordered",
    });
    setNotice(error ? error.message : `Pedido registrado · ${quantity} unidades en camino`);
    await loadWorkspace();
  }

  async function receiveOrder(request: any) {
    if (!supabase) return;
    const product = products.find((p) => p.id === request.product_id);
    if (!product) return;
    const qty = Number(request.requested_quantity);
    // Reutiliza la entrada de compra (suma stock, movimiento y marca pedidos recibidos).
    await registerPurchase(request.supplier_id ?? null, [{ product, qty, unit_cost: product.real_cost }]);
  }

  async function cancelOrder(request: any) {
    if (!supabase) return;
    const { error } = await supabase.from("stock_requests").update({ status: "cancelled" }).eq("id", request.id);
    setNotice(error ? error.message : "Pedido cancelado");
    await loadWorkspace();
  }

  async function receiveOrderQty(request: any, arrivedQty: number, unitCost: number) {
    if (!supabase || arrivedQty <= 0) return;
    const product = products.find((p) => p.id === request.product_id);
    if (!product) return;
    const location = await ensureLocation();
    const total = arrivedQty * unitCost;
    const documentNumber = String(Date.now()).slice(-6);
    const { data: document, error } = await supabase
      .from("documents")
      .insert({
        kind: "purchase",
        document_number: documentNumber,
        party_id: request.supplier_id ?? null,
        location_id: location.id,
        status: "received",
        payment_terms: "cash",
        subtotal: total,
        total,
        paid_amount: total,
      })
      .select("*")
      .single();
    if (error) {
      setNotice(error.message);
      return;
    }
    await supabase.from("document_items").insert({
      document_id: document.id,
      product_id: product.id,
      quantity: arrivedQty,
      unit_cost: unitCost,
      unit_price: product.sale_price,
      line_total: total,
    });
    await supabase.from("stock_levels").upsert({ product_id: product.id, location_id: location.id, quantity: product.stock + arrivedQty });
    await supabase.from("inventory_movements").insert({
      product_id: product.id,
      location_id: location.id,
      document_id: document.id,
      movement_type: "purchase",
      quantity: arrivedQty,
      unit_cost: unitCost,
      unit_price: product.sale_price,
      notes: `Recibido pedido ${document.document_number}`,
    });
    await supabase.from("stock_requests").update({ status: "received", received_at: new Date().toISOString() }).eq("id", request.id);
    setNotice(`Recibido: +${arrivedQty} unidades`);
    await loadWorkspace();
  }

  function addToCart(product: Product) {
    setCart((current) => {
      const existing = current.find((line) => line.id === product.id);
      if (existing)
        return current.map((line) => (line.id === product.id ? { ...line, qty: line.qty + 1 } : line));
      // Se vende al precio final (con descuento si el producto esta en oferta).
      return [...current, { ...product, qty: 1, base_price: product.sale_price, sale_price: product.price_final ?? product.sale_price }];
    });
  }

  // Devuelve el id de una cuenta por su system_key (caja, ventas, etc.)
  function accountIdByKey(key: string): string | null {
    return accounts.find((a) => a.system_key === key)?.id ?? null;
  }

  // Postea un asiento balanceado. lines: {account_id, debit, credit, description}
  async function postJournal(
    entryDate: string,
    memo: string,
    source: string,
    sourceId: string | null,
    lines: { account_id: string | null; debit: number; credit: number; description?: string }[],
  ) {
    if (!supabase) return;
    const clean = lines.filter((l) => l.account_id && (l.debit > 0 || l.credit > 0)) as {
      account_id: string;
      debit: number;
      credit: number;
      description?: string;
    }[];
    if (clean.length < 2) return; // sin cuentas suficientes no se postea (no romper la venta)
    const { error } = await supabase.rpc("post_journal_entry", {
      p_entry_date: entryDate,
      p_memo: memo,
      p_source: source,
      p_source_id: sourceId,
      p_lines: clean,
    });
    if (error) console.warn("No se pudo postear asiento:", error.message);
  }

  async function issueSale(
    customerName: string,
    sellerId: string | null,
    paymentTerms: "cash" | "credit",
    discountPct = 0,
    applyTax = false,
  ) {
    if (!supabase || cart.length === 0) return;
    const location = await ensureLocation();
    // Si el nombre coincide con un cliente registrado, se enlaza; si no, se guarda como texto.
    const matched = customerName
      ? customers.find((c) => c.name.toLowerCase() === customerName.toLowerCase())
      : undefined;
    const subtotal = cart.reduce((sum, line) => sum + line.qty * line.sale_price, 0);
    const discount = Number((subtotal * (Math.max(0, discountPct) / 100)).toFixed(2));
    const taxable = subtotal - discount;
    const tax = applyTax ? Number((taxable * 0.15).toFixed(2)) : 0;
    const total = taxable + tax;
    const documentNumber = String(Date.now()).slice(-6);
    const { data: document, error } = await supabase
      .from("documents")
      .insert({
        kind: "sale",
        document_number: documentNumber,
        created_by_name: currentUserName(),
        party_id: matched?.id ?? null,
        customer_name: matched ? null : customerName || null,
        location_id: location.id,
        status: paymentTerms === "cash" ? "paid" : "issued",
        payment_terms: paymentTerms,
        subtotal,
        discount,
        tax,
        total,
        paid_amount: paymentTerms === "cash" ? total : 0,
      })
      .select("*")
      .single();
    if (error) {
      setNotice(error.message);
      return;
    }
    await supabase.from("document_items").insert(
      cart.map((line) => ({
        document_id: document.id,
        product_id: line.id,
        quantity: line.qty,
        unit_cost: line.real_cost,
        unit_price: line.sale_price,
        unit_price_original: line.base_price ?? line.sale_price,
        line_total: line.qty * line.sale_price,
      })),
    );
    if (paymentTerms === "cash") {
      await supabase.from("payments").insert({ document_id: document.id, amount: total, method: "cash" });
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

    // Comision del vendedor (interna, no aparece en la factura).
    if (sellerId) {
      const seller = sellers.find((sv) => sv.id === sellerId);
      if (seller && seller.commission_rate > 0) {
        await supabase.from("seller_commissions").insert({
          seller_id: seller.id,
          document_id: document.id,
          base_amount: taxable,
          rate: seller.commission_rate,
          commission_amount: Number((taxable * seller.commission_rate).toFixed(2)),
          status: paymentTerms === "cash" ? "pending" : "hold",
        });
        // Revisa si con esta venta alcanzo un bono del mes (queda pendiente de pago).
        await supabase.rpc("ensure_month_bonus", { p_seller: seller.id });
      }
    }

    // Asiento contable de la venta (partida doble):
    //   Debe: Caja (contado) o Cuentas por cobrar (credito) = total
    //   Haber: Ventas = taxable ; ISV por pagar = tax
    //   Debe: Costo de venta = costo ; Haber: Inventario = costo
    const costTotal = cart.reduce((sum, line) => sum + line.qty * Number(line.real_cost ?? 0), 0);
    const debitAsset = paymentTerms === "cash" ? accountIdByKey("cash") : accountIdByKey("accounts_receivable");
    const saleDate = new Date(document.created_at).toISOString().slice(0, 10);
    await postJournal(saleDate, `Venta ${document.document_number}`, "sale", document.id, [
      { account_id: debitAsset, debit: total, credit: 0, description: `Venta ${document.document_number}` },
      { account_id: accountIdByKey("sales"), debit: 0, credit: taxable, description: "Ventas" },
      { account_id: accountIdByKey("tax_payable"), debit: 0, credit: tax, description: "ISV por pagar" },
      { account_id: accountIdByKey("cogs"), debit: costTotal, credit: 0, description: "Costo de venta" },
      { account_id: accountIdByKey("inventory"), debit: 0, credit: costTotal, description: "Salida de inventario" },
    ]);

    await logAudit("Venta", `Factura ${document.document_number} · L ${total.toLocaleString("es-HN")}`);
    setCart([]);
    setNotice(`Factura ${document.document_number} emitida`);
    await loadWorkspace();
    return document;
  }

  // Respaldo COMPLETO de la base en JSON (todos los datos). Restaurable por programa.
  async function backupDatabase() {
    if (!supabase) return;
    setNotice("Generando respaldo...");
    const tables = [
      "profiles", "inventory_locations", "products", "stock_levels", "parties", "sellers",
      "commission_rules", "seller_goals", "documents", "document_items", "payments",
      "invoice_voids", "stock_requests", "stock_adjustments", "inventory_movements",
      "seller_commissions", "seller_bonus_payments", "chart_of_accounts", "journal_entries", "journal_lines",
    ];
    const dump: Record<string, any> = { _meta: { app: "Inversiones del Caribe", generated_at: new Date().toISOString() } };
    for (const t of tables) {
      const { data, error } = await supabase.from(t).select("*");
      dump[t] = error ? { error: error.message } : data ?? [];
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `respaldo-IC-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    try {
      localStorage.setItem("ic_last_backup", new Date().toISOString());
    } catch {
      /* localStorage no disponible */
    }
    setBackupDaysAgo(0);
    await logAudit("Respaldo", "Descargo respaldo de la base");
    setNotice("Respaldo descargado. Guardalo en Drive u OneDrive.");
  }

  // Orden de tablas respetando dependencias (padres antes que hijos).
  const RESTORE_ORDER = [
    "inventory_locations", "chart_of_accounts", "products", "sellers", "parties", "seller_goals",
    "stock_levels", "documents", "document_items", "payments", "invoice_voids", "stock_requests",
    "stock_adjustments", "inventory_movements", "seller_commissions", "seller_bonus_payments",
    "journal_entries", "journal_lines",
  ];

  // Restaura los DATOS desde un archivo de respaldo JSON (upsert por id).
  async function restoreDatabase(file: File) {
    if (!supabase) return;
    let dump: Record<string, any>;
    try {
      dump = JSON.parse(await file.text());
    } catch {
      setNotice("El archivo no es un respaldo valido (JSON).");
      return;
    }
    if (!window.confirm("Vas a RESTAURAR datos desde el respaldo. Esto sobrescribe registros con el mismo id. Continuar?")) return;
    setNotice("Restaurando respaldo...");
    let ok = 0;
    for (const t of RESTORE_ORDER) {
      const rows = dump[t];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      // En bloques para no saturar.
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { error } = await supabase.from(t).upsert(chunk);
        if (error) {
          setNotice(`Error restaurando ${t}: ${error.message}`);
          return;
        }
      }
      ok++;
    }
    await logAudit("Restaurar respaldo", `Restauro ${ok} tablas desde un respaldo`);
    setNotice(`Respaldo restaurado (${ok} tablas). Recargando...`);
    await loadWorkspace();
  }

  // Genera un archivo .sql con los DATOS (INSERTs) para restaurar en el editor SQL de Supabase.
  async function downloadSqlData() {
    if (!supabase) return;
    setNotice("Generando SQL...");
    const sqlVal = (v: any): string => {
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "number") return String(v);
      if (typeof v === "boolean") return v ? "true" : "false";
      if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
      return `'${String(v).replace(/'/g, "''")}'`;
    };
    let sql = `-- Respaldo de DATOS - Inversiones del Caribe - ${new Date().toISOString()}\n-- Restaurar en el editor SQL de Supabase (la estructura debe existir).\n\n`;
    for (const t of RESTORE_ORDER) {
      const { data } = await supabase.from(t).select("*");
      if (!data || data.length === 0) continue;
      const cols = Object.keys(data[0]);
      sql += `-- ${t} (${data.length})\n`;
      for (const row of data) {
        const vals = cols.map((c) => sqlVal((row as any)[c])).join(", ");
        sql += `INSERT INTO public.${t} (${cols.join(", ")}) VALUES (${vals}) ON CONFLICT (id) DO NOTHING;\n`;
      }
      sql += "\n";
    }
    const blob = new Blob([sql], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `datos-IC-${new Date().toISOString().slice(0, 10)}.sql`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice("SQL de datos descargado.");
  }

  function exportExcel() {
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, utils.json_to_sheet(products), "Inventario");
    utils.book_append_sheet(workbook, utils.json_to_sheet(documents), "Facturas");
    utils.book_append_sheet(workbook, utils.json_to_sheet(kardex), "Kardex");
    writeFile(workbook, "inversiones-del-caribe.xlsx");
  }

  type InvoiceLine = { qty: number; name: string; size: string | null; category: string | null; brand: string | null; color: string | null; sale_price: number; original_price?: number };

  async function buildInvoicePdf(number: string, lines: InvoiceLine[], total: number, customer?: string, dateStr?: string, internal?: { sellerName: string | null; commission: number }, amounts?: { subtotal: number; discount: number; tax: number }, openView = false) {
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
    pdf.setFontSize(20);
    pdf.text(internal ? "FACTURA (INTERNA)" : "FACTURA", internal ? 340 : 400, 60);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor("#667782");
    pdf.text(`No. ${number}`, 400, 78);
    pdf.text(`${dateStr ?? new Date().toLocaleDateString("es-HN")}`, 400, 92);

    // QR con el numero de factura (para buscarla luego)
    try {
      const qrData = await QRCode.toDataURL(number, { margin: 0, width: 120 });
      pdf.addImage(qrData, "PNG", 500, 44, 56, 56);
    } catch {
      // si falla el QR, la factura igual se genera
    }

    if (customer) {
      pdf.setTextColor("#0B2533");
      pdf.text(`Cliente: ${customer}`, 56, 118);
    }
    pdf.setDrawColor("#14384C");
    pdf.line(56, 135, 556, 135);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor("#667782");
    pdf.text("CANT", 56, 156);
    pdf.text("DESCRIPCION", 96, 156);
    pdf.text("SUBTOTAL", 482, 156);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    let y = 182;
    lines.forEach((line) => {
      pdf.setTextColor("#0B2533");
      pdf.text(String(line.qty), 56, y);
      const variant = [line.category, line.brand, line.size ? `Talla ${line.size}` : null, line.color]
        .filter(Boolean)
        .join(" · ");
      pdf.text(line.name, 96, y);
      const hasOffer = line.original_price != null && line.original_price > line.sale_price;
      if (variant) {
        pdf.setFontSize(8);
        pdf.setTextColor("#667782");
        pdf.text(variant, 96, y + 12);
        pdf.setFontSize(10);
        pdf.setTextColor("#0B2533");
      }
      if (hasOffer) {
        // Precio original tachado + precio con oferta
        pdf.setFontSize(8);
        pdf.setTextColor("#98A2AC");
        const origText = `L ${(line.qty * (line.original_price as number)).toLocaleString("es-HN")}`;
        const ow = pdf.getTextWidth(origText);
        pdf.text(origText, 482, y - 10);
        pdf.setDrawColor("#98A2AC");
        pdf.line(482, y - 12, 482 + ow, y - 12);
        pdf.setFontSize(10);
        pdf.setTextColor("#0B2533");
      }
      pdf.text(`L ${(line.qty * line.sale_price).toLocaleString("es-HN")}`, 482, y);
      y += variant ? 34 : 24;
    });

    // Desglose (subtotal neto / descuento manual / ISV). La oferta ya se ve tachada en la linea.
    if (amounts && (amounts.discount > 0 || amounts.tax > 0)) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor("#667782");
      y += 8;
      pdf.text("Subtotal", 360, y);
      pdf.text(`L ${amounts.subtotal.toLocaleString("es-HN")}`, 482, y);
      if (amounts.discount > 0) {
        y += 16;
        pdf.setTextColor("#b4231f");
        pdf.text("Descuento", 360, y);
        pdf.text(`- L ${amounts.discount.toLocaleString("es-HN")}`, 482, y);
        pdf.setTextColor("#667782");
      }
      if (amounts.tax > 0) {
        y += 16;
        pdf.text("ISV (15%)", 360, y);
        pdf.text(`L ${amounts.tax.toLocaleString("es-HN")}`, 482, y);
      }
      y += 6;
    }

    // Total justo debajo del ultimo producto (no fijo al pie)
    const boxY = y + 16;
    pdf.setDrawColor("#E4D9C4");
    pdf.setLineWidth(1);
    pdf.line(56, boxY - 8, 556, boxY - 8);
    pdf.setFillColor("#F6F1E7");
    pdf.roundedRect(56, boxY, 500, 46, 6, 6, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor("#14384C");
    pdf.text("TOTAL", 78, boxY + 30);
    pdf.text(`L ${total.toLocaleString("es-HN")}`, 462, boxY + 30);
    pdf.setDrawColor("#D9A13B");
    pdf.setLineWidth(4);
    pdf.line(56, boxY + 62, 556, boxY + 62);

    if (internal) {
      const iy = boxY + 92;
      pdf.setFillColor("#F4F7FB");
      pdf.roundedRect(56, iy, 500, 54, 6, 6, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor("#667782");
      pdf.text("USO INTERNO — NO ENTREGAR AL CLIENTE", 72, iy + 20);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor("#14384C");
      pdf.text(`Vendedor: ${internal.sellerName ?? "Sin vendedor"}`, 72, iy + 40);
      pdf.text(`Comision (venta sin ISV): L ${internal.commission.toLocaleString("es-HN")}`, 360, iy + 40);
    }

    if (openView) {
      // Abre el PDF en una pestaña para verlo/imprimirlo.
      const url = pdf.output("bloburl");
      const win = window.open(url, "_blank");
      if (!win) pdf.save(`factura-${number}.pdf`); // si bloquean la pestaña, lo descarga
    } else {
      pdf.save(`factura-${internal ? "interna-" : ""}${number}.pdf`);
    }
  }

  async function downloadInvoice(doc: any, internal = false, openView = false) {
    if (!supabase) return;
    const { data: items, error } = await supabase
      .from("document_items")
      .select("quantity, unit_price, unit_price_original, products(name, size, category, brand, color)")
      .eq("document_id", doc.id);
    if (error) {
      setNotice(error.message);
      return;
    }
    const lines: InvoiceLine[] = (items ?? []).map((it: any) => ({
      qty: Number(it.quantity),
      name: it.products?.name ?? "Producto",
      size: it.products?.size ?? null,
      category: it.products?.category ?? null,
      brand: it.products?.brand ?? null,
      color: it.products?.color ?? null,
      sale_price: Number(it.unit_price),
      original_price: it.unit_price_original != null ? Number(it.unit_price_original) : undefined,
    }));
    const customer = doc.customer_name ?? undefined;
    const dateStr = new Date(doc.created_at).toLocaleDateString("es-HN");
    let internalInfo: { sellerName: string | null; commission: number } | undefined;
    if (internal) {
      const { data: comm } = await supabase
        .from("seller_commissions")
        .select("commission_amount, sellers(name)")
        .eq("document_id", doc.id)
        .maybeSingle();
      internalInfo = {
        sellerName: (comm as any)?.sellers?.name ?? null,
        commission: Number((comm as any)?.commission_amount ?? 0),
      };
    }
    await buildInvoicePdf(
      doc.document_number,
      lines,
      Number(doc.total),
      customer,
      dateStr,
      internalInfo,
      {
        subtotal: Number(doc.subtotal ?? doc.total),
        discount: Number(doc.discount ?? 0),
        tax: Number(doc.tax ?? 0),
      },
      openView,
    );
  }


  async function openInvoiceDetail(doc: any) {
    if (!supabase) return;
    const { data: rows, error } = await supabase
      .from("document_items")
      .select("product_id, quantity, unit_price, unit_price_original, products(name, size, internal_code, sku, category, brand, color)")
      .eq("document_id", doc.id);
    if (error) {
      setNotice(error.message);
      return;
    }
    const mapped: InvoiceItem[] = (rows ?? []).map((it: any) => ({
      product_id: it.product_id,
      name: it.products?.name ?? "Producto",
      size: it.products?.size ?? null,
      category: it.products?.category ?? null,
      brand: it.products?.brand ?? null,
      color: it.products?.color ?? null,
      code: it.products?.internal_code ?? it.products?.sku ?? null,
      qty: Number(it.quantity),
      unit_price: Number(it.unit_price),
      original_price: it.unit_price_original != null ? Number(it.unit_price_original) : undefined,
      stock: products.find((p) => p.id === it.product_id)?.stock ?? 0,
    }));
    const { data: comm } = await supabase
      .from("seller_commissions")
      .select("commission_amount, sellers(name)")
      .eq("document_id", doc.id)
      .maybeSingle();
    setDetailCommission(
      comm ? { sellerName: (comm as any).sellers?.name ?? null, amount: Number((comm as any).commission_amount ?? 0) } : null,
    );
    setDetailItems(mapped);
    setDetailDoc(doc);
  }

  async function voidInvoice(doc: any, reason: string) {
    if (!supabase) return;
    // 1) Marcar la factura como anulada (lo primero e imprescindible).
    const { error: voidErr } = await supabase
      .from("documents")
      .update({ voided_at: new Date().toISOString(), void_reason: reason, voided_by: session?.user?.id ?? null })
      .eq("id", doc.id);
    if (voidErr) {
      setNotice(`No se pudo anular: ${voidErr.message}`);
      return;
    }
    // 2) Cancelar la comision del vendedor de esta factura.
    const { data: commRow } = await supabase.from("seller_commissions").select("seller_id").eq("document_id", doc.id).maybeSingle();
    const { error: commErr } = await supabase
      .from("seller_commissions")
      .update({ status: "cancelled" })
      .eq("document_id", doc.id);
    if (commErr) setNotice(`Anulada, pero la comision no se cancelo: ${commErr.message}`);
    // Recalcular el bono del mes de ese vendedor (pudo bajar del rango).
    if (commRow?.seller_id) await supabase.rpc("ensure_month_bonus", { p_seller: commRow.seller_id });

    // 3) Registrar el motivo y devolver el stock al inventario.
    await supabase.from("invoice_voids").insert({ document_id: doc.id, reason, voided_by: session?.user?.id ?? null });
    const location = await ensureLocation();
    for (const it of detailItems) {
      const current = products.find((p) => p.id === it.product_id)?.stock ?? 0;
      await supabase.from("stock_levels").upsert({ product_id: it.product_id, location_id: location.id, quantity: current + it.qty });
      await supabase.from("inventory_movements").insert({
        product_id: it.product_id,
        location_id: location.id,
        document_id: doc.id,
        movement_type: "adjustment_in",
        quantity: it.qty,
        unit_price: it.unit_price,
        notes: `Anulacion factura ${doc.document_number}`,
      });
    }
    // Asiento de reversion (contrario a la venta) para cuadrar contabilidad.
    const subtotal = Number(doc.subtotal ?? doc.total);
    const discount = Number(doc.discount ?? 0);
    const tax = Number(doc.tax ?? 0);
    const taxable = subtotal - discount;
    const total = Number(doc.total);
    const costTotal = detailItems.reduce(
      (s, it) => s + it.qty * Number(products.find((p) => p.id === it.product_id)?.real_cost ?? 0),
      0,
    );
    const creditAsset = doc.payment_terms === "cash" ? accountIdByKey("cash") : accountIdByKey("accounts_receivable");
    const voidDate = new Date().toISOString().slice(0, 10);
    await postJournal(voidDate, `Anulacion factura ${doc.document_number}`, "void", doc.id, [
      { account_id: creditAsset, debit: 0, credit: total, description: `Anula venta ${doc.document_number}` },
      { account_id: accountIdByKey("sales"), debit: taxable, credit: 0, description: "Reversa ventas" },
      { account_id: accountIdByKey("tax_payable"), debit: tax, credit: 0, description: "Reversa ISV" },
      { account_id: accountIdByKey("cogs"), debit: 0, credit: costTotal, description: "Reversa costo de venta" },
      { account_id: accountIdByKey("inventory"), debit: costTotal, credit: 0, description: "Reingreso inventario" },
    ]);

    // 4) Registrar la devolucion del dinero: reembolso (pago negativo) y dejar la factura en pagado = 0.
    const refunded = Number(doc.paid_amount ?? 0);
    if (refunded > 0) {
      await supabase.from("payments").insert({ document_id: doc.id, amount: -refunded, method: "refund" });
    }
    await supabase.from("documents").update({ paid_amount: 0 }).eq("id", doc.id);

    await logAudit("Anular factura", `Factura ${doc.document_number} · motivo: ${reason}`);
    if (!voidErr && !commErr) {
      setNotice(refunded > 0 ? `Factura ${doc.document_number} anulada · devuelto L ${refunded.toLocaleString("es-HN")}` : `Factura ${doc.document_number} anulada`);
    }
    setDetailDoc(null);
    await loadWorkspace();
  }

  async function saveInvoiceEdit(doc: any, lines: InvoiceItem[]) {
    if (!supabase) return;
    const location = await ensureLocation();

    // Reconciliar stock por diferencias entre lo viejo y lo nuevo.
    const oldMap = new Map<string, number>();
    detailItems.forEach((it) => oldMap.set(it.product_id, (oldMap.get(it.product_id) ?? 0) + it.qty));
    const newMap = new Map<string, number>();
    lines.forEach((l) => newMap.set(l.product_id, (newMap.get(l.product_id) ?? 0) + l.qty));
    const ids = new Set<string>([...oldMap.keys(), ...newMap.keys()]);
    for (const id of ids) {
      const delta = (newMap.get(id) ?? 0) - (oldMap.get(id) ?? 0); // >0 vende mas (resta stock); <0 devuelve
      if (delta === 0) continue;
      const current = products.find((p) => p.id === id)?.stock ?? 0;
      const nextStock = Math.max(0, current - delta);
      await supabase.from("stock_levels").upsert({ product_id: id, location_id: location.id, quantity: nextStock });
      await supabase.from("inventory_movements").insert({
        product_id: id,
        location_id: location.id,
        document_id: doc.id,
        movement_type: delta > 0 ? "sale" : "adjustment_in",
        quantity: Math.abs(delta),
        unit_price: lines.find((l) => l.product_id === id)?.unit_price ?? 0,
        notes: `Edicion factura ${doc.document_number}`,
      });
    }

    // Reemplazar los items del documento.
    await supabase.from("document_items").delete().eq("document_id", doc.id);
    await supabase.from("document_items").insert(
      lines.map((l) => ({
        document_id: doc.id,
        product_id: l.product_id,
        quantity: l.qty,
        unit_cost: products.find((p) => p.id === l.product_id)?.real_cost ?? 0,
        unit_price: l.unit_price,
        line_total: l.qty * l.unit_price,
      })),
    );

    const subtotal = lines.reduce((sum, l) => sum + l.qty * l.unit_price, 0);
    await supabase
      .from("documents")
      .update({ subtotal, total: subtotal, paid_amount: doc.payment_terms === "cash" ? subtotal : doc.paid_amount })
      .eq("id", doc.id);

    // Asiento de AJUSTE por la edicion: solo la diferencia (nuevo - viejo).
    const oldTaxable = Number(doc.subtotal ?? doc.total) - Number(doc.discount ?? 0);
    const oldTax = Number(doc.tax ?? 0);
    const oldTotal = Number(doc.total);
    const oldCost = detailItems.reduce(
      (s, it) => s + it.qty * Number(products.find((p) => p.id === it.product_id)?.real_cost ?? 0),
      0,
    );
    const newCost = lines.reduce(
      (s, l) => s + l.qty * Number(products.find((p) => p.id === l.product_id)?.real_cost ?? 0),
      0,
    );
    const dTotal = subtotal - oldTotal; // el edit deja total = subtotal (sin ISV/descuento)
    const dTaxable = subtotal - oldTaxable;
    const dTax = 0 - oldTax;
    const dCost = newCost - oldCost;
    const dbPos = (amt: number) => ({ debit: amt >= 0 ? amt : 0, credit: amt < 0 ? -amt : 0 }); // cuentas de saldo deudor
    const crPos = (amt: number) => ({ debit: amt < 0 ? -amt : 0, credit: amt >= 0 ? amt : 0 }); // cuentas de saldo acreedor
    const editAsset = doc.payment_terms === "cash" ? accountIdByKey("cash") : accountIdByKey("accounts_receivable");
    await postJournal(new Date().toISOString().slice(0, 10), `Ajuste edicion factura ${doc.document_number}`, "sale", doc.id, [
      { account_id: editAsset, ...dbPos(dTotal), description: "Ajuste cobro" },
      { account_id: accountIdByKey("sales"), ...crPos(dTaxable), description: "Ajuste ventas" },
      { account_id: accountIdByKey("tax_payable"), ...crPos(dTax), description: "Ajuste ISV" },
      { account_id: accountIdByKey("cogs"), ...dbPos(dCost), description: "Ajuste costo" },
      { account_id: accountIdByKey("inventory"), ...crPos(dCost), description: "Ajuste inventario" },
    ]);

    // Recalcular comision si existe.
    const { data: comm } = await supabase.from("seller_commissions").select("id, rate").eq("document_id", doc.id).maybeSingle();
    if (comm) {
      await supabase
        .from("seller_commissions")
        .update({ base_amount: subtotal, commission_amount: Number((subtotal * Number(comm.rate)).toFixed(2)) })
        .eq("id", comm.id);
    }

    await logAudit("Editar factura", `Factura ${doc.document_number} · nuevo total L ${subtotal.toLocaleString("es-HN")}`);
    setNotice(`Factura ${doc.document_number} actualizada`);
    setDetailDoc(null);
    await loadWorkspace();
  }

  // ---- Contabilidad ----
  async function registerMovement(f: {
    type: "expense" | "income";
    amount: number;
    category_id: string;
    pay_account_id: string;
    entry_date: string;
    memo: string;
  }) {
    if (!supabase || !f.amount) return;
    const amount = Number(f.amount);
    // Partida doble:
    //  Gasto  -> debe: categoria (gasto) / haber: caja o banco
    //  Ingreso-> debe: caja o banco       / haber: categoria (ingreso)
    const lines =
      f.type === "expense"
        ? [
            { account_id: f.category_id, debit: amount, credit: 0, description: f.memo },
            { account_id: f.pay_account_id, debit: 0, credit: amount, description: f.memo },
          ]
        : [
            { account_id: f.pay_account_id, debit: amount, credit: 0, description: f.memo },
            { account_id: f.category_id, debit: 0, credit: amount, description: f.memo },
          ];
    const { error } = await supabase.rpc("post_journal_entry", {
      p_entry_date: f.entry_date,
      p_memo: f.memo || (f.type === "expense" ? "Gasto" : "Ingreso"),
      p_source: f.type,
      p_source_id: null,
      p_lines: lines,
    });
    if (!error) await logAudit(f.type === "expense" ? "Gasto" : "Ingreso", `L ${amount.toLocaleString("es-HN")} · ${f.memo || ""}`);
    setNotice(error ? `No se pudo registrar: ${error.message}` : f.type === "expense" ? "Gasto registrado" : "Ingreso registrado");
    await loadWorkspace();
  }

  async function saveAccount(f: { code: string; name: string; type: AccountType }) {
    if (!supabase) return;
    const normalSide = f.type === "asset" || f.type === "expense" ? "debit" : "credit";
    const { error } = await supabase
      .from("chart_of_accounts")
      .insert({ code: f.code, name: f.name, type: f.type, normal_side: normalSide, is_postable: true });
    setNotice(error ? error.message : "Cuenta creada");
    await loadWorkspace();
  }

  async function signOut() {
    await supabase?.auth.signOut();
  }

  const filteredProducts = products.filter((product) =>
    [product.sku, product.internal_code, product.qr_payload, product.name, product.category, product.brand, product.size, product.color]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const cartTotal = cart.reduce((sum, line) => sum + line.qty * line.sale_price, 0);
  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort();
  const brands = Array.from(new Set(products.map((p) => p.brand).filter(Boolean) as string[])).sort();
  const sizes = Array.from(new Set(products.map((p) => p.size).filter(Boolean) as string[])).sort();
  const colors = Array.from(new Set(products.map((p) => p.color).filter(Boolean) as string[])).sort();
  const currentRole = users.find((u) => u.id === session?.user?.id)?.role ?? "admin";
  const allowed = ROLE_PERMISSIONS[currentRole] ?? ROLE_PERMISSIONS.admin;
  const visibleModules = modules.filter((m) => allowed.includes(m.label));

  if (!supabase) return <LoginScreen message="Configura Supabase en .env.local para usar el sistema." />;
  if (loading) return <div className="loading-screen">Cargando sistema...</div>;
  if (!session) return <AuthScreen onDone={() => void loadWorkspace()} />;

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
        <div className="session-user">
          <span>Sesion iniciada</span>
          <strong>{currentUserName()}</strong>
          <em>{roleLabel(currentRole)}</em>
        </div>
        <button className="session-button" onClick={signOut}>
          <LogOut size={17} /> Cerrar sesion
        </button>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="section-label">Inversiones del Caribe</p>
            <h1>{selectedModule}</h1>
          </div>
          <div className="topbar-actions">
            {currentRole !== "sales" && selectedModule !== "POS" && (
              <>
                <button className="primary-button" onClick={exportExcel}>
                  <Download size={17} /> Excel
                </button>
              </>
            )}
          </div>
        </header>
        {notice && (
          <div className="notice">
            <span>{notice}</span>
            <button onClick={() => setNotice("")}>Cerrar</button>
          </div>
        )}
        {currentRole === "admin" && selectedModule !== "POS" && (backupDaysAgo === null || backupDaysAgo >= 7) && (
          <div className="backup-alert">
            <span>
              {backupDaysAgo === null
                ? "Todavia no has hecho un respaldo de la base. Descargalo y guardalo en un lugar seguro."
                : `Hace ${backupDaysAgo} dias que no haces un respaldo. Conviene descargarlo cada semana.`}
            </span>
            <button className="secondary-button" onClick={() => void backupDatabase()}>
              <Download size={15} /> Respaldar ahora
            </button>
          </div>
        )}
        {selectedModule === "Dashboard" && (
          <Dashboard
            products={products}
            documents={documents}
            salesLines={salesLines}
            sellers={sellers}
            commissions={commissions}
            goTo={(m) => setSelectedModule(m as ModuleName)}
          />
        )}
        {selectedModule === "POS" && (
          <POS
            products={filteredProducts}
            cart={cart}
            setCart={setCart}
            addToCart={addToCart}
            customers={customers}
            sellers={sellers}
            issueSale={issueSale}
            total={cartTotal}
            lockSeller={currentRole === "sales"}
            currentSellerId={sellers.find((s) => s.user_id === session?.user?.id)?.id ?? null}
            printReceipt={(doc) => void downloadInvoice(doc, false, true)}
            onOpenDetail={(doc) => void openInvoiceDetail(doc)}
          />
        )}
        {selectedModule === "Inventario" && (
          <Inventory
            products={filteredProducts}
            suppliers={suppliers}
            categories={categories}
            brands={brands}
            sizes={sizes}
            colors={colors}
            saveProduct={saveProduct}
            createProductMatrix={createProductMatrix}
            deleteProduct={deleteProduct}
            registerAdjustment={registerAdjustment}
            registerPurchase={registerPurchase}
            createOrder={createOrder}
            stockRequests={stockRequests}
            receiveOrder={receiveOrder}
            receiveOrderQty={receiveOrderQty}
            cancelOrder={cancelOrder}
          />
        )}
        {selectedModule === "Facturas" && <Invoices documents={documents} onDownload={downloadInvoice} onOpen={openInvoiceDetail} />}
        {selectedModule === "Kardex" && <Kardex rows={kardex} products={products} />}
        {selectedModule === "Contabilidad" && (
          <Accounting accounts={accounts} movements={movements} journal={journal} registerMovement={registerMovement} saveAccount={saveAccount} />
        )}
        {selectedModule === "Analisis" && <Analytics products={products} sales={salesLines} />}
        {selectedModule === "Etiquetas" && <Labels products={products} />}
        {selectedModule === "Mis ventas" &&
          (() => {
            const mySeller = sellers.find((s) => s.user_id === session?.user?.id) ?? null;
            const mine = mySeller ? commissions.filter((c) => c.seller_id === mySeller.id) : [];
            return (
              <MySales
                sellerName={mySeller?.name ?? null}
                commissions={mine}
                goals={mySeller ? goals.filter((g) => g.seller_id === mySeller.id && g.active) : []}
                bonusPayments={mySeller ? bonusPayments.filter((b) => b.seller_id === mySeller.id) : []}
                onOpenInvoice={(id) => void openInvoiceById(id)}
              />
            );
          })()}
        {selectedModule === "Ofertas" && (
          <Offers products={products} categories={categories} brands={brands} onApply={applyDiscount} onClearAll={clearAllDiscounts} />
        )}
        {selectedModule === "Clientes" && (
          <Parties rows={customers} title="Clientes" kind="customer" onSave={saveParty} onDelete={deleteParty} />
        )}
        {selectedModule === "Proveedores" && (
          <Parties rows={suppliers} title="Proveedores" kind="supplier" onSave={saveParty} onDelete={deleteParty} />
        )}
        {selectedModule === "Configuracion" && (
          <UsersView
            users={users}
            auditLog={auditLog}
            onCreate={createUser}
            onUpdate={updateUser}
            onBackup={backupDatabase}
            onRestore={restoreDatabase}
            onDownloadSql={downloadSqlData}
          />
        )}
        {selectedModule === "Reportes" && (
          <Reports products={products} documents={documents} kardex={kardex} exportExcel={exportExcel} />
        )}
        {selectedModule === "Vendedores" && (
          <Sellers
            rows={sellers}
            users={users}
            commissions={commissions}
            goals={goals}
            bonusPayments={bonusPayments}
            onSave={saveSeller}
            onDelete={deleteSeller}
            onPayCommission={payCommission}
            onSaveGoal={saveGoal}
            onDeleteGoal={deleteGoal}
            onPayBonus={payBonus}
            onOpenInvoice={openInvoiceById}
          />
        )}
      </main>
      {detailDoc && (
        <InvoiceDetailModal
          doc={detailDoc}
          items={detailItems}
          products={products}
          commissionInfo={detailCommission}
          onClose={() => setDetailDoc(null)}
          onDownload={(d) => downloadInvoice(d, false, true)}
          onVoid={voidInvoice}
          onSaveEdit={saveInvoiceEdit}
          readOnly={currentRole === "sales"}
        />
      )}
    </div>
  );
}

function AuthScreen({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    if (!supabase) return;
    setError("");
    const loginEmail = normalizeLogin(email);
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    if (loginError) {
      setError(loginError.message);
      return;
    }
    onDone();
  }

  return (
    <LoginScreen>
      <div className="auth-card">
        <BrandMark />
        <label>
          Usuario o email
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="usuario" />
        </label>
        <label>
          Contraseña
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <div className="error-box">{error}</div>}
        <button className="primary-button wide" onClick={submit}>
          Entrar
        </button>
      </div>
    </LoginScreen>
  );
}

function normalizeLogin(value: string) {
  const trimmed = value.trim();
  return trimmed.includes("@") ? trimmed : `${trimmed}@inversionesdelcaribe.com`;
}
