import { NextResponse } from "next/server";
import { apiSession, sameOrigin } from "@/lib/auth/session";
import { setEventReview } from "@/lib/data/edit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pone o quita el pendiente de un hecho: { review } con el tipo (familysearch_presencial)
 * o vacío para quitarlo («ya lo revisé»), y `note` con un comentario opcional. Solo administradores.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "No se encontró." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const result = await setEventReview(session.treeId, id, body?.review, session.user, body?.note);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
