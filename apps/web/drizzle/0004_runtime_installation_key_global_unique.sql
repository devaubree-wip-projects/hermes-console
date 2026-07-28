DO $$
DECLARE duplicated text;
BEGIN
  SELECT string_agg(installation_key, ', ') INTO duplicated
  FROM (
    SELECT installation_key
    FROM runtime_installations
    GROUP BY installation_key
    HAVING count(*) > 1
  ) AS shared;
  IF duplicated IS NOT NULL THEN
    RAISE EXCEPTION 'Plusieurs installations Edge partagent la meme cle (%). Le secret de service est derive de cette cle seule : chacun de ces tenants peut donc s''authentifier a la place des autres. Attribuez une cle propre a chaque installation (et reconfigurez son Edge) avant de rejouer cette migration.', duplicated;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_installations_key_uidx" ON "runtime_installations" USING btree ("installation_key");