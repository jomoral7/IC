# Inversiones del Caribe — Guía maestra del proyecto (plantilla reutilizable)

> Documento para entender el proyecto de cero y reutilizarlo como **template** en futuros
> sistemas de inventario / punto de venta / ERP pequeño. Explica qué hace cada parte,
> cómo está montado, la lógica de contabilidad y análisis, y los "trucos" aprendidos para
> no repetir errores.

---

## 1. Qué es este proyecto

Sistema de **inventario + punto de venta (POS) + contabilidad + análisis** para una tienda
de ropa/calzado con una sola sucursal. Todo web, corre en el navegador y guarda los datos
en la nube (Supabase). Pensado para un negocio pequeño manejado por su dueño.

Módulos principales:

- **Dashboard** — resumen general.
- **POS** — facturación con búsqueda, escáner, vendedor, descuento e ISV.
- **Inventario** — productos en tabla, ajustes de stock, pedidos "en camino", lector de etiqueta por foto.
- **Facturas** — listado, detalle, PDF cliente/interno, editar, anular.
- **Kardex** — historial de movimientos de inventario.
- **Vendedores** — CRUD, comisiones (por pagar / en espera / pagadas) y bonos por rangos de venta.
- **Análisis** — resumen mensual con %, productos estrella, productos que casi no se venden.
- **Contabilidad** — partida doble: gastos/ingresos, libro diario, libro mayor, estado de resultados, balance general, catálogo de cuentas.
- **Clientes / Proveedores** — CRUD de terceros.
- **Usuarios** — altas, roles y permisos que filtran el menú.

---

## 2. Tecnologías (stack)

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + Vite + TypeScript |
| Estilos | CSS plano (`src/styles.css`), sin framework |
| Íconos | `lucide-react` (⚠️ versión vieja, ver §7) |
| Backend / DB | Supabase (PostgreSQL + RLS + Edge Functions) |
| Auth | Supabase Auth (email/contraseña) |
| PDF | jsPDF |
| QR | qrcode + @zxing/browser (escáner de cámara) |
| OCR etiquetas | tesseract.js (cargado por CDN, gratis, en el navegador) |
| Exportar Excel | SheetJS (xlsx) |

No hay servidor propio: el navegador habla directo con Supabase. La lógica sensible
(crear usuarios, postear asientos con permisos) va en **Edge Functions** o en **funciones
SQL** con permisos elevados.

---

## 3. Estructura de carpetas

```
IC/
├─ iniciar.cmd              → arranca el proyecto en Windows (limpia caché de Vite)
├─ .env.local              → claves de Supabase (URL + anon key) — NO se sube a git
├─ index.html
├─ src/
│  ├─ main.tsx             → punto de entrada React
│  ├─ App.tsx              → CEREBRO: estado global, carga de datos, TODOS los handlers, menú
│  ├─ ui.tsx              → componentes reutilizables (LoginScreen, DataTable, Combobox, etc.)
│  ├─ styles.css           → todos los estilos
│  ├─ types.ts             → tipos TypeScript + catálogos precargados (categorías, colores, tallas)
│  ├─ lib/
│  │  ├─ supabase.ts       → cliente de Supabase
│  │  └─ format.ts         → helpers: lps() moneda, shortDate(), stockState(), etc.
│  └─ modules/
│     ├─ Dashboard.tsx
│     ├─ Pos.tsx
│     ├─ Inventory.tsx     → tabla, formulario de producto, ajustes, pedidos
│     ├─ Scanner.tsx       → escáner de código de barras/QR con cámara
│     ├─ LabelScanner.tsx  → lector de etiqueta por foto (OCR)
│     ├─ Records.tsx       → Facturas, Kardex, Reportes
│     ├─ InvoiceDetail.tsx → modal de detalle/editar/anular factura
│     ├─ Parties.tsx       → Clientes y Proveedores
│     ├─ Sellers.tsx       → Vendedores, comisiones, bonos
│     ├─ Users.tsx         → administración de usuarios
│     ├─ Accounting.tsx    → contabilidad completa
│     └─ Analytics.tsx     → análisis de ventas
```

**Patrón clave:** `App.tsx` es el único que habla con Supabase. Carga todo en
`loadWorkspace()` (un `Promise.all` con todas las consultas), guarda en estado, y pasa
datos + funciones (`handlers`) por props a cada módulo. Los módulos son "tontos": solo
muestran y llaman handlers. Esto hace fácil entender el flujo: **dato entra por props,
acción sale por callback**.

---

## 4. Base de datos (Supabase / PostgreSQL)

Tablas principales:

| Tabla | Para qué |
|-------|----------|
| `profiles` | usuarios del sistema (rol, activo) |
| `products` | productos (sku, nombre, categoría, costo, precio, etc.) |
| `inventory_locations` | sucursales/bodegas |
| `stock_levels` | stock por producto y sucursal |
| `inventory_movements` | kardex: cada entrada/salida |
| `stock_adjustments` | ajustes manuales (dañado, conteo, etc.) |
| `stock_requests` | pedidos a proveedor (pending/ordered/received/cancelled) → "en camino" |
| `documents` | facturas de venta y compras (kind = sale/purchase) |
| `document_items` | líneas de cada documento |
| `payments` | pagos de facturas |
| `invoice_voids` | registro de anulaciones |
| `parties` | clientes y proveedores (kind) |
| `sellers` | vendedores (% comisión) |
| `seller_commissions` | comisión por factura (pending/hold/paid/cancelled) |
| `seller_goals` | rangos de bono por ventas del mes |
| `seller_bonus_payments` | bonos pagados (1 por mes) |
| **`chart_of_accounts`** | catálogo de cuentas contables |
| **`journal_entries`** | encabezado de asiento contable |
| **`journal_lines`** | líneas debe/haber del asiento |

Funciones SQL importantes:

- `current_app_role()` — devuelve el rol del usuario actual (para las políticas RLS).
- `next_product_internal_code()` — genera el código interno consecutivo (IC-000001…).
- **`post_journal_entry(fecha, memo, source, source_id, lines_jsonb)`** — inserta un asiento
  contable **validando que debe = haber**. Es `SECURITY DEFINER` para que hasta un vendedor
  pueda generar el asiento de su venta sin permisos de admin.

Seguridad (RLS): cada tabla tiene Row Level Security. Lectura para usuarios autenticados;
escritura restringida por rol (`admin`, `manager`, `warehouse`, `sales`) usando
`current_app_role()`.

Edge Functions: `admin-create-user` y `admin-update-user` (crear/editar usuarios con la
service key escondida).

---

## 5. Cómo funciona la CONTABILIDAD (partida doble)

Concepto: cada movimiento de dinero toca **dos cuentas** — una en el **Debe** y otra en el
**Haber**, y ambos lados siempre suman igual. Nada se guarda "suelto".

**Catálogo de cuentas** (`chart_of_accounts`): lista ordenada por código, con un `type`:
`asset` (activo), `liability` (pasivo), `equity` (patrimonio), `income` (ingreso),
`expense` (gasto). Algunas tienen `system_key` (ej. `cash`, `sales`, `cogs`, `inventory`,
`tax_payable`, `commission_expense`) para que el código las encuentre.

**Asientos automáticos** que genera el sistema:

- **Venta (POS)** → Debe Caja o Cuentas por cobrar (total) · Haber Ventas (neto) + ISV por
  pagar (impuesto) · Debe Costo de venta + Haber Inventario (por el costo).
- **Anular factura** → el asiento contrario, para que todo quede cuadrado.
- **Gasto manual** → Debe la categoría de gasto · Haber Caja/Banco.
- **Ingreso manual** → Debe Caja/Banco · Haber la categoría de ingreso.
- **Pagar comisión / bono** → Debe Comisiones de vendedores · Haber Caja.

**Reportes que se calculan solos desde los asientos:**

- **Libro Diario** — todos los asientos en orden, con sus líneas debe/haber.
- **Libro Mayor** — los mismos movimientos agrupados por cuenta, con su saldo.
- **Estado de Resultados** — Ingresos − Gastos = Utilidad del período (con filtro de fechas).
- **Balance General** — Activos = Pasivos + Patrimonio. El patrimonio incluye la **utilidad
  acumulada** (ingresos − gastos) para que la ecuación cierre.

Regla de saldo: cuentas de activo y gasto tienen saldo **deudor** (debe − haber); pasivo,
patrimonio e ingreso tienen saldo **acreedor** (haber − debe).

---

## 6. Cómo funciona el ANÁLISIS de ventas

Se alimenta de `document_items` de facturas **no anuladas** (se cargan en `salesLines`).

- **Resumen mensual** — agrupa por mes: ventas, unidades, ganancia, y el **% de cambio vs
  el mes anterior** (`(mes − mesPrevio) / mesPrevio`).
- **Productos estrella** — top 10 por ingreso (revenue), con barra visual, unidades y ganancia.
- **Casi no se venden** — cruza TODOS los productos contra las ventas; los de menor rotación
  primero, **incluyendo los que tienen 0 ventas**. Sirve para decidir promociones o dejar de reponer.

Todo se recalcula en el navegador con `useMemo`, sin consultas extra.

---

## 7. Trucos y errores aprendidos (LEER antes de tocar)

Estos puntos ahorran horas de depuración:

1. **lucide-react es una versión vieja.** Varios íconos NO existen y se renderizan en blanco
   (ej. `Eye`, `FileDown`, `Coins`, `Target`, `TrendingUp`). Íconos seguros comprobados:
   `Search, Printer, Pencil, Edit3, Trash2, Plus, Minus, X, Save, Truck, ScanLine,
   PackagePlus, RotateCcw, Check, AlertTriangle, BarChart3, Wallet, Boxes, Users`.
   Si un ícono sale en blanco, es que no existe en esta versión: cámbialo por uno de la lista.

2. **El filtro `.in("columna", [...])` sobre columnas ENUM devuelve 0 filas** (por cómo
   PostgREST cita los valores). Solución: traer sin ese filtro y filtrar en el cliente
   (`array.filter(...)`). Pasó con `stock_requests.status`.

3. **Íconos que colapsan a 0px** dentro de botones flex: darles `width/height` explícito en CSS.

4. **Caché de Vite pegada.** Tras editar archivos, a veces el navegador corre el build viejo.
   Por eso `iniciar.cmd` borra `node_modules\.vite` antes de arrancar. Si algo "no cambia"
   aunque el código esté bien: reinicia con `iniciar.cmd` y hace **Ctrl+Shift+R**.

5. **Batch (.cmd) de Windows:** un paréntesis `)` dentro de un `echo` que está dentro de un
   bloque `if ( … )` cierra el bloque antes de tiempo y la ventana se cierra sola. Usar
   `goto` en vez de bloques con paréntesis, o evitar `()` en los `echo`.

6. **`post_journal_entry`**: cuidado con nombrar la variable del bucle igual que un alias de
   columna (`v_line`) → error "ambiguous". Usar un alias distinto (`elem`).

7. **Al pagar comisiones/bonos y anular facturas**, primero actualizar el registro principal
   con manejo de error, y recién después los efectos secundarios (stock, contabilidad).

8. **Backfill:** si conectas contabilidad a un sistema que ya tenía ventas, esas ventas
   viejas no tienen asiento. Hay que generarles el asiento (backfill) o no aparecen en los
   reportes.

---

## 8. Cómo arrancar el proyecto

1. Tener Node.js instalado.
2. En `.env.local` poner las claves de Supabase:
   ```
   VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-key
   ```
3. Doble clic en **`iniciar.cmd`** (instala dependencias la primera vez, limpia caché, arranca).
4. Abrir el navegador en `http://127.0.0.1:5173`.

---

## 9. Cómo reusar esto como PLANTILLA en un proyecto nuevo

Pasos sugeridos para un negocio distinto:

1. **Copiar el repo** y renombrar (marca, nombre en `BrandMark` dentro de `ui.tsx`, colores en
   `styles.css`).
2. **Crear un proyecto nuevo en Supabase** y correr las migraciones (tablas, funciones, RLS,
   catálogo de cuentas). Poner las nuevas claves en `.env.local`.
3. **Ajustar los catálogos** en `types.ts`: `CATEGORY_OPTIONS`, `COLOR_OPTIONS`,
   `LETTER_SIZES`, `SHOE_SIZES`, `GENDERS` según el rubro (si no es ropa, cambiar por lo que
   corresponda).
4. **Ajustar el catálogo de cuentas** (`chart_of_accounts`) al negocio; mantener los
   `system_key` que usa el código (`cash`, `bank`, `sales`, `cogs`, `inventory`,
   `tax_payable`, `accounts_receivable`, `commission_expense`).
5. **Quitar/añadir módulos** en el array `modules` de `App.tsx` y sus permisos por rol.
6. **Impuesto**: el ISV está al 15% (Honduras). Cambiar el `0.15` en `Pos.tsx` y en el
   asiento de venta de `App.tsx` si el país usa otro %.
7. **Moneda**: `lps()` en `lib/format.ts` formatea Lempiras; cambiarlo por la moneda local.

Todo lo demás (POS, inventario, contabilidad, análisis, comisiones) funciona igual porque la
lógica no depende del rubro, solo de los catálogos y las cuentas.

---

## 10. Convenciones para pedir cambios a futuro

Para no explicar de cero, al pedir una modificación conviene indicar:

- **En qué módulo** (Inventario, POS, Contabilidad, etc.).
- Si toca **la base de datos** (nueva tabla/columna) o solo la interfaz.
- Si el cambio afecta la **contabilidad** (¿debe generar asiento?).
- Si afecta **permisos** (¿qué roles lo ven?).

Con eso y este documento, cualquier persona (o asistente) entiende el sistema y puede
continuar sin empezar de cero.

---

*Documento generado como referencia interna del proyecto. Mantener actualizado cuando se
agreguen módulos o cambie la lógica contable.*
