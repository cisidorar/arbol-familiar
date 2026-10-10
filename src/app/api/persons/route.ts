import { NextResponse } from "next/server";
import { apiSession, sameOrigin } from "@/lib/auth/session";
import { addRelative } from "@/lib/data/relatives";
import { getFamilyChartData } from "@/lib/data/tree";

/**
 * Agrega a una persona nueva, ya unida a un familiar (el "+" de una tarjeta):
 * { relation, of, otherParentId?, person: {given, surnamePat, …}, birthDate? }.
 * Devuelve su id y los datos del árbol al día, para que la pantalla sume la
 * tarjeta nueva y los vínculos que cambiaron sin recargar.
 */
export async function POST(request: Request) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const result = await addRelative(session.treeId, body, session.user);
  if (!result.ok) return NextResponse.json({ error: result.error, errors: result.errors }, { status: result.status });

  return NextResponse.json({ id: result.id, data: await getFamilyChartData(session.treeId) });
}
