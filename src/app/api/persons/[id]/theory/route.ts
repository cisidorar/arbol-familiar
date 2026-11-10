import { NextResponse } from "next/server";
import { apiSession, sameOrigin } from "@/lib/auth/session";
import { setParentsTheory } from "@/lib/data/edit";
import { getFamilyChartData, getPersonCard, getPersonDetail } from "@/lib/data/tree";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ id: string }> };

/** Marca o desmarca como teoría el vínculo de la persona con sus padres: { theory: boolean, note?: string }. */
export async function PUT(request: Request, { params }: Context) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "No se encontró." }, { status: 404 });
  const body = await request.json().catch(() => null);

  const result = await setParentsTheory(session.treeId, id, body?.theory, body?.note, session.user);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const person = await getPersonDetail(session.treeId, id);
  const card = await getPersonCard(session.treeId, id);
  // El color pasa a todos los antepasados de arriba: el árbol recibe los datos al día.
  const data = await getFamilyChartData(session.treeId);
  return NextResponse.json({ person: { ...person, canEdit: true }, card, data });
}
