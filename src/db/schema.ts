import {
  pgTable, serial, text, integer, boolean, numeric,
  timestamp, date, pgEnum, index,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', [
  'admin', 'magasinier', 'barman', 'cuisinier', 'comptable',
]);
export const locationTypeEnum = pgEnum('location_type', ['magasin', 'bar', 'cuisine']);
export const orderStatusEnum = pgEnum('order_status', ['en_attente', 'livree', 'receptionnee']);
export const movementTypeEnum = pgEnum('movement_type', [
  'reception', 'sortie_service', 'ajustement_inventaire', 'ajustement_admin',
]);
export const inventoryStatusEnum = pgEnum('inventory_status', ['brouillon', 'valide']);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull(),
  active: boolean('active').notNull().default(true),
});

export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: locationTypeEnum('type').notNull().unique(),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull().default(''),
  baseUnit: text('base_unit').notNull(),          // ex. "bouteille", "kg", "L"
  packName: text('pack_name'),                     // ex. "casier" (optionnel)
  packSize: numeric('pack_size', { precision: 12, scale: 3 }), // ex. 12
  purchasePrice: integer('purchase_price').notNull().default(0), // FCFA / unité de base
  alertThreshold: numeric('alert_threshold', { precision: 12, scale: 3 }), // par emplacement
  active: boolean('active').notNull().default(true),
});

export const saleArticles = pgTable('sale_articles', {
  id: serial('id').primaryKey(),
  cashName: text('cash_name').notNull().unique(), // nom exact dans l'export caisse
  locationId: integer('location_id').notNull().references(() => locations.id),
});

export const recipeLines = pgTable('recipe_lines', {
  id: serial('id').primaryKey(),
  saleArticleId: integer('sale_article_id').notNull()
    .references(() => saleArticles.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  qty: numeric('qty', { precision: 12, scale: 3 }).notNull(), // en unité de base
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  locationId: integer('location_id').notNull().references(() => locations.id),
  createdBy: integer('created_by').notNull().references(() => users.id),
  deliveredBy: integer('delivered_by').references(() => users.id),
  receivedBy: integer('received_by').references(() => users.id),
  status: orderStatusEnum('status').notNull().default('en_attente'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deliveredAt: timestamp('delivered_at'),
  receivedAt: timestamp('received_at'),
});

export const orderLines = pgTable('order_lines', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  qtyRequested: numeric('qty_requested', { precision: 12, scale: 3 }).notNull(),
  qtyDelivered: numeric('qty_delivered', { precision: 12, scale: 3 }),
  qtyReceived: numeric('qty_received', { precision: 12, scale: 3 }),
});

// Journal immuable : le stock d'un emplacement = somme des qty par produit.
export const stockMovements = pgTable('stock_movements', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id),
  locationId: integer('location_id').notNull().references(() => locations.id),
  type: movementTypeEnum('type').notNull(),
  qty: numeric('qty', { precision: 12, scale: 3 }).notNull(), // signée : + entrée, - sortie
  refType: text('ref_type'),   // 'order' | 'service_exit' | 'inventory' | null
  refId: integer('ref_id'),
  reason: text('reason'),      // obligatoire pour ajustement_admin
  userId: integer('user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  // location_id en tête : getLocationStock filtre par emplacement seul.
  index('stock_movements_location_product_idx').on(table.locationId, table.productId),
]);

export const serviceExits = pgTable('service_exits', {
  id: serial('id').primaryKey(),
  locationId: integer('location_id').notNull().references(() => locations.id),
  serviceDate: date('service_date').notNull(),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // Jeton généré côté client (un par soumission de formulaire) : garde d'idempotence
  // contre le double-submit. Nullable — v1 ne l'exige pas pour les écritures serveur
  // internes (aucune n'existe aujourd'hui, mais on ne veut pas bloquer un futur usage).
  clientToken: text('client_token').unique(),
});

export const serviceExitLines = pgTable('service_exit_lines', {
  id: serial('id').primaryKey(),
  serviceExitId: integer('service_exit_id').notNull()
    .references(() => serviceExits.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  qty: numeric('qty', { precision: 12, scale: 3 }).notNull(), // positive à la saisie
});

export const inventories = pgTable('inventories', {
  id: serial('id').primaryKey(),
  locationId: integer('location_id').notNull().references(() => locations.id),
  inventoryDate: date('inventory_date').notNull(),
  countedBy: integer('counted_by').notNull().references(() => users.id),
  status: inventoryStatusEnum('status').notNull().default('brouillon'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const inventoryLines = pgTable('inventory_lines', {
  id: serial('id').primaryKey(),
  inventoryId: integer('inventory_id').notNull()
    .references(() => inventories.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  qtyTheoretical: numeric('qty_theoretical', { precision: 12, scale: 3 }).notNull(),
  qtyCounted: numeric('qty_counted', { precision: 12, scale: 3 }).notNull(),
});

export const salesImports = pgTable('sales_imports', {
  id: serial('id').primaryKey(),
  filename: text('filename').notNull(),
  serviceDate: date('service_date').notNull(), // journée de service couverte
  uploadedBy: integer('uploaded_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const salesImportLines = pgTable('sales_import_lines', {
  id: serial('id').primaryKey(),
  importId: integer('import_id').notNull()
    .references(() => salesImports.id, { onDelete: 'cascade' }),
  articleNameRaw: text('article_name_raw').notNull(), // tel que lu dans le fichier
  qty: numeric('qty', { precision: 12, scale: 3 }).notNull(),
  saleArticleId: integer('sale_article_id').references(() => saleArticles.id), // null = non reconnu
});
