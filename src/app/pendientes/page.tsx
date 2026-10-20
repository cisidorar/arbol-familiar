import type { Metadata } from "next";
import PendientesView from "@/components/PendientesView";
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
  const [tasks, people, homeId] = await Promise.all([
    listReview(session.treeId),
    getFamilyChartData(session.treeId),
    getLinkedPersonId(session.user.id),
  ]);

  return (
    // Fondo y esquema claro fijos: con el Mac en modo oscuro el texto heredado quedaría casi blanco.
    <div className="zb min-h-screen bg-white pb-24 text-ink [color-scheme:light]">
      <SectionHeader current="pendientes" />
      <main className="px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        <PendientesView tasks={tasks} people={people} homeId={homeId} />
      </main>
    </div>
  );
}
