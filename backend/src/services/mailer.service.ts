import nodemailer, { type Transporter } from 'nodemailer';
import type { Sender } from '@prisma/client';

const transports = new Map<string, Transporter>();

function transportFor(sender: Sender): Transporter {
  let transport = transports.get(sender.id);
  if (!transport) {
    transport = nodemailer.createTransport({
      host: sender.smtpHost,
      port: sender.smtpPort,
      secure: sender.smtpPort === 465,
      auth: { user: sender.smtpUser, pass: sender.smtpPass },
      pool: true,
      maxConnections: 2,
    });
    transports.set(sender.id, transport);
  }
  return transport;
}

export const htmlToText = (html: string) =>
  html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

export interface OutgoingEmail {
  id: string;
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(sender: Sender, email: OutgoingEmail) {
  const info = await transportFor(sender).sendMail({
    from: { name: sender.name, address: sender.email },
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: htmlToText(email.html),
    // Deterministic Message-ID: the same email always carries the same id.
    messageId: `<${email.id}@reachinbox.scheduler>`,
  });
  return {
    messageId: info.messageId,
    previewUrl: nodemailer.getTestMessageUrl(info) || null,
  };
}

export function closeTransports() {
  for (const t of transports.values()) t.close();
  transports.clear();
}
