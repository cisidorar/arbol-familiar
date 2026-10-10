import { NextResponse } from "next/server";
import { apiSession, sameOrigin } from "@/lib/auth/session";
import { setChildBirthApprox } from "@/lib/data/child-birth";
import { getPersonDetail } from "@/lib/data/tree";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Anota (o quita, con fecha vacía) la fecha tentativa de nacimiento de un
 * hijo/a en la ficha de este padre o madre: { childId, date }. No cambia la
 * ficha del hijo/a. Devuelve la ficha del padre ya actualizada.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "persona no encontrada" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { childId?: unknown; date?: unknown } | null;
  const childId = typeof body?.childId === "string" && UUID.test(body.childId) ? body.childId : null;
  if (!childId) return NextResponse.json({ error: "Falta el hijo o hija." }, { status: 400 });

  const result = await setChildBirthApprox(session.treeId, id, childId, body?.date, session.user);
  if (!result.ok) return NextResponse.json({ error: result.error, errors: result.errors }, { status: result.status });

  const person = await getPersonDetail(session.treeId, id);
  return NextResponse.json({ person: { ...person, canEdit: true } });
}
