ALTER TABLE "service_exits" ADD COLUMN "client_token" text;--> statement-breakpoint
ALTER TABLE "service_exits" ADD CONSTRAINT "service_exits_client_token_unique" UNIQUE("client_token");