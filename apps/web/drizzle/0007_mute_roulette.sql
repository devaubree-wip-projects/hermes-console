-- Mail was initially bootstrapped by a legacy standalone script. Keep this
-- versioned migration compatible with databases that already ran that script,
-- while making the normal db:migrate path authoritative for fresh installs.
CREATE TABLE IF NOT EXISTS "mail_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text,
	"reply_to" text,
	"sealed_secret" text NOT NULL,
	"transport" jsonb,
	"daily_limit" integer DEFAULT 100 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_credentials_tenant_id_tenants_id_fk"
		FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mail_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_id" uuid,
	"provider" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"source_url" text NOT NULL,
	"provider_message_id" text,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_sends_tenant_id_tenants_id_fk"
		FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "mail_sends_agent_id_agents_id_fk"
		FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mail_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"address" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_suppressions_tenant_id_tenants_id_fk"
		FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE "agents"
	ADD COLUMN IF NOT EXISTS "provisioning_idempotency_key" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mail_credentials_tenant_provider_uidx"
	ON "mail_credentials" USING btree ("tenant_id","provider");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mail_credentials_tenant_default_uidx"
	ON "mail_credentials" USING btree ("tenant_id") WHERE is_default;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_sends_tenant_recipient_idx"
	ON "mail_sends" USING btree ("tenant_id","recipient");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_sends_tenant_created_idx"
	ON "mail_sends" USING btree ("tenant_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mail_sends_tenant_recipient_live_uidx"
	ON "mail_sends" USING btree ("tenant_id","recipient") WHERE status <> 'failed';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mail_suppressions_tenant_address_uidx"
	ON "mail_suppressions" USING btree ("tenant_id","address");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agents_workspace_provisioning_key_uidx"
	ON "agents" USING btree ("workspace_id","provisioning_idempotency_key");
