// Envío de correos con Resend (https://resend.com), por su API HTTP: sin
// dependencias nuevas. Solo para el servidor.
//
// Variables de entorno:
//   RESEND_API_KEY  clave de la API de Resend (re_...)
//   MAIL_FROM       remitente con el dominio verificado en Resend,
//                   por ejemplo: Archivo Zamora Balcázar <archivo@tudominio.cl>
// Sin ellas no se envía nada y la app sigue mostrando el enlace para copiarlo.

export type MailResult = { ok: true } | { ok: false; error: string };

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail(msg: { to: string; subject: string; html: string; text: string }): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) return { ok: false, error: "El envío de correos no está configurado." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, error: (body?.message ?? `Resend respondió ${res.status}`).slice(0, 300) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 300) : "No se pudo conectar con Resend." };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, paragraphs: string[], button: { label: string; href: string }, footer: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4efe6;font-family:Georgia,'Times New Roman',serif;color:#1e1a17">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:2px solid #1e1a17;border-radius:16px;padding:28px">
<tr><td>
<p style="margin:0 0 4px;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#7a2e2a">Archivo Zamora Balcázar</p>
<h1 style="margin:0 0 16px;font-size:26px;line-height:1.2">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:18px;line-height:1.5">${p}</p>`).join("\n")}
<p style="margin:24px 0"><a href="${esc(button.href)}" style="display:inline-block;background:#b5532f;color:#ffffff;text-decoration:none;font-weight:bold;font-size:19px;padding:14px 26px;border-radius:999px">${esc(button.label)}</a></p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.5;color:#5b554d">Si el botón no funciona, copia este enlace en el navegador:<br><span style="word-break:break-all">${esc(button.href)}</span></p>
<p style="margin:16px 0 0;font-size:15px;line-height:1.5;color:#5b554d">${esc(footer)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function inviteEmail(o: { inviter: string; link: string; days: number; personName: string | null }) {
  const subject = `${o.inviter} te invitó al archivo de la familia`;
  const lines = [
    `${o.inviter} te invitó a entrar al Archivo Zamora Balcázar: el árbol de la familia, con nombres, fechas, lugares e historias de nuestros antepasados.`,
    ...(o.personName ? [`En el árbol ya estás como ${o.personName}: al entrar verás a tu familia desde ahí.`] : []),
    "Con el botón creas tu cuenta: solo tienes que escribir tu nombre y elegir una contraseña.",
  ];
  const footer = `El enlace sirve una sola vez y vence en ${o.days} días. Si no esperabas este correo, puedes ignorarlo.`;
  return {
    subject,
    html: layout("Te invitaron al archivo familiar", lines.map(esc), { label: "Crear mi cuenta", href: o.link }, footer),
    text: `${lines.join("\n\n")}\n\nCrea tu cuenta aquí: ${o.link}\n\n${footer}`,
  };
}

export function resetEmail(o: { name: string; link: string; hours: number }) {
  const lines = [
    `Hola, ${o.name}. Quien administra el Archivo Zamora Balcázar te mandó este enlace para que elijas una contraseña nueva.`,
  ];
  const footer = `El enlace sirve una sola vez y vence en ${o.hours} horas. Si no lo pediste, avísale a quien administra el archivo.`;
  return {
    subject: "Elige una contraseña nueva para el archivo familiar",
    html: layout("Contraseña nueva", lines.map(esc), { label: "Elegir contraseña", href: o.link }, footer),
    text: `${lines.join("\n\n")}\n\nElige tu contraseña aquí: ${o.link}\n\n${footer}`,
  };
}
