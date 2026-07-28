import nodemailer, { type Transporter } from "nodemailer";
import { resolveAllSettings } from "@/lib/settings/resolve";

export type MailInput = { to: string; subject: string; text: string; html?: string };

const SMTP_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "MAIL_FROM",
] as const;

// Le transport est mémorisé par configuration, pas une fois pour toutes : les
// réglages SMTP sont surchargeables depuis la Console, et un transport construit au
// premier envoi continuerait d'utiliser l'ancien relais jusqu'au redémarrage — un
// changement qui semble pris en compte et ne l'est pas.
let cached: { signature: string; transporter: Transporter } | null = null;

async function smtpConfiguration() {
  const resolved = await resolveAllSettings(SMTP_KEYS);
  const values = Object.fromEntries(resolved.map((setting) => [setting.key, setting.value]));
  return {
    host: values.SMTP_HOST ?? "localhost",
    port: Number(values.SMTP_PORT ?? 1025),
    secure: values.SMTP_SECURE === "true",
    user: values.SMTP_USER ?? undefined,
    password: values.SMTP_PASSWORD ?? "",
    from: values.MAIL_FROM ?? "Hermes Console <no-reply@hermes-console.local>",
  };
}

async function getTransporter(configuration: Awaited<ReturnType<typeof smtpConfiguration>>) {
  const signature = JSON.stringify([
    configuration.host,
    configuration.port,
    configuration.secure,
    configuration.user,
    configuration.password,
  ]);
  if (cached?.signature !== signature) {
    cached = {
      signature,
      transporter: nodemailer.createTransport({
        host: configuration.host,
        port: configuration.port,
        secure: configuration.secure,
        auth: configuration.user
          ? { user: configuration.user, pass: configuration.password }
          : undefined,
      }),
    };
  }
  return cached.transporter;
}

export async function sendMail(input: MailInput): Promise<void> {
  const configuration = await smtpConfiguration();
  const transporter = await getTransporter(configuration);
  await transporter.sendMail({ from: configuration.from, ...input });
}
