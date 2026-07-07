CREATE INDEX "promo_ends_idx" ON "promotion" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "promo_listing_idx" ON "promotion" USING btree ("listing_id","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_order_idx" ON "promotion" USING btree ("polar_order_id") WHERE "promotion"."polar_order_id" is not null;