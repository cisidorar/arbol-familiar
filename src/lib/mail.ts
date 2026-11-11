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

// Colores y tipografías del sitio (ver globals.css). Los correos no cargan fuentes web: se usan las mismas
// familias con sus alternativas de sistema (Rockwell/Georgia para los títulos, Courier para el sello).
const C = { ink: "#1a1816", gris: "#4a4740", adobe: "#f4e9d3", adobe2: "#e9d8b6", teja: "#a8432a", burdeos: "#6e1f2e", trigo: "#d9a441", ficha: "#fffdf8" };
const SLAB = "'Zilla Slab','Rockwell','Roboto Slab',Georgia,'Times New Roman',serif";
const BODY = "'Atkinson Hyperlegible',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const TYPE = "'Special Elite','Courier New',Courier,monospace";

function layout(o: {
  title: string;
  /** Línea chica sobre el título, como la etiqueta de una ficha. */
  eyebrow: string;
  paragraphs: string[];
  /** Un dato destacado, como una ficha del archivo (por ejemplo, quién eres en el árbol). */
  ficha?: { label: string; value: string };
  /** Párrafos que van después de la ficha (si no hay ficha, se suman a los de arriba). */
  after?: string[];
  button: { label: string; href: string };
  footer: string;
}): string {
  const { title, eyebrow, ficha, button, footer } = o;
  const para = (p: string) => `<p style="margin:0 0 15px;font-size:18px;line-height:1.55;color:${C.ink}">${p}</p>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.adobe};font-family:${BODY};color:${C.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.adobe}" style="background:${C.adobe}"><tr><td align="center" style="padding:28px 12px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td align="center" style="padding:0 0 18px">
<p style="margin:0;font-family:${TYPE};font-size:15px;letter-spacing:.16em;text-transform:uppercase;color:${C.burdeos}">Archivo Zamora Balcázar</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px auto 0"><tr><td width="64" height="2" bgcolor="${C.burdeos}" style="font-size:0;line-height:0">&nbsp;</td><td width="14" align="center" style="font-size:0;line-height:0"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${C.trigo}"></span></td><td width="64" height="2" bgcolor="${C.burdeos}" style="font-size:0;line-height:0">&nbsp;</td></tr></table>
</td></tr>
<tr><td bgcolor="${C.ficha}" style="background:${C.ficha};border:2px solid ${C.ink};border-radius:18px;padding:0;overflow:hidden">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="${C.burdeos}" style="background:${C.burdeos};border-radius:16px 16px 0 0;padding:11px 28px;font-family:${TYPE};font-size:14px;letter-spacing:.14em;text-transform:uppercase;color:${C.adobe}">${esc(eyebrow)}</td></tr>
<tr><td style="padding:28px 28px 30px">
<h1 style="margin:0 0 18px;font-family:${SLAB};font-size:30px;line-height:1.15;font-weight:bold;color:${C.ink}">${esc(title)}</h1>
${o.paragraphs.map(para).join("\n")}
${
  ficha
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr><td bgcolor="${C.adobe}" style="background:${C.adobe};border-left:6px solid ${C.teja};border-radius:8px;padding:12px 16px"><p style="margin:0 0 2px;font-family:${TYPE};font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:${C.gris}">${esc(ficha.label)}</p><p style="margin:0;font-family:${SLAB};font-size:22px;line-height:1.25;font-weight:bold;color:${C.ink}">${esc(ficha.value)}</p></td></tr></table>`
    : ""
}
${(o.after ?? []).map(para).join("\n")}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px"><tr><td align="center" bgcolor="${C.teja}" style="background:${C.teja};border:4px solid ${C.burdeos};border-radius:999px"><a href="${esc(button.href)}" style="display:inline-block;padding:13px 30px;font-family:${BODY};font-size:20px;font-weight:bold;color:${C.adobe};text-decoration:none">${esc(button.label)} &rarr;</a></td></tr></table>
<p style="margin:18px 0 0;font-size:15px;line-height:1.5;color:${C.gris}">${esc(footer)}</p>
</td></tr>
<tr><td style="border-top:2px dashed ${C.adobe2};padding:16px 28px 18px"><p style="margin:0;font-size:14px;line-height:1.5;color:${C.gris}">Si el botón no funciona, copia este enlace en el navegador:<br><a href="${esc(button.href)}" style="color:${C.burdeos};word-break:break-all">${esc(button.href)}</a></p></td></tr></table>
</td></tr>
<tr><td align="center" style="padding:20px 0 0"><p style="margin:0;font-family:${TYPE};font-size:14px;color:${C.gris}">Archivo Zamora Balcázar &middot; Hecho en familia</p></td></tr>
</table></td></tr></table></body></html>`;
}

export function inviteEmail(o: { inviter: string; link: string; days: number; personName: string | null }) {
  const subject = `${o.inviter} te invitó al archivo de la familia`;
  const intro = `${o.inviter} te invitó a entrar al Archivo Zamora Balcázar: el árbol de la familia, con nombres, fechas, lugares e historias de nuestros antepasados.`;
  const how = o.personName
    ? "Con el botón creas tu cuenta: solo tienes que escribir tu nombre y elegir una contraseña. Al entrar verás a tu familia desde tu propia ficha."
    : "Con el botón creas tu cuenta: solo tienes que escribir tu nombre y elegir una contraseña.";
  const footer = `El enlace sirve una sola vez y vence en ${o.days} días. Si no esperabas este correo, puedes ignorarlo.`;
  return {
    subject,
    html: layout({
      title: "Te invitaron al archivo familiar",
      eyebrow: "Invitación",
      paragraphs: [esc(intro)],
      ficha: o.personName ? { label: "En el árbol eres", value: o.personName } : undefined,
      after: [esc(how)],
      button: { label: "Crear mi cuenta", href: o.link },
      footer,
    }),
    text: `${[intro, ...(o.personName ? [`En el árbol eres: ${o.personName}.`] : []), how].join("\n\n")}\n\nCrea tu cuenta aquí: ${o.link}\n\n${footer}`,
  };
}

export function resetEmail(o: { name: string; link: string; hours: number }) {
  const lines = [
    `Hola, ${o.name}. Quien administra el Archivo Zamora Balcázar te mandó este enlace para que elijas una contraseña nueva.`,
  ];
  const footer = `El enlace sirve una sola vez y vence en ${o.hours} horas. Si no lo pediste, avísale a quien administra el archivo.`;
  return {
    subject: "Elige una contraseña nueva para el archivo familiar",
    html: layout({
      title: "Contraseña nueva",
      eyebrow: "Acceso al archivo",
      paragraphs: lines.map(esc),
      button: { label: "Elegir contraseña", href: o.link },
      footer,
    }),
    text: `${lines.join("\n\n")}\n\nElige tu contraseña aquí: ${o.link}\n\n${footer}`,
  };
}
