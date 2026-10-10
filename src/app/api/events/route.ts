import { NextResponse } from "next/server";
import { apiSession, sameOrigin } from "@/lib/auth/session";
import { createEvent } from "@/lib/data/edit";
import { getPersonCard, getPersonDetail } from "@/lib/data/tree";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Agrega un hecho a una persona: { personId, event: {type, date, place, text, ...} }. */
export async function POST(request: Request) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const personId = typeof body?.personId === "string" ? body.personId : "";
  if (!UUID.test(personId)) return NextResponse.json({ error: "persona no encontrada" }, { status: 404 });

  const result = await createEvent(session.treeId, personId, body?.event, session.user);
  if (!result.ok) return NextResponse.json({ error: result.error, errors: result.errors }, { status: result.status });

  const person = await getPersonDetail(session.treeId, personId);
  const card = await getPersonCard(session.treeId, personId);
  return NextResponse.json({ person: { ...person, canEdit: true }, card });
}
