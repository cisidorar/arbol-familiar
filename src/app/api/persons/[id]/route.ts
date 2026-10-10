import { NextResponse } from "next/server";
import { canEdit } from "@/lib/auth/roles";
import { apiSession, sameOrigin, type Session } from "@/lib/auth/session";
import { deletePerson } from "@/lib/data/delete-person";
import { getFamilyChartData } from "@/lib/data/tree";
import { saveFicha, updatePerson } from "@/lib/data/edit";
import { getPersonCard, getPersonDetail } from "@/lib/data/tree";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function detailResponse(session: Session, id: string) {
  const person = await getPersonDetail(session.treeId, id);
  if (!person) return NextResponse.json({ error: "persona no encontrada" }, { status: 404 });
  // canEdit le dice a la ficha si mostrar los controles de edición. Es solo
  // para la pantalla: cada ruta que guarda vuelve a comprobar el rol.
  return NextResponse.json({ ...person, canEdit: canEdit(session.role) });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await apiSession();
  if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "persona no encontrada" }, { status: 404 });
  return detailResponse(session, id);
}

/** Guarda los datos básicos de la persona. Devuelve la ficha y la tarjeta ya actualizadas. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "persona no encontrada" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const result = await updatePerson(session.treeId, id, body, session.user);
  if (!result.ok) return NextResponse.json({ error: result.error, errors: result.errors }, { status: result.status });

  const person = await getPersonDetail(session.treeId, id);
  const card = await getPersonCard(session.treeId, id);
  return NextResponse.json({ person: { ...person, canEdit: true }, card });
}

/**
 * Guarda la ficha completa (el formulario de "Editar"): los datos de la
 * persona y sus hechos cambiados, nuevos o quitados, todo junto o nada.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "persona no encontrada" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const result = await saveFicha(session.treeId, id, body, session.user);
  if (!result.ok) return NextResponse.json({ error: result.error, fields: result.fields }, { status: result.status });

  const person = await getPersonDetail(session.treeId, id);
  const card = await getPersonCard(session.treeId, id);
  return NextResponse.json({ person: { ...person, canEdit: true }, card });
}

/** Elimina a la persona del árbol. Devuelve los datos del árbol al día. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "persona no encontrada" }, { status: 404 });

  const result = await deletePerson(session.treeId, id, session.user);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, data: await getFamilyChartData(session.treeId) });
}
