import type { Metadata } from "next";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
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
      <AuthShell title="Este enlace ya no sirve">
        <p className="text-[15px] leading-relaxed">
          Venció o ya se usó. Pídele a quien administra el archivo que te mande uno nuevo.
        </p>
        <Link href="/login" className="mt-4 inline-block text-[15px] font-bold underline underline-offset-4">
          Ir a la pantalla de entrada
        </Link>
      </AuthShell>
    );
  }

  const isReset = invitation.kind === "reset";
  return (
    <AuthShell
      title={isReset ? "Elige una contraseña nueva" : "Te invitaron al archivo familiar"}
      intro={
        isReset
          ? `Hola${invitation.userName ? `, ${invitation.userName}` : ""}. Al guardarla se cierran tus sesiones abiertas.`
          : `Entrarás como ${ROLE_LABELS[invitation.role].toLowerCase()}: ${ROLE_HELP[invitation.role].toLowerCase()}`
      }
    >
      <AcceptInviteForm token={token} kind={invitation.kind} email={invitation.email} minLength={MIN_PASSWORD_LENGTH} />
    </AuthShell>
  );
}
