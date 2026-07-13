# Ideas y pendientes — Inversiones del Caribe

> Cosas conversadas que NO están implementadas. Quedan como referencia para decidir después.
> (El sistema base está en `PROYECTO_TEMPLATE.md`.)

---

## Contexto real del negocio (importante)

- Es una tienda que **vende por internet**: Instagram / Facebook / WhatsApp.
- A veces la **vendedora hace ventas presenciales**.
- Cobran por: **transferencia / depósito**, **contra entrega**, y **envío por paquetería**.
- **No** necesitan seguimiento de estado de pedidos por ahora (solo registrar la venta y descontar stock).
- **La contabilidad la lleva la hermana** (usuaria real de ese módulo) — no es un extra.
- La hermana llega el **17** para registrar el inventario real por primera vez.

Implicación: NO es una tienda de mostrador diario. Por eso se descartan features de caja física.

---

## Idea pendiente #1 — Forma de pago en el POS (con ruteo a Caja/Banco)

Hoy el POS solo tiene "Contado / Crédito". La idea es agregar **cómo se pagó**:

- **Efectivo** → entra a la cuenta **Caja**.
- **Transferencia** → entra a la cuenta **Banco** (no a Caja).
- **Contra entrega** → queda **pendiente** hasta confirmar que se recibió y pagó.

Por qué importa: la hermana (que lleva la contabilidad) va a querer distinguir qué está en el
banco vs en efectivo. Hoy todo cae en "Caja". Como cobran casi todo por transferencia, esto
haría que sus libros reflejen la realidad.

Esfuerzo: chico. Encaja directo con cómo cobran.

---

## Congelado (no aplica a tienda online — no implementar por ahora)

- **Cierre de caja diario** — es de tienda física con caja registradora. No aplica.
- **Vuelto en el POS** ("paga con X, vuelto Y") — idem, mostrador físico.
- **Seguimiento de pedidos** (pendiente → pagado → enviado → entregado) — no lo necesitan aún.
- **Análisis profundo** (GMROI, ABC, rotación) — ya construido; no invertir más hasta tener
  meses de datos reales.
- **"Todas las sucursales"** — solo hay una sucursal; el botón es UI muerta (se podría esconder).

---

## Núcleo que debe quedar impecable para el 17

1. **Inventario** — crear por matriz (fila por fila), vista agrupada por producto, etiquetas QR.
2. **POS** — registrar venta sin fricción (online y presencial con vendedor fijo).
3. **Facturas** — emitir, anular (con devolución), editar.
4. **Contabilidad** — que la hermana la valide con datos reales.

Todo lo demás: esperar el uso real y decidir según lo que de verdad se usa.

---

*Anotado como referencia. Retomar después del feedback del uso real.*
