import { AlertTriangle, Boxes, ClipboardList, ShoppingBag } from "lucide-react";
import type { Product } from "../types";
import { lps } from "../lib/format";
import { Metric } from "../ui";

export function Dashboard({
  products,
  documents,
  lowStock,
  goTo,
}: {
  products: Product[];
  documents: any[];
  lowStock: Product[];
  goTo: (module: string) => void;
}) {
  const inventoryValue = products.reduce((sum, product) => sum + product.stock * product.real_cost, 0);
  return (
    <>
      <section className="kpi-grid">
        <Metric label="Productos activos" value={String(products.length)} detail="Catalogo real" />
        <Metric
          label="Stock bajo"
          value={String(lowStock.length)}
          detail="Requieren pedido"
          tone={lowStock.length > 0 ? "warning" : undefined}
        />
        <Metric label="Facturas" value={String(documents.length)} detail="Ultimos documentos" />
        <Metric label="Valor inventario" value={lps(inventoryValue)} detail="Costo real x stock" />
      </section>
      <section className="work-queue">
        <button onClick={() => goTo("Inventario")}>
          <Boxes size={18} />
          <strong>Gestionar productos</strong>
          <span>Crear, editar, ajustar, recibir pedidos y QR.</span>
        </button>
        <button onClick={() => goTo("POS")}>
          <ShoppingBag size={18} />
          <strong>Abrir POS</strong>
          <span>Buscar, vender y emitir factura.</span>
        </button>
        <button onClick={() => goTo("Inventario")}>
          <AlertTriangle size={18} />
          <strong>Reponer stock</strong>
          <span>Filtra stock bajo y crea pedidos.</span>
        </button>
        <button onClick={() => goTo("Kardex")}>
          <ClipboardList size={18} />
          <strong>Ver Kardex</strong>
          <span>Historial real de movimientos.</span>
        </button>
      </section>
    </>
  );
}
