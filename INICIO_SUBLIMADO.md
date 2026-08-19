# Arranque — Sistema para el taller de SUBLIMADO (chat nuevo)

> Pega este texto (o compártelo) al iniciar el chat nuevo para dar contexto de una,
> sin re-explicar todo. Los detalles completos están en `PROPUESTA_SUBLIMADO.md` y la
> base técnica reutilizable en `PROYECTO_TEMPLATE.md`.

---

## Contexto para el asistente

Ya tengo un sistema funcionando: **"Inversiones del Caribe"** (tienda de ropa) hecho en
**React + Vite + TypeScript + Supabase**, con inventario por variante, POS, contabilidad de
partida doble, análisis, ofertas, comisiones/bonos, kardex, respaldo, bitácora de auditoría y
un dashboard de administrador. Todo eso está documentado en `PROYECTO_TEMPLATE.md`.

Ahora quiero construir un **sistema NUEVO y separado para mi taller de sublimado**, reusando
lo más posible de esa base. La propuesta ya la dejamos escrita en `PROPUESTA_SUBLIMADO.md`.

## Qué es el negocio

Taller de **sublimado** (estampado): vendo camisas y otros productos con diseño/estampado.
No es venta de mostrador de estante — es **producción por pedido** (orden de trabajo). Manejo
también la **gestión** del proceso hasta entregar.

## Lo que se reutiliza de la base actual

Inventario, compras, contabilidad (partida doble), análisis, clientes, proveedores, usuarios,
roles, respaldo, bitácora. Mismo stack (React+Vite+TS+Supabase).

## Lo nuevo / distinto (a construir)

1. **Inventario de materiales/insumos** (tinta, papel, camisas blancas, tazas, etc.) con
   unidad de medida, compra y **consumo**.
2. **Recetas (BOM)**: qué material consume cada producto al fabricarlo (para descontar
   material y saber el costo real). La tinta se maneja por **rendimiento** (una botella rinde
   ~X impresiones) o como gasto general — no hace falta precisión de ml.
3. **Órdenes de trabajo** (reemplazan el POS): cliente + líneas (producto + diseño + cantidad +
   precio que incluye camisa+estampado) + fecha prometida + **anticipo/abono** + estado.
4. **Planner / tablero Kanban** de producción: Cotización → Arte aprobado → Materiales listos →
   Impresión → Prensado → Control de calidad → Empaque → Entregado. Con límites de WIP.
5. **Control de calidad**: registrar buenas vs. defectuosas/reprocesos + motivo (alimenta
   métricas Six Sigma y descuenta el material desperdiciado).
6. **Métricas**: lead time, cumplimiento de fecha prometida, FPY (% a la primera), % de
   reprocesos, costo real vs. cotizado, material más desperdiciado.

## Metodologías a aplicar

- **Agile**: construir por sprints; y operar con el tablero Kanban (WIP limits).
- **Lean**: reducir desperdicio (material, reprocesos, inventario muerto).
- **Six Sigma**: reducir defectos/reprocesos con DMAIC y datos reales.

## Roadmap sugerido (por sprints)

1. MVP: inventario de materiales + camisas con compra/consumo manual; crear órdenes de
   trabajo; kanban simple (pendiente / en proceso / entregado).
2. Recetas (BOM) → consumo automático → costo real por orden.
3. Calidad: buenas/defectuosas + motivo → métricas.
4. Contabilidad conectada (orden → asiento) + análisis Lean.

## Preguntas pendientes para afinar (contestar al arrancar)

1. ¿Qué produzco además de camisas? (tazas, gorras, cojines…)
2. ¿Cuáles son las etapas reales de mi proceso, del pedido a la entrega? (columnas del kanban)
3. ¿Trabajo con anticipos/abonos (mitad al pedir, resto al entregar)?
4. ¿Quiero guardar los archivos de diseño de cada orden, o eso va aparte?

## Decisiones de arranque

- ¿Proyecto nuevo desde cero o copio el repo de "Inversiones del Caribe" y lo adapto?
- ¿Base de datos Supabase nueva (recomendado) o la misma?

---

*Con esto el chat nuevo entiende todo el contexto y podemos arrancar directo por el Sprint 1.*
