import type { Metadata } from "next";
import SectionHeader from "@/components/SectionHeader";
import { InvitationRow, InviteForm, MemberRow } from "@/components/AdminPanel";
import { requireAdmin } from "@/lib/auth/session";
import { describeChange } from "@/lib/changes";
import { listChanges, listMembers, listPendingInvitations } from "@/lib/data/users";

export const metadata: Metadata = { title: "Usuarios e historial · Archivo Zamora Balcázar" };
export const dynamic = "force-dynamic";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const card = "overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm";

export default async function AdminPage() {
  const session = await requireAdmin();
  const [members, invitations, changes] = await Promise.all([
    listMembers(session.treeId),
    listPendingInvitations(session.treeId),
    listChanges(session.treeId, 100),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <SectionHeader current="admin" />

      <main className="mx-auto flex max-w-3xl flex-col gap-9 px-4 py-8">
        <Section
          title="Invitar a alguien"
          hint="Nadie puede registrarse por su cuenta: solo entra quien recibe un enlace tuyo."
        >
          <div className={`${card} p-4`}>
            <InviteForm />
          </div>
        </Section>

        <Section title={`Personas con acceso (${members.length})`}>
          <ul className={`${card} divide-y divide-gray-100`}>
            {members.map((m) => (
              <MemberRow key={m.id} member={m} isSelf={m.id === session.user.id} />
            ))}
          </ul>
        </Section>

        {invitations.length > 0 && (
          <Section title="Enlaces pendientes" hint="Creados y todavía sin usar.">
            <ul className={`${card} divide-y divide-gray-100`}>
              {invitations.map((i) => (
                <InvitationRow key={i.id} invitation={i} />
              ))}
            </ul>
          </Section>
        )}

        <Section
          title="Historial de cambios"
          hint="Los últimos 100 cambios hechos en la app, con lo que había antes y lo que quedó."
        >
          {changes.length === 0 ? (
            <p className={`${card} px-4 py-5 text-sm text-gray-500`}>Todavía nadie ha editado nada.</p>
          ) : (
            <ul className={`${card} divide-y divide-gray-100`}>
              {changes.map((c) => {
                const { summary, details } = describeChange(c);
                return (
                  <li key={c.id} className="px-4 py-3">
                    <p className="text-sm text-gray-800">
                      <span className="font-medium text-gray-900">{c.userName}</span> {summary}{" "}
                      <span className="font-medium text-gray-900">{c.personName ?? "una persona borrada"}</span>
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-gray-400">{c.when.replace(/^(\d+)-(\d+)-(\d+)/, "$3/$2/$1")}</p>
                    {details.length > 0 && (
                      <ul className="mt-1.5 flex flex-col gap-0.5">
                        {details.map((d, i) => (
                          <li key={i} className="break-words text-xs leading-relaxed text-gray-600">
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
