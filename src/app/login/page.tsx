import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import { LoginForm } from "@/components/AuthForms";
import { getSession } from "@/lib/auth/session";
import { getSetupState } from "@/lib/data/users";

export const metadata: Metadata = { title: "Entrar · Archivo Zamora Balcázar" };
export const dynamic = "force-dynamic";

function Command({ children }: { children: string }) {
  return (
    <code className="mt-1.5 block overflow-x-auto whitespace-nowrap bg-[#1f1d1a] px-3 py-2 text-xs text-[#f5f2ea]">
      {children}
    </code>
  );
}

export default async function LoginPage() {
  // Recién instalado el login todavía no hay tablas de usuarios o no hay
  // nadie que pueda entrar: se explica qué correr, en vez de un formulario
  // que no puede funcionar. (El primer administrador solo se crea desde la
  // terminal, nunca desde la web.)
  const setup = await getSetupState();
  if (setup !== "ready") {
    return (
      <AuthShell title="Falta un paso para poder entrar" intro="Se hace una sola vez, en la terminal, dentro de la carpeta del proyecto.">
        <ol className="flex flex-col gap-4 text-sm">
          {setup === "needs-migration" && (
            <li>
              1. Crea las tablas de usuarios:
              <Command>npm run db:migrate</Command>
            </li>
          )}
          <li>
            {setup === "needs-migration" ? "2." : "1."} Crea tu cuenta de administradora (te pide la contraseña):
            <Command>{'npm run usuario -- crear-admin tu@correo.cl "Tu Nombre"'}</Command>
          </li>
          <li>{setup === "needs-migration" ? "3." : "2."} Recarga esta página y entra.</li>
        </ol>
      </AuthShell>
    );
  }

  if (await getSession()) redirect("/");
  return (
    <AuthShell title="Entrar" intro="El archivo es privado: solo entra quien fue invitado.">
      <LoginForm />
      <hr className="mt-8 border-0 border-t border-[#c9c3b4]" />
      <p className="mt-4 text-[13px] italic leading-relaxed text-[#7a756a]">
        ¿Olvidaste tu contraseña o no tienes cuenta? Pídele a quien administra el archivo un enlace nuevo.
      </p>
    </AuthShell>
  );
}
