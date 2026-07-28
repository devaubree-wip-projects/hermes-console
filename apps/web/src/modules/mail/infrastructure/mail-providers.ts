import "server-only";

import nodemailer from "nodemailer";
import {
  avecMentions,
  enTeteExpediteur,
  type Expediteur,
  type MailProvider,
  type NatureDestinataire,
} from "../domain/mail-policy";

// Les trois relais que la Console sait piloter pour le compte d'un tenant.
// Aucun n'est joignable sans le secret descellé par l'appelant : ce module ne
// touche ni à la base ni au coffre, ce qui le rend remplaçable sans risque.
//
// `sendMail` de `lib/mailer` n'est pas réutilisé ici : il sert le transactionnel
// de la Console (invitations, réinitialisations) et lit les réglages SMTP de
// l'instance. Les envois d'un tenant partent d'un autre domaine, avec une autre
// réputation, sous une autre responsabilité — les confondre ferait qu'une
// campagne bloquée emporterait les e-mails de connexion.

export type Relais = {
  provider: MailProvider;
  expediteur: Expediteur;
  /** Mot de passe d'application ou clé d'API, déjà descellé. */
  secret: string;
  /** Hôte, port, TLS et compte SMTP. Ignoré par Brevo et Resend. */
  transport?: Record<string, unknown> | null;
};

export type MessageAEnvoyer = {
  destinataire: string;
  sujet: string;
  texte: string;
  nature: NatureDestinataire;
  source: string | null;
};

/** Un relais qui refuse est une panne d'exploitation, pas un bug : on garde le statut. */
export class RelaisError extends Error {
  constructor(
    readonly provider: MailProvider,
    message: string,
  ) {
    super(message);
  }
}

function texteTransport(transport: Record<string, unknown> | null | undefined, cle: string) {
  const valeur = transport?.[cle];
  return typeof valeur === "string" && valeur.trim() ? valeur.trim() : undefined;
}

async function envoieBrevo(relais: Relais, message: MessageAEnvoyer): Promise<string> {
  const reponse = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": relais.secret,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: relais.expediteur.email,
        ...(relais.expediteur.nom ? { name: relais.expediteur.nom } : {}),
      },
      to: [{ email: message.destinataire }],
      subject: message.sujet,
      textContent: message.texte,
      ...(relais.expediteur.repondreA ? { replyTo: { email: relais.expediteur.repondreA } } : {}),
    }),
  });
  const corps = await reponse.text();
  if (!reponse.ok) throw new RelaisError("brevo", `Brevo ${reponse.status} — ${corps}`);
  return (JSON.parse(corps) as { messageId?: string }).messageId ?? "";
}

async function envoieResend(relais: Relais, message: MessageAEnvoyer): Promise<string> {
  const reponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${relais.secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: enTeteExpediteur(relais.expediteur),
      to: [message.destinataire],
      subject: message.sujet,
      text: message.texte,
      ...(relais.expediteur.repondreA ? { reply_to: relais.expediteur.repondreA } : {}),
    }),
  });
  const corps = await reponse.text();
  if (!reponse.ok) throw new RelaisError("resend", `Resend ${reponse.status} — ${corps}`);
  return (JSON.parse(corps) as { id?: string }).id ?? "";
}

async function envoieSmtp(relais: Relais, message: MessageAEnvoyer): Promise<string> {
  const hote = texteTransport(relais.transport, "host");
  if (!hote) throw new RelaisError("smtp", "Le relais SMTP n'a pas d'hôte configuré.");
  const compte = texteTransport(relais.transport, "user");
  const transporteur = nodemailer.createTransport({
    host: hote,
    port: Number(relais.transport?.port ?? 587),
    // Gmail écoute en STARTTLS sur 587 : `secure` reste faux, la connexion est
    // chiffrée après le EHLO. Mailpit, en développement, n'a ni TLS ni compte.
    secure: relais.transport?.secure === true,
    ...(compte ? { auth: { user: compte, pass: relais.secret } } : {}),
  });
  try {
    const info = await transporteur.sendMail({
      from: enTeteExpediteur(relais.expediteur),
      to: message.destinataire,
      subject: message.sujet,
      text: message.texte,
      ...(relais.expediteur.repondreA ? { replyTo: relais.expediteur.repondreA } : {}),
    });
    return info.messageId ?? "";
  } catch (error) {
    throw new RelaisError("smtp", (error as Error).message);
  } finally {
    transporteur.close();
  }
}

/**
 * Le seul chemin d'envoi. En prospection, les mentions légales y sont ajoutées
 * sans condition : aucun appelant, agent compris, ne peut expédier un message
 * qui en soit dépourvu. Le régime, lui, est déclaré en amont et consigné.
 */
export async function envoie(
  relais: Relais,
  message: MessageAEnvoyer,
): Promise<{ providerMessageId: string }> {
  const complet = { ...message, texte: avecMentions(message.texte, message.nature, message.source) };
  const providerMessageId =
    relais.provider === "brevo"
      ? await envoieBrevo(relais, complet)
      : relais.provider === "resend"
        ? await envoieResend(relais, complet)
        : await envoieSmtp(relais, complet);
  return { providerMessageId };
}
