import { NextResponse } from "next/server";
import { apiSession, sameOrigin } from "@/lib/auth/session";
import { deleteEvent, updateEvent } from "@/lib/data/edit";
import { getPersonCard, getPersonDetail } from "@/lib/data/tree";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ id: string }> };

async function respond(treeId: string, personId: string) {
  const person = await getPersonDetail(treeId, personId);
  const card = await getPersonCard(treeId, personId);
  return NextResponse.json({ person: { ...person, canEdit: true }, card });
}

/** Edita un hecho: { personId, event: {...} }. personId solo se usa para devolver la ficha actualizada. */
export async function PATCH(request: Request, { params }: Context) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const personId = typeof body?.personId === "string" ? body.personId : "";
  if (!UUID.test(id) || !UUID.test(personId)) return NextResponse.json({ error: "No se encontró." }, { status: 404 });

  const result = await updateEvent(session.treeId, id, body?.event, session.user);
  if (!result.ok) return NextResponse.json({ error: result.error, errors: result.errors }, { status: result.status });
  return respond(session.treeId, personId);
}

export async function DELETE(request: Request, { params }: Context) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });
  const { id } = await params;
  const personId = new URL(request.url).searchParams.get("personId") ?? "";
  if (!UUID.test(id) || !UUID.test(personId)) return NextResponse.json({ error: "No se encontró." }, { status: 404 });

  const result = await deleteEvent(session.treeId, id, session.user);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return respond(session.treeId, personId);
}
