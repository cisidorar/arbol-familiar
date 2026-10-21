"use server";

// Entrar, salir y usar un enlace de invitación. Son acciones de servidor: las
// llaman los formularios de /login y /invitacion/[token].

import { redirect } from "next/navigation";
import { passwordProblem } from "@/lib/auth/password";
import { normalizeEmail } from "@/lib/auth/roles";
import { createSession, destroySession } from "@/lib/auth/session";
import { acceptInvitation, attemptLogin, getInvitation } from "@/lib/data/users";

// Tras un error el formulario se vacía: se devuelve lo escrito (nunca la
// contraseña) para volver a ponerlo y no obligar a tipearlo de nuevo.
export type FormState = { error: string; email?: string; name?: string } | undefined;

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const typed = String(formData.get("email") ?? "").trim().slice(0, 254);
  const email = normalizeEmail(typed);
  const password = String(formData.get("password") ?? "");
  // El mismo mensaje para correo desconocido y contraseña mala: no se revela cuál falló.
  const wrong = { error: "El correo o la contraseña no coinciden. Revísalos e intenta de nuevo.", email: typed };
  if (!email || !password) return wrong;

  const result = await attemptLogin(email, password);
  if (!result.ok) {
    return result.reason === "locked"
      ? { error: "Se intentó entrar muchas veces sin éxito. Espera 15 minutos y vuelve a probar.", email: typed }
      : wrong;
  }
  // Casilla "Mantener la sesión abierta": sin ella la sesión dura un día y se cierra con el navegador.
  await createSession(result.userId, formData.get("remember") === "on");
  redirect("/inicio");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function acceptInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const invitation = await getInvitation(token);
  if (!invitation) return { error: "Este enlace ya no sirve: venció o ya se usó. Pídele a quien administra el archivo que te mande uno nuevo." };

  const name = invitation.kind === "reset" ? invitation.userName ?? "" : String(formData.get("name") ?? "").trim();
  if (invitation.kind === "invite" && (name.length < 2 || name.length > 80)) {
    return { error: "Escribe tu nombre, por favor." };
  }
  const problem = passwordProblem(password);
  if (problem) return { error: problem, name };
  if (password !== confirm) return { error: "Las dos contraseñas no son iguales. Escríbelas de nuevo.", name };

  const result = await acceptInvitation(token, name, password);
  if (!result.ok) return { error: result.error, name };
  await createSession(result.userId);
  redirect("/inicio");
}
