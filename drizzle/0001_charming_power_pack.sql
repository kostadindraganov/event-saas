CREATE INDEX "listing_cat_pub_idx" ON "listing" USING btree ("category_id","published_at" DESC NULLS LAST) WHERE "listing"."status" = 'published';--> statement-breakpoint
CREATE INDEX "listing_city_pub_idx" ON "listing" USING btree ("city_id","published_at" DESC NULLS LAST) WHERE "listing"."status" = 'published';--> statement-breakpoint
CREATE INDEX "listing_pub_idx" ON "listing" USING btree ("published_at" DESC NULLS LAST) WHERE "listing"."status" = 'published';--> statement-breakpoint
CREATE INDEX "listing_image_idx" ON "listing_image" USING btree ("listing_id","sort_order");--> statement-breakpoint
CREATE INDEX "lsr_region_idx" ON "listing_service_region" USING btree ("region_id");