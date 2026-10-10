import { NextResponse } from "next/server";
import { apiSession, sameOrigin } from "@/lib/auth/session";
import { promoteParticipant } from "@/lib/data/participants";
import { getFamilyChartData, getPersonCard, getPersonDetail } from "@/lib/data/tree";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Agrega al árbol a una persona relacionada con un hecho (un padrino, un testigo) que estaba solo
 * con su nombre, y la deja vinculada:
 * { participantId, personId (de quien se mira la ficha), person: {given, surnamePat, …}, relation?, of? }.
 * Devuelve la ficha actualizada y los datos del árbol (si hubo parentesco, hay vínculos nuevos).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const viewId = typeof body?.personId === "string" ? body.personId : "";
  const participantId = typeof body?.participantId === "string" ? body.participantId : "";
  if (!UUID.test(id) || !UUID.test(viewId) || !UUID.test(participantId)) {
    return NextResponse.json({ error: "No se encontró." }, { status: 404 });
  }

  const result = await promoteParticipant(
    session.treeId, id, participantId,
    { person: body?.person, relation: body?.relation || null, of: body?.of },
    session.user,
  );
  if (!result.ok) return NextResponse.json({ error: result.error, errors: result.errors }, { status: result.status });

  const person = await getPersonDetail(session.treeId, viewId);
  const card = await getPersonCard(session.treeId, viewId);
  return NextResponse.json({
    person: { ...person, canEdit: true },
    card,
    data: await getFamilyChartData(session.treeId),
    addedId: result.personId,
  });
}
