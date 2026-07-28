-- Le module mail n'admettait qu'un seul message par adresse, à vie, et exigeait
-- l'URL d'un avis public : de la prospection à froid, et rien d'autre. Relancer
-- une facture — le premier usage du produit — y était structurellement impossible.
-- `nature` sépare les deux régimes ; les lignes existantes sont toutes de la
-- prospection, que le DEFAULT couvre sans backfill.
DROP INDEX "mail_sends_tenant_recipient_live_uidx";--> statement-breakpoint
ALTER TABLE "mail_sends" ALTER COLUMN "source_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_sends" ADD COLUMN "nature" text DEFAULT 'prospection' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "mail_sends_tenant_recipient_live_uidx" ON "mail_sends" USING btree ("tenant_id","recipient") WHERE status <> 'failed' AND nature = 'prospection';