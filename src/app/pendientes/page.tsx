import type { Metadata } from "next";
import PendientesView from "@/components/PendientesView";
import ResearchTasks from "@/components/ResearchTasks";
import { listResearchTasks } from "@/lib/data/research-tasks";
import SectionHeader from "@/components/SectionHeader";
import { requireAdmin } from "@/lib/auth/session";
import { listReview } from "@/lib/data/review";
import { getFamilyChartData } from "@/lib/data/tree";
import { getLinkedPersonId } from "@/lib/data/users";

export const metadata: Metadata = { title: "Pendientes · Archivo Zamora Balcázar" };
export const dynamic = "force-dynamic";

/**
 * Los hechos marcados «por revisar» (se marcan al editar la ficha), ordenados por tipo de pendiente.
 * Pensada para usarla en el centro de FamilySearch: el enlace del documento y la ficha para corregirla.
 */
export default async function PendientesPage() {
  const session = await requireAdmin();
  const [tasks, people, homeId, research] = await Promise.all([
    listReview(session.treeId),
    getFamilyChartData(session.treeId),
    getLinkedPersonId(session.user.id),
    listResearchTasks(session.treeId),
  ]);

  // Un hecho marcado que ya es parte de una tarea se muestra dentro de ella, no otra vez abajo.
  const linked = new Set(research.flatMap((g) => g.tasks.flatMap((t) => t.eventIds)));
  const reviewById = Object.fromEntries(tasks.filter((t) => linked.has(t.eventId)).map((t) => [t.eventId, t]));
  const rest = tasks.filter((t) => !linked.has(t.eventId));

  return (
    // Fondo y esquema claro fijos: con el Mac en modo oscuro el texto heredado quedaría casi blanco.
    <div className="zb album min-h-screen pb-24 text-ink [color-scheme:light]">
      <SectionHeader current="pendientes" />
      <main className="px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-[112rem]">
          {rest.length > 0 && (
            <a
              href="#documentos"
              className="mb-6 flex min-h-12 items-center justify-between gap-3 rounded-2xl border-2 border-trigo bg-trigo/20 px-5 py-2 text-[1.125rem] font-bold"
            >
              <span>
                Además hay {rest.length} {rest.length === 1 ? "documento" : "documentos"} por revisar con su enlace
              </span>
              <span aria-hidden="true">Ir ↓</span>
            </a>
          )}
          <ResearchTasks groups={research} reviewById={reviewById} people={people} homeId={homeId} />
        </div>
        {rest.length > 0 && <PendientesView tasks={rest} people={people} homeId={homeId} />}
      </main>
    </div>
  );
}
