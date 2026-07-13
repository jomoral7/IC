# Propuesta — Adaptar el sistema para el taller de SUBLIMADO

> Documento de ideas / borrador. NO está construido todavía. Sirve para retomar la
> conversación cuando decidamos armar la versión para el taller de sublimado.
> (El sistema base es "Inversiones del Caribe" — ver `PROYECTO_TEMPLATE.md`.)

---

## 1. La idea en una frase

Reusar la base actual (inventario, compras, contabilidad, análisis, clientes, usuarios) pero
cambiar el corazón: en vez de vender de mostrador (POS), se **producen órdenes de trabajo**
que pasan por un proceso hasta entregarse. Se vende **camisa + estampado + servicio**, no una
camisa de estante.

Ya tenemos ~70-80% hecho. Lo nuevo es la parte de **producción**.

---

## 2. Qué se reusa tal cual

- Inventario (se adapta a materiales).
- Compras / entradas de material.
- Kardex (movimientos).
- Contabilidad de partida doble.
- Análisis de ventas (se enriquece).
- Clientes, Proveedores, Usuarios, Roles.

## 3. Qué se agrega (lo nuevo)

### a) Inventario de materiales (insumos)
Como el inventario actual, pero para consumibles: tinta (ml o botellas), papel (hojas),
camisas blancas (por talla/color), tazas, vinil, cinta, etc. Se agrega **unidad de medida** y
la distinción material vs producto terminado. Con stock, mínimo, costo, **compras** y
**consumo**.

### b) Recetas (BOM – Bill of Materials)
Por cada producto a fabricar (ej. "Camisa sublimada full color talla M") se define qué
consume. Al producir, descuenta solo. Conecta inventario ↔ producción ↔ costo real ↔
desperdicio.

**Importante — la receta NO tiene que ser perfecta desde el día 1:**
- **Lo que se sabe exacto:** 1 camisa sublimada = 1 camisa blanca + 1 hoja de papel (o 2 si
  es doble cara). Eso es 100% contable.
- **La tinta (lo incierto):** no se mide en ml. Se usa **rendimiento**: una botella que costó
  X rinde ~Y impresiones → costo de tinta por camisa = precio botella ÷ impresiones que rinde.
  Ese número se afina con el uso real (Lean/Six Sigma: estimar → medir → ajustar).
- **Aún más simple:** la tinta se puede tratar como **gasto general** (se registra al comprar
  la botella) y la receta solo descuenta camisa + papel. Menos precisión, pero arranca sin
  trabarse.
- La receta puede ser **opcional por producto**: los que tengan receta descuentan solo; los
  demás se ajustan a mano.

### c) Órdenes de trabajo (reemplaza el POS)
Cliente, líneas (producto + diseño + cantidad + precio que ya incluye camisa+estampado),
fecha prometida, **anticipo/abono**, y estado. Al entregar, genera la factura y el ingreso
contable. Es casi el mismo POS, pero con estado y fecha de entrega.

### d) Planner / Tablero Kanban (el módulo estrella)
Cada orden es una tarjeta que se mueve por columnas del proceso. Ejemplo de columnas:
*Cotización → Arte aprobado → Materiales listos → Impresión → Prensado → Control de calidad →
Empaque → Entregado*. Se ve de un vistazo lo pendiente y dónde se atasca cada trabajo.
Con **límites de WIP** (trabajo en proceso) para no arrancar 20 órdenes y no terminar ninguna.

### e) Control de calidad
Al cerrar producción se registra cuántas salieron **buenas** vs **defectuosas/reprocesadas** y
el motivo (color, posición, temperatura, tela). Alimenta las métricas y descuenta el material
desperdiciado del costo real.

---

## 4. Cómo entra cada metodología

- **Agile:** construir por sprints (entregar algo usable en cada uno). Y operar el taller con
  el tablero Kanban = gestión ágil visual con límites de WIP.
- **Lean (eliminar desperdicio):** producir contra pedido (pull), puntos de reorden para no
  sobrecomprar, medir y acortar el **lead time** (pedido → entrega), evitar inventario muerto.
- **Six Sigma (reducir defectos):** cada reproceso = papel + tinta + camisa perdidos = dinero.
  Medir **FPY** (% que sale bien a la primera), **Pareto de causas** de defecto, y costo del
  desperdicio en L. Aplicar DMAIC (medir → analizar → mejorar → controlar) con datos reales.

---

## 5. Métricas que daría el sistema

Además de ventas/utilidad: lead time promedio, **cumplimiento de fecha prometida** (on-time %),
FPY / % de reprocesos, **costo real vs cotizado** por orden (¿estoy cobrando bien?), consumo de
material por tipo, material que más se desperdicia, y diseños/productos más pedidos.

---

## 6. Roadmap ágil sugerido (por sprints)

1. **MVP:** inventario de materiales + camisas con compra y consumo manual; crear órdenes de
   trabajo; kanban simple (pendiente / en proceso / entregado).
2. **Recetas (BOM):** consumo automático de materiales al producir → costo real por orden.
3. **Calidad:** registro de buenas/defectuosas + motivo → métricas Six Sigma (FPY, Pareto).
4. **Cierre:** contabilidad conectada (orden → asiento) + análisis Lean (lead time, on-time,
   desperdicio).

---

## 7. Preguntas pendientes para afinar (antes de construir)

1. ¿Qué se produce además de camisas? (tazas, gorras, cojines…) → define tipos de producto y receta.
2. ¿Cuáles son las etapas reales del proceso, del pedido a la entrega? → columnas del kanban.
3. ¿Se trabaja con anticipos/abonos (mitad al pedir, resto al entregar)?
4. ¿Se quiere control de diseños (guardar el arte/archivo de cada orden) o eso va aparte?

---

*Pendiente de decisión. Retomar después del feedback de la contabilidad del sistema de ventas.*
