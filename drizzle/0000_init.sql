CREATE TYPE "public"."inventory_status" AS ENUM('brouillon', 'valide');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('magasin', 'bar', 'cuisine');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('reception', 'sortie_service', 'ajustement_inventaire', 'ajustement_admin');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('en_attente', 'livree', 'receptionnee');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'magasinier', 'barman', 'cuisinier', 'comptable');--> statement-breakpoint
CREATE TABLE "inventories" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"inventory_date" date NOT NULL,
	"counted_by" integer NOT NULL,
	"status" "inventory_status" DEFAULT 'brouillon' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"inventory_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"qty_theoretical" numeric(12, 3) NOT NULL,
	"qty_counted" numeric(12, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "location_type" NOT NULL,
	CONSTRAINT "locations_type_unique" UNIQUE("type")
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"qty_requested" numeric(12, 3) NOT NULL,
	"qty_delivered" numeric(12, 3),
	"qty_received" numeric(12, 3)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"delivered_by" integer,
	"received_by" integer,
	"status" "order_status" DEFAULT 'en_attente' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"delivered_at" timestamp,
	"received_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"base_unit" text NOT NULL,
	"pack_name" text,
	"pack_size" numeric(12, 3),
	"purchase_price" integer DEFAULT 0 NOT NULL,
	"alert_threshold" numeric(12, 3),
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_article_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"qty" numeric(12, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"cash_name" text NOT NULL,
	"location_id" integer NOT NULL,
	CONSTRAINT "sale_articles_cash_name_unique" UNIQUE("cash_name")
);
--> statement-breakpoint
CREATE TABLE "sales_import_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_id" integer NOT NULL,
	"article_name_raw" text NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"sale_article_id" integer
);
--> statement-breakpoint
CREATE TABLE "sales_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"service_date" date NOT NULL,
	"uploaded_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_exit_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_exit_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"qty" numeric(12, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_exits" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"service_date" date NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"type" "movement_type" NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"ref_type" text,
	"ref_id" integer,
	"reason" text,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_counted_by_users_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lines" ADD CONSTRAINT "inventory_lines_inventory_id_inventories_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lines" ADD CONSTRAINT "inventory_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivered_by_users_id_fk" FOREIGN KEY ("delivered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_sale_article_id_sale_articles_id_fk" FOREIGN KEY ("sale_article_id") REFERENCES "public"."sale_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_articles" ADD CONSTRAINT "sale_articles_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_import_lines" ADD CONSTRAINT "sales_import_lines_import_id_sales_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."sales_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_import_lines" ADD CONSTRAINT "sales_import_lines_sale_article_id_sale_articles_id_fk" FOREIGN KEY ("sale_article_id") REFERENCES "public"."sale_articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_imports" ADD CONSTRAINT "sales_imports_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_exit_lines" ADD CONSTRAINT "service_exit_lines_service_exit_id_service_exits_id_fk" FOREIGN KEY ("service_exit_id") REFERENCES "public"."service_exits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_exit_lines" ADD CONSTRAINT "service_exit_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_exits" ADD CONSTRAINT "service_exits_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_exits" ADD CONSTRAINT "service_exits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;