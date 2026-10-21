import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getFamilyChartData } from "@/lib/data/tree";
import { getLinkedPersonId } from "@/lib/data/users";

export const dynamic = "force-dynamic";

/** Lleva a la ficha de un antepasado directo al azar (o de cualquier persona si aún no hay vínculo). */
export async function GET() {
  const session = await requireSession();
  const [chart, selfId] = await Promise.all([getFamilyChartData(session.treeId), getLinkedPersonId(session.user.id)]);
  const byId = new Map(chart.map((c) => [c.id, c]));
  const pool: string[] = [];
  if (selfId && byId.has(selfId)) {
    const seen = new Set([selfId]);
    let frontier = [selfId];
    while (frontier.length) {
      const next: string[] = [];
      for (const id of frontier) for (const par of byId.get(id)?.rels.parents ?? []) if (!seen.has(par) && byId.has(par)) { seen.add(par); next.push(par); }
      pool.push(...next);
      frontier = next;
    }
  }
  const ids = pool.length ? pool : chart.map((c) => c.id);
  if (!ids.length) redirect("/inicio");
  redirect(`/persona/${ids[Math.floor(Math.random() * ids.length)]}`);
}
