-- New layer_key values for the CTA bus and Metra overlays.
-- ALTER TYPE ... ADD VALUE runs inside a transaction on PostgreSQL 12+ as long
-- as the new value is not used in the same transaction; this migration only
-- adds them, and the ingest job writes rows later.
ALTER TYPE "public"."layer_key" ADD VALUE IF NOT EXISTS 'bus-routes';--> statement-breakpoint
ALTER TYPE "public"."layer_key" ADD VALUE IF NOT EXISTS 'bus-stops';--> statement-breakpoint
ALTER TYPE "public"."layer_key" ADD VALUE IF NOT EXISTS 'metra-lines';--> statement-breakpoint
ALTER TYPE "public"."layer_key" ADD VALUE IF NOT EXISTS 'metra-stations';
