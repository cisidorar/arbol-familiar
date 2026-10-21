import type { Metadata } from "next";
import CemeteryGuide, { type GuidePlace } from "@/components/CemeteryGuide";
import SectionHeader from "@/components/SectionHeader";
import { requireSession } from "@/lib/auth/session";
import { getCemeteries } from "@/lib/data/cemeteries";
import { listUploadedPhotos } from "@/lib/data/cemetery-photos";
import { canEdit } from "@/lib/auth/roles";
import { uploadedPhotoUrl } from "@/lib/geo/cemetery-photos";
import { getFamilyChartData } from "@/lib/data/tree";
import { getLinkedPersonId } from "@/lib/data/users";
import { REGIONES, comunasOfRegion } from "@/lib/geo";
import { kinshipPhrase, type GraphPerson } from "@/lib/lineage";

export const metadata: Metadata = { title: "Cementerios · Archivo Zamora Balcázar" };
export const dynamic = "force-dynamic";

export default async function CementeriosPage() {
  const session = await requireSession();
  const [groups, selfId, people, uploaded] = await Promise.all([
    getCemeteries(session.treeId),
    getLinkedPersonId(session.user.id),
    getFamilyChartData(session.treeId),
    listUploadedPhotos(session.treeId),
  ]);

  const graph: GraphPerson[] = people.map((p) => ({ id: p.id, data: { gender: p.data.gender, label: p.data.label }, rels: p.rels }));
  const byId = new Map(graph.map((p) => [p.id, p]));

  // La familia de quien mira: sus antepasados y todos los descendientes de cada uno de ellos (hermanos,
  // tíos, primos, los primos de sus abuelos y de sus tatarabuelos…), con sus parejas. No entran los
  // antepasados de esas parejas (por ejemplo, el papá de la esposa de un primo): no son de su sangre.
  let blood: Set<string> | null = null;
  if (selfId && byId.has(selfId)) {
    const up = new Set<string>();
    let frontier = [selfId];
    while (frontier.length) {
      const next: string[] = [];
      for (const id of frontier) for (const par of byId.get(id)?.rels.parents ?? []) if (!up.has(par)) { up.add(par); next.push(par); }
      frontier = next;
    }
    const family = new Set<string>([selfId, ...up]);
    frontier = [...family];
    while (frontier.length) {
      const next: string[] = [];
      for (const id of frontier) for (const ch of byId.get(id)?.rels.children ?? []) if (!family.has(ch)) { family.add(ch); next.push(ch); }
      frontier = next;
    }
    blood = new Set(family);
    for (const id of family) for (const sp of byId.get(id)?.rels.spouses ?? []) blood.add(sp);
  }

  const places: GuidePlace[] = groups.map((g) => ({ ...g, people: blood ? g.people.filter((b) => blood!.has(b.personId)) : g.people })).filter((g) => g.people.length).map((g) => {
    const comuna = g.comunaCode && g.regionCode ? comunasOfRegion(g.regionCode).find((c) => c.code === g.comunaCode) : undefined;
    // Todas las personas del árbol; qué es cada una para quien mira, los más cercanos primero.
    const withKin = g.people
      .map((b) => {
        const k = selfId ? kinshipPhrase(selfId, b.personId, byId) : null;
        return { ...b, relation: k?.label ?? null, distance: k?.distance ?? null, sex: byId.get(b.personId)?.data.gender ?? null };
      })
      .sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99) || a.name.localeCompare(b.name, "es"));
    // La foto que subió la familia, si hay.
    const up = uploaded.get(g.key);
    const photo: GuidePlace["photo"] = up ? { src: uploadedPhotoUrl(g.key, up.version), by: up.by } : null;
    return {
      ...g,
      photo,
      people: withKin,
      point: comuna ? [(comuna.bbox[0] + comuna.bbox[2]) / 2, (comuna.bbox[1] + comuna.bbox[3]) / 2] : null,
      comunaD: comuna?.d ?? null,
    };
  });

  return (
    // Fondo blanco y esquema claro fijo: con el Mac en modo oscuro el texto heredado quedaría casi blanco.
    <div className="zb min-h-screen bg-white text-ink [color-scheme:light]">
      <SectionHeader current="cementerios" />
      <main>
        <CemeteryGuide
          places={places}
          regions={REGIONES.map((r) => ({ code: r.code, name: r.name, d: r.d, bbox: r.bbox }))}
          graph={selfId ? graph : []}
          rootId={selfId}
          canEdit={canEdit(session.role)}
        />
      </main>
    </div>
  );
}
