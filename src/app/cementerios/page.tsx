import type { Metadata } from "next";
import CemeteryGuide, { type GuidePlace } from "@/components/CemeteryGuide";
import SectionHeader from "@/components/SectionHeader";
import { requireSession } from "@/lib/auth/session";
import { getCemeteries } from "@/lib/data/cemeteries";
import { getFamilyChartData } from "@/lib/data/tree";
import { getLinkedPersonId } from "@/lib/data/users";
import { REGIONES, comunasOfRegion } from "@/lib/geo";
import { kinshipLabel, type GraphPerson } from "@/lib/lineage";

export const metadata: Metadata = { title: "Cementerios · Archivo Zamora Balcázar" };
export const dynamic = "force-dynamic";

export default async function CementeriosPage() {
  const session = await requireSession();
  const [groups, selfId, people] = await Promise.all([
    getCemeteries(session.treeId),
    getLinkedPersonId(session.user.id),
    getFamilyChartData(session.treeId),
  ]);

  const graph: GraphPerson[] = people.map((p) => ({ id: p.id, data: { gender: p.data.gender, label: p.data.label }, rels: p.rels }));
  const byId = new Map(graph.map((p) => [p.id, p]));

  const places: GuidePlace[] = groups.map((g) => {
    const comuna = g.comunaCode && g.regionCode ? comunasOfRegion(g.regionCode).find((c) => c.code === g.comunaCode) : undefined;
    // Qué es cada persona para quien mira; los más cercanos primero.
    const withKin = g.people
      .map((b) => {
        const k = selfId ? kinshipLabel(selfId, b.personId, byId) : null;
        return { ...b, relation: k?.label ?? null, distance: k?.distance ?? null };
      })
      .sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99) || a.name.localeCompare(b.name, "es"));
    return {
      ...g,
      people: withKin,
      point: comuna ? [(comuna.bbox[0] + comuna.bbox[2]) / 2, (comuna.bbox[1] + comuna.bbox[3]) / 2] : null,
      comunaD: comuna?.d ?? null,
    };
  });

  return (
    // Colores propios y esquema claro fijo: con el Mac en modo oscuro el texto heredado quedaría casi blanco.
    <div className="min-h-screen bg-[#f6f3ec] text-[#1f1d1a] [color-scheme:light]">
      <SectionHeader current="cementerios" />
      <main className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 lg:py-8">
        <CemeteryGuide
          places={places}
          regions={REGIONES.map((r) => ({ code: r.code, name: r.name, d: r.d, bbox: r.bbox }))}
          graph={selfId ? graph : []}
          rootId={selfId}
        />
      </main>
    </div>
  );
}
