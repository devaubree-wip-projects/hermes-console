import nodemailer, { type Transporter } from "nodemailer";

export type MailInput = { to: string; subject: string; text: string };

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    const user = process.env.SMTP_USER;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "localhost",
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: process.env.SMTP_SECURE === "true",
      auth: user ? { user, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
    });
  }
  return transporter;
}

export async function sendMail(input: MailInput): Promise<void> {
  await getTransporter().sendMail({
    from: process.env.MAIL_FROM ?? "Hermes Console <no-reply@hermes-console.local>",
    ...input,
  });
}
