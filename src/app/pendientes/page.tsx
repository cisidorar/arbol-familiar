import type { Metadata } from "next";
import Link from "next/link";
import SectionHeader from "@/components/SectionHeader";
import TaskList from "@/components/TaskList";
import { canEdit } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { listTasks } from "@/lib/data/tasks";
import { getPool } from "@/lib/db/pool";

export const metadata: Metadata = { title: "Pendientes de investigación · Archivo Zamora Balcázar" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PendientesPage({ searchParams }: { searchParams: Promise<{ persona?: string }> }) {
  const session = await requireSession();
  const { persona } = await searchParams;

  // ?persona=<id>: solo los pendientes de esa persona (viene del enlace de su ficha).
  let person: { id: string; name: string } | null = null;
  if (persona && UUID.test(persona)) {
    const { rows } = await getPool().query(
      `select p.id, n.display_name from persons p
       left join person_names n on n.person_id = p.id and n.is_primary
       where p.tree_id = $1 and p.id = $2`,
      [session.treeId, persona],
    );
    if (rows[0]) person = { id: rows[0].id as string, name: (rows[0].display_name as string) ?? "(sin nombre)" };
  }
  const tasks = await listTasks(session.treeId, person?.id);

  return (
    // Colores propios y esquema claro fijo: sin esto, con el Mac en modo oscuro
    // el texto heredado queda casi blanco sobre las tarjetas blancas.
    <div className="min-h-screen bg-[#f6f3ec] text-[#1f1d1a] [color-scheme:light] print:bg-white">
      <SectionHeader current="pendientes" />
      <main className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 lg:py-8">
        <h1 className="text-2xl font-semibold text-[#1f1d1a]" style={{ fontFamily: "var(--font-playfair)" }}>
          Pendientes de investigación
        </h1>
        <p className="mb-5 mt-1 max-w-2xl text-sm text-[#4f4a3f] lg:mb-6 print:hidden">
          Lo que falta pedir o mirar fuera de la app. Elige dónde vas a estar y verás solo lo que puedes hacer ahí.
        </p>
        {person && (
          <p className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[#e2dccd] bg-white px-4 py-2.5 text-sm print:hidden">
            <span>
              Mostrando solo los de <strong>{person.name}</strong>.
            </span>
            <Link href="/pendientes" className="font-medium underline underline-offset-2">
              Ver los de todas las personas
            </Link>
          </p>
        )}
        <TaskList initial={tasks} canEdit={canEdit(session.role)} person={person} />
      </main>
    </div>
  );
}
