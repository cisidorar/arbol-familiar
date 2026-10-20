import type { Metadata } from "next";
import AuthShell from "@/components/AuthShell";
import { LinkButton, Notice } from "@/components/ui";
import { AcceptInviteForm } from "@/components/AuthForms";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { ROLE_HELP, ROLE_LABELS } from "@/lib/auth/roles";
import { getInvitation } from "@/lib/data/users";

export const metadata: Metadata = {
  title: "Invitación · Archivo Zamora Balcázar",
  // El enlace lleva un token: que no quede en el "referer" de ningún otro sitio.
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getInvitation(token);

  if (!invitation) {
    return (
      <AuthShell title="Este enlace ya no sirve" heading="Archivo Zamora Balcázar" lead="Pídele a quien administra el archivo que te mande un enlace nuevo.">
        <Notice kind="aviso">
          Este enlace venció o ya se usó. Pídele a quien administra el archivo que te mande uno nuevo.
        </Notice>
        <div className="mt-6">
          <LinkButton href="/login">Ir a la pantalla de entrada</LinkButton>
        </div>
      </AuthShell>
    );
  }

  const isReset = invitation.kind === "reset";
  return (
    <AuthShell
      heading={isReset ? "Elige una contraseña nueva." : "Te damos la bienvenida a la familia."}
      lead={isReset ? "Con ella volverás a entrar al archivo." : "Crea tu cuenta para recorrer el árbol y ayudar a completarlo."}
      title={isReset ? "Elige tu contraseña nueva" : "Te invitaron al archivo familiar"}
      intro={
        isReset
          ? `Hola${invitation.userName ? `, ${invitation.userName}` : ""}. Al guardarla se cerrarán las sesiones que tengas abiertas en otros aparatos.`
          : `Entrarás como ${ROLE_LABELS[invitation.role].toLowerCase()}: ${ROLE_HELP[invitation.role].toLowerCase()}`
      }
    >
      <AcceptInviteForm token={token} kind={invitation.kind} email={invitation.email} minLength={MIN_PASSWORD_LENGTH} />
    </AuthShell>
  );
}
