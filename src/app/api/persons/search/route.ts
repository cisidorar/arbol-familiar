import { NextResponse } from "next/server";
import { apiSession } from "@/lib/auth/session";
import { sortByCloseness } from "@/lib/closeness";
import { getRelationGraph, searchPersons } from "@/lib/data/tree";
import { getLinkedPersonId } from "@/lib/data/users";

export async function GET(request: Request) {
  const { session, denied } = await apiSession();
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });
  // Con 400 personas, un nombre común trae muchas coincidencias: primero las de la familia cercana de quien busca.
  const selfId = await getLinkedPersonId(session.user.id);
  const found = await searchPersons(session.treeId, q, selfId ? 120 : 30);
  if (!selfId) return NextResponse.json({ results: found });
  const graph = await getRelationGraph(session.treeId);
  return NextResponse.json({ results: sortByCloseness(graph, selfId, found).slice(0, 30) });
}
