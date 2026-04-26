CREATE INDEX "idx_accounts_user" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_budgets_user_month" ON "budgets" USING btree ("user_id","month");--> statement-breakpoint
CREATE INDEX "idx_transactions_user_date" ON "transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "idx_transactions_user_type" ON "transactions" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "idx_transactions_category" ON "transactions" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE INDEX "targets_user_id_idx" ON "targets" USING btree ("user_id");