import "server-only";

import { and, count, eq, gte, ne } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, mailCredentials, mailSends, mailSuppressions } from "@/db/schema";
import { openSecret, sealSecret } from "@/lib/hermes/secret-vault";
import {
  autoriseEnvoi,
  normaliseAdresse,
  statutHttp,
  type DemandeEnvoi,
  type MailProvider,
} from "../domain/mail-policy";
import { envoie, RelaisError } from "./mail-providers";

// La Console détient les relais pour le compte du tenant : elle applique la
// politique, journalise, audite, et n'expose jamais un secret en retour.

export type ResultatEnvoi =
  | { ok: true; id: string; provider: MailProvider; providerMessageId: string }
  | { ok: false; status: number; raison: string; message: string };

export type DemandeApi = DemandeEnvoi & { provider?: MailProvider };

/** Le contexte lie le chiffré à sa ligne : un secret déplacé d'un relais à l'autre ne s'ouvre pas. */
function contexteSecret(credentialId: string) {
  return `mail-credential:${credentialId}`;
}

function estViolationUnicite(error: unknown) {
  return (error as { code?: string })?.code === "23505";
}

function debutDuJour() {
  const maintenant = new Date();
  // Journée UTC : le quota protège le relais, pas l'agenda de l'utilisateur, et
  // une frontière stable vaut mieux qu'une frontière juste mais dépendante d'un
  // fuseau que le tenant peut changer.
  return new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()));
}

async function relaisDuTenant(tenantId: string, provider?: MailProvider) {
  const [relais] = await db
    .select()
    .from(mailCredentials)
    .where(
      provider
        ? and(eq(mailCredentials.tenantId, tenantId), eq(mailCredentials.provider, provider))
        : and(eq(mailCredentials.tenantId, tenantId), eq(mailCredentials.isDefault, true)),
    )
    .limit(1);
  return relais ?? null;
}

export async function listeRelais(tenantId: string) {
  const relais = await db
    .select({
      id: mailCredentials.id,
      provider: mailCredentials.provider,
      fromEmail: mailCredentials.fromEmail,
      fromName: mailCredentials.fromName,
      replyTo: mailCredentials.replyTo,
      transport: mailCredentials.transport,
      dailyLimit: mailCredentials.dailyLimit,
      isDefault: mailCredentials.isDefault,
      updatedAt: mailCredentials.updatedAt,
    })
    .from(mailCredentials)
    .where(eq(mailCredentials.tenantId, tenantId));
  // `sealedSecret` n'est pas sélectionné : une clé Brevo affichée une fois de trop
  // dans une réponse JSON finit dans un journal de proxy.
  return relais;
}

export async function enregistreRelais(input: {
  tenantId: string;
  workspaceId: string | null;
  actorUserId: string;
  provider: MailProvider;
  fromEmail: string;
  fromName?: string | null;
  replyTo?: string | null;
  /** Vide sur une mise à jour : le secret déjà scellé est conservé. */
  secret?: string;
  transport?: Record<string, unknown> | null;
  dailyLimit?: number;
  isDefault?: boolean;
}) {
  return db.transaction(async (tx) => {
    const [existant] = await tx
      .select({ id: mailCredentials.id })
      .from(mailCredentials)
      .where(
        and(eq(mailCredentials.tenantId, input.tenantId), eq(mailCredentials.provider, input.provider)),
      )
      .limit(1);
    if (!existant && !input.secret?.trim())
      throw new Error("Un nouveau relais exige son secret (mot de passe d'application ou clé d'API).");

    // Le sceau dépend de l'identifiant de la ligne : sur une création, il faut
    // d'abord obtenir cet identifiant, d'où le scellement en deux temps.
    const id =
      existant?.id ??
      (
        await tx
          .insert(mailCredentials)
          .values({
            tenantId: input.tenantId,
            provider: input.provider,
            fromEmail: input.fromEmail,
            sealedSecret: "",
          })
          .returning({ id: mailCredentials.id })
      )[0].id;

    if (input.isDefault) {
      // L'index partiel n'accepte qu'un défaut par tenant : on retire l'ancien
      // dans la même transaction, sinon la mise à jour est rejetée.
      await tx
        .update(mailCredentials)
        .set({ isDefault: false })
        .where(and(eq(mailCredentials.tenantId, input.tenantId), ne(mailCredentials.id, id)));
    }

    const [relais] = await tx
      .update(mailCredentials)
      .set({
        fromEmail: input.fromEmail,
        fromName: input.fromName ?? null,
        replyTo: input.replyTo ?? null,
        ...(input.secret?.trim()
          ? { sealedSecret: sealSecret(input.secret.trim(), contexteSecret(id)) }
          : {}),
        transport: input.transport ?? null,
        ...(input.dailyLimit === undefined ? {} : { dailyLimit: input.dailyLimit }),
        ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
        updatedAt: new Date(),
      })
      .where(eq(mailCredentials.id, id))
      .returning({ id: mailCredentials.id, provider: mailCredentials.provider });

    await tx.insert(auditEvents).values({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: existant ? "mail.relay_updated" : "mail.relay_configured",
      targetType: "mail_credential",
      targetId: id,
      // Ni le secret ni sa longueur : une longueur est déjà un renseignement.
      metadata: { provider: input.provider, fromEmail: input.fromEmail, secretRenouvele: Boolean(input.secret?.trim()) },
    });
    return relais;
  });
}

export async function enregistreOpposition(input: {
  tenantId: string;
  workspaceId: string | null;
  actorUserId?: string | null;
  address: string;
  reason: "unsubscribe" | "bounce" | "manual";
}) {
  const address = normaliseAdresse(input.address);
  await db
    .insert(mailSuppressions)
    .values({ tenantId: input.tenantId, address, reason: input.reason })
    .onConflictDoNothing();
  await db.insert(auditEvents).values({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId ?? null,
    action: "mail.suppressed",
    targetType: "mail_suppression",
    targetId: address,
    metadata: { reason: input.reason },
  });
  return { address };
}

export async function envoieMessage(input: {
  tenantId: string;
  workspaceId: string | null;
  agentId?: string | null;
  actorUserId?: string | null;
  demande: DemandeApi;
}): Promise<ResultatEnvoi> {
  const relais = await relaisDuTenant(input.tenantId, input.demande.provider);
  if (!relais)
    return {
      ok: false,
      status: 409,
      raison: "relais_absent",
      message: input.demande.provider
        ? `Le relais ${input.demande.provider} n'est pas configuré pour ce tenant.`
        : "Aucun relais d'envoi par défaut n'est configuré (Réglages → E-mail).",
    };

  const destinataire = normaliseAdresse(input.demande.destinataire);
  const prospection = input.demande.nature === "prospection";
  const [[oppose], [dejaEcrit], [envoyes]] = await Promise.all([
    db
      .select({ id: mailSuppressions.id })
      .from(mailSuppressions)
      .where(and(eq(mailSuppressions.tenantId, input.tenantId), eq(mailSuppressions.address, destinataire)))
      .limit(1),
    // Inutile de chercher un précédent hors prospection : la politique n'en
    // tirerait aucune conséquence, et une relance en interroge un par envoi.
    prospection
      ? db
          .select({ id: mailSends.id })
          .from(mailSends)
          .where(
            and(
              eq(mailSends.tenantId, input.tenantId),
              eq(mailSends.recipient, destinataire),
              eq(mailSends.nature, "prospection"),
              ne(mailSends.status, "failed"),
            ),
          )
          .limit(1)
      : [],
    db
      .select({ total: count() })
      .from(mailSends)
      .where(
        and(
          eq(mailSends.tenantId, input.tenantId),
          ne(mailSends.status, "failed"),
          gte(mailSends.createdAt, debutDuJour()),
        ),
      ),
  ]);

  const refus = autoriseEnvoi(input.demande, {
    sEstOppose: Boolean(oppose),
    dejaContacte: Boolean(dejaEcrit),
    envoyesAujourdhui: envoyes?.total ?? 0,
    limiteJournaliere: relais.dailyLimit,
  });
  if (refus) return { ok: false, status: statutHttp(refus), raison: refus.raison, message: refus.message };

  // Réservation de l'adresse avant l'appel au relais : c'est l'index unique
  // partiel qui arbitre entre deux exécutions concurrentes, pas la lecture
  // ci-dessus, qui est déjà périmée au moment où on écrit.
  let reservation;
  try {
    [reservation] = await db
      .insert(mailSends)
      .values({
        tenantId: input.tenantId,
        agentId: input.agentId ?? null,
        provider: relais.provider,
        recipient: destinataire,
        subject: input.demande.sujet,
        nature: input.demande.nature,
        sourceUrl: input.demande.source,
        status: "pending",
      })
      .returning({ id: mailSends.id });
  } catch (error) {
    if (estViolationUnicite(error))
      return {
        ok: false,
        status: 409,
        raison: "doublon",
        message: `${destinataire} a déjà reçu un message. Une relance se décide, elle ne s'automatise pas.`,
      };
    throw error;
  }

  try {
    const { providerMessageId } = await envoie(
      {
        provider: relais.provider,
        expediteur: { email: relais.fromEmail, nom: relais.fromName, repondreA: relais.replyTo },
        secret: openSecret(relais.sealedSecret, contexteSecret(relais.id)),
        transport: relais.transport,
      },
      { ...input.demande, destinataire },
    );
    await db
      .update(mailSends)
      .set({ status: "sent", providerMessageId })
      .where(eq(mailSends.id, reservation.id));
    await db.insert(auditEvents).values({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId ?? null,
      action: "mail.sent",
      targetType: "mail_send",
      targetId: reservation.id,
      // Le corps du message n'est pas audité : la piste doit prouver qu'on a
      // écrit, pas conserver un contenu personnel de plus que nécessaire.
      metadata: {
        provider: relais.provider,
        recipient: destinataire,
        // Le régime déclaré fait partie de la preuve : c'est lui qui explique
        // pourquoi le message est parti sans mention d'origine.
        nature: input.demande.nature,
        source: input.demande.source,
        agentId: input.agentId ?? null,
      },
    });
    return { ok: true, id: reservation.id, provider: relais.provider, providerMessageId };
  } catch (error) {
    const message = error instanceof RelaisError ? error.message : (error as Error).message;
    // L'échec libère l'adresse (l'index unique ignore `failed`) : un relais en
    // panne ne doit pas interdire définitivement d'écrire à ce prospect.
    await db.update(mailSends).set({ status: "failed", error: message }).where(eq(mailSends.id, reservation.id));
    await db.insert(auditEvents).values({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId ?? null,
      action: "mail.failed",
      targetType: "mail_send",
      targetId: reservation.id,
      metadata: { provider: relais.provider, recipient: destinataire, error: message },
    });
    return { ok: false, status: 502, raison: "relais_en_echec", message };
  }
}
