CREATE INDEX "user_created_at_idx" ON "user" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "listing_owner_idx" ON "listing" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "availability_rule_listing_idx" ON "availability_rule" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "booking_listing_date_status_idx" ON "booking" USING btree ("listing_id","event_date","status");--> statement-breakpoint
CREATE INDEX "booking_customer_idx" ON "booking" USING btree ("customer_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "booking_status_date_idx" ON "booking" USING btree ("status","event_date");--> statement-breakpoint
CREATE INDEX "booking_service_type_idx" ON "booking" USING btree ("service_type_id");--> statement-breakpoint
CREATE INDEX "question_listing_status_idx" ON "question" USING btree ("listing_id","status");--> statement-breakpoint
CREATE INDEX "report_status_idx" ON "report" USING btree ("status");--> statement-breakpoint
CREATE INDEX "review_listing_status_idx" ON "review" USING btree ("listing_id","status");--> statement-breakpoint
CREATE INDEX "review_author_idx" ON "review" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "subscription_past_due_idx" ON "subscription" USING btree ("grace_until") WHERE "subscription"."status" = 'past_due';--> statement-breakpoint
CREATE INDEX "message_sender_idx" ON "message" USING btree ("sender_id","thread_id","created_at");