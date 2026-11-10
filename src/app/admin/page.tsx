import type { Metadata } from "next";
import SectionHeader from "@/components/SectionHeader";
import { PageTitle } from "@/components/ui";
import { InvitationsList, InviteForm, MembersList } from "@/components/AdminPanel";
import { requireAdmin } from "@/lib/auth/session";
import { describeChange } from "@/lib/changes";
import { listChanges, listInvitations, listMembers } from "@/lib/data/users";
import { mailConfigured } from "@/lib/mail";
import { countFailedLastDay, listSecurityLog, type SecurityEvent } from "@/lib/data/security-log";

export const metadata: Metadata = { title: "Usuarios e historial · Archivo Zamora Balcázar" };
export const dynamic = "force-dynamic";

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-24">
      <h2 id={`${id}-titulo`} className="zb-seccion">{title}</h2>
      {hint && <p className="zb-apoyo mt-1">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Bloque plegable para los registros largos: el título dice cuánto hay adentro. */
function Fold({ title, hint, count, open, children }: { title: string; hint: string; count: number; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group rounded-2xl border-2 border-line bg-white">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block text-gris transition-transform group-open:rotate-90">▸</span>
        <span className="flex-1">
          <span className="zb-nombre block">{title} ({count})</span>
          <span className="zb-apoyo block">{hint}</span>
        </span>
        <span className="zb-apoyo font-bold !text-ink group-open:hidden">Ver</span>
        <span className="zb-apoyo hidden font-bold !text-ink group-open:inline">Ocultar</span>
      </summary>
      <div className="border-t-2 border-line">{children}</div>
    </details>
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
  invitacion_cancelada: "Anuló una invitación",
  invitacion_reenviada: "Reenvió una invitación",
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
    listInvitations(session.treeId),
    listChanges(session.treeId, 100),
    listSecurityLog(100),
    countFailedLastDay(),
  ]);
  const alerts = security.filter((e) => ALERT.has(e.event)).length;
  const waiting = invitations.filter((i) => ["creada", "enviada", "abierta", "no_enviada"].includes(i.status)).length;
  const unsent = invitations.filter((i) => i.status === "no_enviada").length;
  const todo: string[] = [];
  if (unsent) todo.push(`${unsent === 1 ? "1 invitación no se pudo enviar" : `${unsent} invitaciones no se pudieron enviar`}`);
  if (failedDay >= 5) todo.push(`${failedDay} intentos de entrada fallidos en las últimas 24 horas`);
  const nav = [
    { href: "#invitar", label: "Invitar" },
    { href: "#personas", label: `Personas (${members.length})` },
    { href: "#invitaciones", label: waiting ? `Invitaciones (${waiting} esperando)` : "Invitaciones" },
    { href: "#seguridad", label: "Seguridad" },
    { href: "#historial", label: "Cambios" },
  ];

  return (
    <div className="zb album min-h-screen text-ink [color-scheme:light]">
      <SectionHeader current="admin" />

      <main className="mx-auto flex max-w-3xl flex-col gap-12 px-4 py-8 sm:px-6 lg:py-10">
        <PageTitle intro="Quién puede entrar al archivo, qué puede hacer y qué se ha cambiado.">Usuarios e historial</PageTitle>

        <nav aria-label="Secciones de esta pantalla" className="-mt-6 flex flex-wrap gap-2">
          {nav.map((n) => (
            <a key={n.href} href={n.href} className="inline-flex min-h-11 items-center rounded-full border-2 border-line bg-white px-4 text-base font-bold text-ink hover:border-ink">
              {n.label}
            </a>
          ))}
        </nav>

        {todo.length > 0 && (
          <div role="status" className="rounded-2xl border-2 border-burdeos bg-white px-5 py-4">
            <p className="zb-nombre !text-burdeos">Para revisar</p>
            <ul className="zb-texto mt-1 list-disc pl-6">
              {todo.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        <Section
          id="invitar"
          title="Invitar a alguien"
          hint={
            mailConfigured()
              ? "Le llega un correo con el enlace para crear su cuenta. Nadie puede registrarse por su cuenta."
              : "El envío de correos no está configurado: copia el enlace y mándaselo tú. Nadie puede registrarse por su cuenta."
          }
        >
          <div className={`${card} p-4`}>
            <InviteForm />
          </div>
        </Section>

        <Section id="personas" title={`Personas con acceso (${members.length})`}>
          <MembersList members={members} selfId={session.user.id} />
        </Section>

        <Section id="invitaciones" title="Invitaciones" hint="Su estado, para saber si les llegó. Reenviar manda un enlace nuevo y el anterior deja de servir.">
          <InvitationsList invitations={invitations} />
        </Section>

        <Section
          id="seguridad"
          title="Registro de seguridad"
          hint="Las últimas 100 entradas, intentos fallidos y acciones de administración."
        >
          {security.length === 0 ? (
            <p className={`${card} zb-texto px-5 py-6 text-gris`}>Todavía no hay nada registrado.</p>
          ) : (
            <Fold
              title="Entradas y cambios de permisos"
              hint={alerts ? `${alerts} para mirar con atención` : "Nada raro"}
              count={security.length}
              open={failedDay >= 5}
            >
              <ul className="divide-y-2 divide-line">
                {security.map((e) => (
                  <li key={e.id} className="px-4 py-3 sm:px-5">
                    <p className={`zb-texto ${ALERT.has(e.event) ? "font-bold !text-burdeos" : ""}`}>
                      {ALERT.has(e.event) && <span className="mr-2 rounded-full bg-burdeos px-2.5 py-0.5 text-sm font-bold text-white">Atención</span>}
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
            </Fold>
          )}
        </Section>

        <Section
          id="historial"
          title="Historial de cambios"
          hint="Los últimos 100 cambios hechos en la app, con lo que había antes y lo que quedó."
        >
          {changes.length === 0 ? (
            <p className={`${card} zb-texto px-5 py-6 text-gris`}>Todavía nadie ha editado nada.</p>
          ) : (
            <Fold title="Cambios hechos en la app" hint="Con lo que había antes y lo que quedó" count={changes.length}>
            <ul className="divide-y-2 divide-line">
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
            </Fold>
          )}
        </Section>
      </main>
    </div>
  );
}
