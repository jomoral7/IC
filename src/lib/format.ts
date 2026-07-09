/** Formatea un monto en Lempiras: L 1,234. */
export function lps(value: number): string {
  return `L ${Number(value || 0).toLocaleString("es-HN")}`;
}

/** Fecha corta local (es-HN). */
export function shortDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString("es-HN");
}

/** Estado de stock de un producto respecto a su minimo. */
export type StockState = "out" | "low" | "ok";

export function stockState(stock: number, minStock: number): StockState {
  if (stock <= 0) return "out";
  if (stock <= minStock) return "low";
  return "ok";
}

/** Cantidad sugerida a pedir para volver a tener el doble del minimo. */
export function suggestedRestock(stock: number, minStock: number): number {
  return Math.max(minStock * 2 - stock, 1);
}
