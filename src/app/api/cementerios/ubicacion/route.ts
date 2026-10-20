import { NextResponse } from "next/server";
import { apiSession, sameOrigin } from "@/lib/auth/session";
import { updateBurialSpot } from "@/lib/data/edit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Anota dónde está la tumba dentro del cementerio: { eventId, spot }. Queda en el historial como cualquier cambio. */
export async function POST(request: Request) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const eventId = typeof body?.eventId === "string" ? body.eventId : "";
  if (!UUID.test(eventId)) return NextResponse.json({ error: "No se encontró." }, { status: 404 });
  const result = await updateBurialSpot(session.treeId, eventId, body?.spot, session.user);
  if (!result.ok) return NextResponse.json({ error: result.error, errors: result.errors }, { status: result.status });
  return NextResponse.json({ ok: true });
}
