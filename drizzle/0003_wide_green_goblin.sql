CREATE INDEX "message_thread_idx" ON "message" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "thread_vendor_idx" ON "thread" USING btree ("vendor_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "thread_customer_idx" ON "thread" USING btree ("customer_id","last_message_at" DESC NULLS LAST);