CREATE TABLE "runtime_installation_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"service_secret" text NOT NULL,
	"ticket_secret" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runtime_installation_secrets" ADD CONSTRAINT "runtime_installation_secrets_installation_id_runtime_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."runtime_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_installation_secrets" ADD CONSTRAINT "runtime_installation_secrets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_installation_secrets_active_uidx" ON "runtime_installation_secrets" USING btree ("installation_id") WHERE "runtime_installation_secrets"."status" = 'active';--> statement-breakpoint
CREATE INDEX "runtime_installation_secrets_installation_status_idx" ON "runtime_installation_secrets" USING btree ("installation_id","status");