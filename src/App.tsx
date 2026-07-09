import {
  BarChart3,
  Boxes,
  Building2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  LogOut,
  Menu,
  ReceiptText,
  Search,
  ShoppingBag,
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
import type { Account, AccountType, BonusPayment, CashMovement, CartLine, Commission, JournalEntryFull, Location, Party, Product, ProductForm, PurchaseLine, Seller, SellerGoal, UserProfile } from "./types";
import { BrandMark, LoginScreen } from "./ui";
import { Dashboard } from "./modules/Dashboard";
import { POS } from "./modules/Pos";
import { Inventory } from "./modules/Inventory";
import { Invoices, Kardex, Reports } from "./modules/Records";
import { Parties } from "./modules/Parties";
import { Sellers } from "./modules/Sellers";
import { Users as UsersView } from "./modules/Users";
import { Accounting } from "./modules/Accounting";
import { InvoiceDetailModal, type InvoiceItem } from "./modules/InvoiceDetail";

const modules = [
  { label: "Dashboard", icon: BarChart3 },
  { label: "POS", icon: ShoppingBag },
  { label: "Inventario", icon: Boxes },
  { label: "Facturas", icon: ReceiptText },
  { label: "Kardex", icon: ClipboardList },
  { label: "Vendedores", icon: UserRound },
  { label: "Contabilidad", icon: Wallet },
  { label: "Clientes", icon: Users },
  { label: "Proveedores", icon: Truck },
  { label: "Usuarios", icon: Users },
  { label: "Reportes", icon: FileSpreadsheet },
] as const;

type ModuleName = (typeof modules)[number]["label"];

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
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
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

  // Auto-ocultar la notificacion tras unos segundos.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function loadWorkspace() {
    if (!supabase) return;
    setLoading(true);
    const [productRes, stockRes, supplierRes, customerRes, locationRes, documentRes, kardexRes, userRes, sellerRes, requestRes, commissionRes, goalRes, bonusRes, accountRes, movementRes] =
      await Promise.all([
        supabase.from("products").select("*").eq("active", true).order("name"),
        supabase.from("stock_levels").select("product_id, quantity, location_id"),
        supabase.from("parties").select("id, name, kind, tax_id, phone").eq("kind", "supplier").order("name"),
        supabase.from("parties").select("id, name, kind, tax_id, phone").eq("kind", "customer").order("name"),
        supabase.from("inventory_locations").select("id, name").order("name"),
        supabase.from("documents").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("inventory_kardex").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("profiles").select("id, full_name, username, role, active").order("full_name"),
        supabase.from("sellers").select("id, name, code, phone, commission_rate, active").order("name"),
        supabase.from("stock_requests").select("id, product_id, requested_quantity, status, supplier_id, created_at"),
        supabase
          .from("seller_commissions")
          .select("id, seller_id, document_id, base_amount, commission_amount, status, created_at, documents(document_number, customer_name, total, created_at)")
          .order("created_at", { ascending: false }),
        supabase.from("seller_goals").select("*").order("min_sales"),
        supabase.from("seller_bonus_payments").select("id, seller_id, goal_id, period, bonus"),
        supabase.from("chart_of_accounts").select("*").eq("active", true).order("code"),
        supabase
          .from("journal_entries")
          .select("id, entry_date, memo, source, created_at, journal_lines(debit, credit, account_id, chart_of_accounts(code, name, type, system_key))")
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(500),
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
      (productRes.data ?? []).map((product) => ({
        ...product,
        stock: Number(totals.get(product.id) ?? 0),
        stockByLocation: byLocation.get(product.id) ?? {},
        incoming: Number(incomingByProduct.get(product.id) ?? 0),
      })),
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

    // Movimientos de caja = asientos de gasto/ingreso, resumidos para la tabla amigable.
    setMovements(
      fullJournal
        .filter((e) => e.source === "expense" || e.source === "income")
        .map((e) => {
          const amount = e.lines.reduce((s, l) => s + l.debit, 0);
          const isIncome = e.source === "income";
          const categoryLine = e.lines.find((l) => l.account_type === (isIncome ? "income" : "expense"));
          const payLine = e.lines.find((l) => {
            const acc = accountRes.data?.find((a: any) => a.id === l.account_id);
            return acc?.system_key === "cash" || acc?.system_key === "bank";
          });
          return {
            id: e.id,
            entry_date: e.entry_date,
            memo: e.memo,
            type: isIncome ? "income" : "expense",
            amount,
            category_name: categoryLine?.account_name ?? null,
            pay_account_name: payLine?.account_name ?? null,
            created_at: e.created_at,
          } as CashMovement;
        }),
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
    const location = await ensureLocation();
    const { data, error } = id
      ? await supabase.from("products").update(payload).eq("id", id).select("*").single()
      : await supabase.from("products").insert(payload).select("*").single();
    if (error) {
      setNotice(error.message);
      return;
    }
    await supabase
      .from("stock_levels")
      .upsert({ product_id: data.id, location_id: location.id, quantity: Number(form.stock) });
    setNotice("Producto guardado");
    await loadWorkspace();
  }

  async function createUser(payload: { username: string; password: string; full_name: string; role: string }) {
    if (!supabase) return;
    const { data, error } = await supabase.functions.invoke("admin-create-user", { body: payload });
    if (error || data?.error) {
      setNotice(data?.error ?? error?.message ?? "No se pudo crear usuario");
      return;
    }
    setNotice("Usuario creado");
    await loadWorkspace();
  }

  async function updateUser(payload: { id: string; full_name?: string; role?: string; active?: boolean; password?: string }) {
    if (!supabase) return;
    const { data, error } = await supabase.functions.invoke("admin-update-user", { body: payload });
    if (error || data?.error) {
      setNotice(data?.error ?? error?.message ?? "No se pudo actualizar el usuario");
      return;
    }
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

  async function saveSeller(form: { name: string; code: string; phone: string; commission_rate: number; active: boolean }, id?: string) {
    if (!supabase) return;
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      phone: form.phone.trim() || null,
      commission_rate: form.commission_rate,
      active: form.active,
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
      .upsert({ seller_id: sellerId, goal_id: goalId, period, sales, bonus, status: "paid" }, { onConflict: "seller_id,goal_id,period" });
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
      return [...current, { ...product, qty: 1 }];
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

    setCart([]);
    setNotice(`Factura ${document.document_number} emitida`);
    await loadWorkspace();
  }

  function exportExcel() {
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, utils.json_to_sheet(products), "Inventario");
    utils.book_append_sheet(workbook, utils.json_to_sheet(documents), "Facturas");
    utils.book_append_sheet(workbook, utils.json_to_sheet(kardex), "Kardex");
    writeFile(workbook, "inversiones-del-caribe.xlsx");
  }

  type InvoiceLine = { qty: number; name: string; size: string | null; category: string | null; brand: string | null; color: string | null; sale_price: number };

  async function buildInvoicePdf(number: string, lines: InvoiceLine[], total: number, customer?: string, dateStr?: string, internal?: { sellerName: string | null; commission: number }, amounts?: { subtotal: number; discount: number; tax: number }) {
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
      if (variant) {
        pdf.setFontSize(8);
        pdf.setTextColor("#667782");
        pdf.text(variant, 96, y + 12);
        pdf.setFontSize(10);
        pdf.setTextColor("#0B2533");
      }
      pdf.text(`L ${(line.qty * line.sale_price).toLocaleString("es-HN")}`, 482, y);
      y += variant ? 34 : 24;
    });

    // Desglose (subtotal / descuento / ISV) si aplica
    if (amounts && (amounts.discount > 0 || amounts.tax > 0)) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor("#667782");
      y += 8;
      pdf.text("Subtotal", 360, y);
      pdf.text(`L ${amounts.subtotal.toLocaleString("es-HN")}`, 482, y);
      if (amounts.discount > 0) {
        y += 16;
        pdf.text("Descuento", 360, y);
        pdf.text(`- L ${amounts.discount.toLocaleString("es-HN")}`, 482, y);
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
      pdf.text(`Comision: L ${internal.commission.toLocaleString("es-HN")}`, 360, iy + 40);
    }

    pdf.save(`factura-${internal ? "interna-" : ""}${number}.pdf`);
  }

  async function downloadInvoice(doc: any, internal = false) {
    if (!supabase) return;
    const { data: items, error } = await supabase
      .from("document_items")
      .select("quantity, unit_price, products(name, size, category, brand, color)")
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
    await buildInvoicePdf(doc.document_number, lines, Number(doc.total), customer, dateStr, internalInfo, {
      subtotal: Number(doc.subtotal ?? doc.total),
      discount: Number(doc.discount ?? 0),
      tax: Number(doc.tax ?? 0),
    });
  }

  async function openInvoiceDetail(doc: any) {
    if (!supabase) return;
    const { data: rows, error } = await supabase
      .from("document_items")
      .select("product_id, quantity, unit_price, products(name, size, internal_code, sku, category, brand, color)")
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
    const { error: commErr } = await supabase
      .from("seller_commissions")
      .update({ status: "cancelled" })
      .eq("document_id", doc.id);
    if (commErr) setNotice(`Anulada, pero la comision no se cancelo: ${commErr.message}`);

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

    if (!voidErr && !commErr) setNotice(`Factura ${doc.document_number} anulada`);
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

    // Recalcular comision si existe.
    const { data: comm } = await supabase.from("seller_commissions").select("id, rate").eq("document_id", doc.id).maybeSingle();
    if (comm) {
      await supabase
        .from("seller_commissions")
        .update({ base_amount: subtotal, commission_amount: Number((subtotal * Number(comm.rate)).toFixed(2)) })
        .eq("id", comm.id);
    }

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
  const lowStock = products.filter((product) => product.stock <= product.min_stock);
  const cartTotal = cart.reduce((sum, line) => sum + line.qty * line.sale_price, 0);
  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort();
  const brands = Array.from(new Set(products.map((p) => p.brand).filter(Boolean) as string[])).sort();
  const sizes = Array.from(new Set(products.map((p) => p.size).filter(Boolean) as string[])).sort();
  const colors = Array.from(new Set(products.map((p) => p.color).filter(Boolean) as string[])).sort();
  const currentRole = users.find((u) => u.id === session?.user?.id)?.role ?? "admin";
  const rolePermissions: Record<string, ModuleName[]> = {
    admin: modules.map((m) => m.label),
    manager: ["Dashboard", "POS", "Inventario", "Facturas", "Kardex", "Vendedores", "Contabilidad", "Clientes", "Proveedores", "Reportes"],
    warehouse: ["Dashboard", "Inventario", "Proveedores", "Kardex"],
    sales: ["Dashboard", "POS", "Clientes", "Facturas"],
  };
  const allowed = rolePermissions[currentRole] ?? rolePermissions.admin;
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
            <div className="searchbox">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar producto, cliente, factura o proveedor"
              />
            </div>
            <button className="branch-button">
              <Building2 size={17} /> Todas las sucursales
            </button>
            <button className="primary-button" onClick={exportExcel}>
              <Download size={17} /> Excel
            </button>
          </div>
        </header>
        {notice && (
          <div className="notice">
            <span>{notice}</span>
            <button onClick={() => setNotice("")}>Cerrar</button>
          </div>
        )}
        {selectedModule === "Dashboard" && (
          <Dashboard products={products} documents={documents} lowStock={lowStock} goTo={(m) => setSelectedModule(m as ModuleName)} />
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
        {selectedModule === "Kardex" && <Kardex rows={kardex} />}
        {selectedModule === "Contabilidad" && (
          <Accounting accounts={accounts} movements={movements} journal={journal} registerMovement={registerMovement} saveAccount={saveAccount} />
        )}
        {selectedModule === "Clientes" && (
          <Parties rows={customers} title="Clientes" kind="customer" onSave={saveParty} onDelete={deleteParty} />
        )}
        {selectedModule === "Proveedores" && (
          <Parties rows={suppliers} title="Proveedores" kind="supplier" onSave={saveParty} onDelete={deleteParty} />
        )}
        {selectedModule === "Usuarios" && <UsersView users={users} onCreate={createUser} onUpdate={updateUser} />}
        {selectedModule === "Reportes" && (
          <Reports products={products} documents={documents} kardex={kardex} exportExcel={exportExcel} />
        )}
        {selectedModule === "Vendedores" && (
          <Sellers
            rows={sellers}
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
          onDownload={(d) => downloadInvoice(d, false)}
          onVoid={voidInvoice}
          onSaveEdit={saveInvoiceEdit}
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
