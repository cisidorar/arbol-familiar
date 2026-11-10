import type { Metadata } from "next";
import SectionHeader from "@/components/SectionHeader";
import { PageTitle } from "@/components/ui";
import { InvitationRow, InviteForm, MemberRow } from "@/components/AdminPanel";
import { requireAdmin } from "@/lib/auth/session";
import { describeChange } from "@/lib/changes";
import { listChanges, listMembers, listPendingInvitations } from "@/lib/data/users";
import { countFailedLastDay, listSecurityLog, type SecurityEvent } from "@/lib/data/security-log";

export const metadata: Metadata = { title: "Usuarios e historial · Archivo Zamora Balcázar" };
export const dynamic = "force-dynamic";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="zb-seccion">{title}</h2>
      {hint && <p className="zb-apoyo mt-1">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const card = "overflow-hidden rounded-2xl border-2 border-line bg-white";

const EVENT_LABELS: Record<SecurityEvent, string> = {
  entrada: "Entró",
  entrada_fallida: "Intento de entrada fallido",
  entrada_bloqueada: "Intento con la cuenta bloqueada",
  conexion_limitada: "Conexión frenada por demasiados intentos",
  salida: "Salió",
  invitacion_creada: "Creó una invitación",
  invitacion_aceptada: "Aceptó su invitación",
  invitacion_cancelada: "Canceló una invitación",
  enlace_contrasena_creado: "Creó un enlace de contraseña",
  contrasena_cambiada: "Cambió su contraseña",
  rol_cambiado: "Cambió un rol",
  acceso_quitado: "Quitó un acceso",
  vinculo_cambiado: "Cambió un vínculo con el árbol",
};
// Lo que conviene mirar: intentos fallidos y cambios de permisos.
const ALERT = new Set<SecurityEvent>(["entrada_fallida", "entrada_bloqueada", "conexion_limitada", "rol_cambiado", "acceso_quitado"]);

export default async function AdminPage() {
  const session = await requireAdmin();
  const [members, invitations, changes, security, failedDay] = await Promise.all([
    listMembers(session.treeId),
    listPendingInvitations(session.treeId),
    listChanges(session.treeId, 100),
    listSecurityLog(100),
    countFailedLastDay(),
  ]);


  return (
    <div className="zb album min-h-screen text-ink [color-scheme:light]">
      <SectionHeader current="admin" />

      <main className="mx-auto flex max-w-3xl flex-col gap-12 px-4 py-8 sm:px-6 lg:py-10">
        <PageTitle intro="Quién puede entrar al archivo, qué puede hacer y qué se ha cambiado.">Usuarios e historial</PageTitle>

        <Section
          title="Invitar a alguien"
          hint="Nadie puede registrarse por su cuenta: solo entra quien recibe un enlace tuyo."
        >
          <div className={`${card} p-4`}>
            <InviteForm />
          </div>
        </Section>

        <Section title={`Personas con acceso (${members.length})`}>
          <ul className={`${card} divide-y-2 divide-line`}>
            {members.map((m) => (
              <MemberRow key={m.id} member={m} isSelf={m.id === session.user.id} />
            ))}
          </ul>
        </Section>

        {invitations.length > 0 && (
          <Section title="Enlaces pendientes" hint="Creados y todavía sin usar.">
            <ul className={`${card} divide-y-2 divide-line`}>
              {invitations.map((i) => (
                <InvitationRow key={i.id} invitation={i} />
              ))}
            </ul>
          </Section>
        )}

        <Section
          title="Registro de seguridad"
          hint="Las últimas 100 entradas, intentos fallidos y acciones de administración."
        >
          {failedDay >= 5 && (
            <p className="zb-texto mb-4 rounded-2xl border-2 border-burdeos bg-white px-5 py-4 font-bold !text-burdeos">
              Hubo {failedDay} intentos de entrada fallidos en las últimas 24 horas. Si no fuiste tú ni alguien de la familia, revisa de qué correos son.
            </p>
          )}
          {security.length === 0 ? (
            <p className={`${card} zb-texto px-5 py-6 text-gris`}>Todavía no hay nada registrado.</p>
          ) : (
            <ul className={`${card} divide-y-2 divide-line`}>
              {security.map((e) => (
                <li key={e.id} className="px-4 py-3 sm:px-5">
                  <p className={`zb-texto ${ALERT.has(e.event) ? "font-bold !text-burdeos" : ""}`}>
                    {EVENT_LABELS[e.event] ?? e.event}
                    {(e.userName || e.email) && <span className="font-normal !text-ink"> · {e.userName ?? e.email}</span>}
                  </p>
                  <p className="zb-apoyo mt-0.5 tabular-nums">
                    {e.when.replace(/^(\d+)-(\d+)-(\d+)/, "$3/$2/$1")}
                    {e.ip ? ` · ${e.ip}` : ""}
                    {e.detail && typeof e.detail.role === "string" ? ` · rol ${e.detail.role}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Historial de cambios"
          hint="Los últimos 100 cambios hechos en la app, con lo que había antes y lo que quedó."
        >
          {changes.length === 0 ? (
            <p className={`${card} zb-texto px-5 py-6 text-gris`}>Todavía nadie ha editado nada.</p>
          ) : (
            <ul className={`${card} divide-y-2 divide-line`}>
              {changes.map((c) => {
                const { summary, details } = describeChange(c);
                return (
                  <li key={c.id} className="px-4 py-4 sm:px-5">
                    <p className="zb-texto">
                      <span className="font-bold">{c.userName}</span> {summary}{" "}
                      <span className="font-bold">{c.personName ?? "una persona borrada"}</span>
                    </p>
                    <p className="zb-apoyo mt-0.5 tabular-nums">{c.when.replace(/^(\d+)-(\d+)-(\d+)/, "$3/$2/$1")}</p>
                    {details.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {details.map((d, i) => (
                          <li key={i} className="zb-apoyo break-words">
                            {d}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </main>
    </div>
  );
}
