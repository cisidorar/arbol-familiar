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
    <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded-lg bg-ink px-4 py-3 text-base text-white">
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
      <AuthShell title="Falta un paso para poder entrar" heading="Archivo Zamora Balcázar" lead="Recién instalado: falta crear la primera cuenta." intro="Se hace una sola vez, en la terminal, dentro de la carpeta del proyecto.">
        <ol className="zb-texto flex flex-col gap-5">
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

  if (await getSession()) redirect("/inicio");
  return (
    <AuthShell title="Entrar al archivo" intro="Usa el correo con el que te invitaron.">
      <LoginForm />
      <div className="mt-8 border-t border-line pt-6">
        <p className="text-[1.0625rem] font-bold">¿Aún no tienes acceso?</p>
        <p className="zb-apoyo mt-1.5">
          El archivo es solo para la familia. Pídeselo a quien te habló de él y te llegará una invitación por correo.
        </p>
      </div>
    </AuthShell>
  );
}
