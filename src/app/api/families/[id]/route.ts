import { NextResponse } from "next/server";
import { apiSession, sameOrigin } from "@/lib/auth/session";
import { setUnionType } from "@/lib/data/edit";
import { getPersonCard, getPersonDetail } from "@/lib/data/tree";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ id: string }> };

/** Cambia el tipo de una unión: { personId, unionType: "marriage" | "partnership" | "unknown" }. */
export async function PATCH(request: Request, { params }: Context) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const personId = typeof body?.personId === "string" ? body.personId : "";
  if (!UUID.test(id) || !UUID.test(personId)) return NextResponse.json({ error: "No se encontró." }, { status: 404 });

  const result = await setUnionType(session.treeId, id, personId, body?.unionType, session.user);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const person = await getPersonDetail(session.treeId, personId);
  const card = await getPersonCard(session.treeId, personId);
  return NextResponse.json({ person: { ...person, canEdit: true }, card });
}
