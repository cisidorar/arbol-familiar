"use server";

// Entrar, salir y usar un enlace de invitación. Son acciones de servidor: las
// llaman los formularios de /login y /invitacion/[token].

import { redirect } from "next/navigation";
import { passwordProblem } from "@/lib/auth/password";
import { normalizeEmail } from "@/lib/auth/roles";
import { createSession, destroySession, getSession } from "@/lib/auth/session";
import { clientIp, ipIsLimited, logSecurity } from "@/lib/data/security-log";
import { acceptInvitation, attemptLogin, getInvitation } from "@/lib/data/users";

// Tras un error el formulario se vacía: se devuelve lo escrito (nunca la
// contraseña) para volver a ponerlo y no obligar a tipearlo de nuevo.
export type FormState = { error: string; email?: string; name?: string } | undefined;

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const typed = String(formData.get("email") ?? "").trim().slice(0, 254);
  const email = normalizeEmail(typed);
  const password = String(formData.get("password") ?? "");
  // Siempre el mismo mensaje (correo desconocido, contraseña mala o cuenta bloqueada): no se revela
  // qué correos existen. El aviso de esperar sirve para quien de verdad se bloqueó.
  const wrong = {
    error: "El correo o la contraseña no coinciden. Revísalos e intenta de nuevo. Si fallaste varias veces seguidas, espera 15 minutos.",
    email: typed,
  };
  if (!email || !password) return wrong;

  // Una misma conexión con demasiados intentos fallidos se frena antes de calcular nada.
  const ip = await clientIp();
  if (await ipIsLimited(ip)) {
    await logSecurity("conexion_limitada", { email, ip });
    return { error: "Hubo demasiados intentos desde esta conexión. Espera 15 minutos y vuelve a probar.", email: typed };
  }

  const result = await attemptLogin(email, password);
  if (!result.ok) {
    await logSecurity(result.reason === "locked" ? "entrada_bloqueada" : "entrada_fallida", { userId: result.userId, email, ip });
    return wrong;
  }
  await logSecurity("entrada", { userId: result.userId, email, ip });
  // Casilla "Mantener la sesión abierta": sin ella la sesión dura un día y se cierra con el navegador.
  await createSession(result.userId, formData.get("remember") === "on");
  redirect("/inicio");
}

export async function logout(): Promise<void> {
  const session = await getSession();
  if (session) await logSecurity("salida", { userId: session.user.id, email: session.user.email });
  await destroySession();
  redirect("/");
}

export async function acceptInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const invitation = await getInvitation(token);
  if (!invitation) return { error: "Este enlace ya no sirve: venció o ya se usó. Pídele a quien administra el archivo que te mande uno nuevo." };

  // Con la persona del árbol elegida por quien invita, el nombre sale de ella; si no (invitaciones antiguas), se pide.
  const name =
    invitation.kind === "reset" ? invitation.userName ?? "" : invitation.personName ?? String(formData.get("name") ?? "").trim();
  if (invitation.kind === "invite" && (name.length < 2 || name.length > 200)) {
    return { error: "Escribe tu nombre, por favor." };
  }
  const problem = passwordProblem(password);
  if (problem) return { error: problem, name };
  if (password !== confirm) return { error: "Las dos contraseñas no son iguales. Escríbelas de nuevo.", name };

  const result = await acceptInvitation(token, name, password);
  if (!result.ok) return { error: result.error, name };
  await logSecurity(result.kind === "reset" ? "contrasena_cambiada" : "invitacion_aceptada", { userId: result.userId, email: result.email });
  await createSession(result.userId);
  redirect("/inicio");
}
