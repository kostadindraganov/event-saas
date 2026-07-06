import "server-only";
import { Resend } from "resend";

let warned = false;

export async function sendEmail(input: { to: string; subject: string; html: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (!warned) {
      console.warn("RESEND_API_KEY липсва — email-ите са изключени");
      warned = true;
    }
    return;
  }
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function newMessageEmail(input: {
  recipientName: string; listingTitle: string; body: string; threadUrl: string;
}): { subject: string; html: string } {
  const subject = `Ново съобщение за „${input.listingTitle}“`;
  const html = `<div style="font-family:sans-serif;line-height:1.5;color:#111">
  <p>Здравейте, ${escapeHtml(input.recipientName)},</p>
  <p>Имате ново съобщение относно обявата <strong>${escapeHtml(input.listingTitle)}</strong>:</p>
  <blockquote style="border-left:3px solid #ddd;margin:0;padding:0 0 0 12px;color:#333">${escapeHtml(input.body)}</blockquote>
  <p><a href="${input.threadUrl}">Виж разговора</a></p>
</div>`;
  return { subject, html };
}
