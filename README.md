# Inversiones del Caribe - Inventario

Sistema web de inventario para compras, ventas, entradas, salidas, precios, roles y reportes.

## Stack

- React + Vite + TypeScript
- Supabase Auth + Postgres + RLS
- Lucide icons + Recharts
- Preparado para Vercel

## Desarrollo local

```bash
pnpm install
pnpm dev
```

Copia `.env.example` a `.env.local` cuando tengas el proyecto de Supabase:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Base de datos

La migracion inicial esta en `supabase/migrations/0001_inventory_core.sql`.
Incluye perfiles con roles, productos, ubicaciones, stock, proveedores/clientes,
documentos de compra/venta y movimientos de inventario con RLS.

Roles previstos:

- `admin`: acceso total.
- `manager`: gestion operativa y reportes.
- `warehouse`: inventario, entradas, salidas y stock.
- `sales`: ventas y clientes.

## Marca

Se aplicaron los lineamientos del manual:

- Principal: `#14384C`
- Contraste: `#0B2533`
- Acento mostaza: `#D9A13B`
- Acento coral: `#D9604C`
- Fondo claro: `#F6F1E7`
- Titulares estilo Archivo, texto estilo Work Sans.
