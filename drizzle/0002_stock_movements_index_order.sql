DROP INDEX "stock_movements_product_location_idx";--> statement-breakpoint
CREATE INDEX "stock_movements_location_product_idx" ON "stock_movements" USING btree ("location_id","product_id");