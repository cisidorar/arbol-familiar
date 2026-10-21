"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getLinkedPersonId, linkUserToPerson } from "@/lib/data/users";
import { getPool } from "@/lib/db/pool";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "¿Quién eres en el árbol?": cada usuario puede vincularse una vez a su persona. Cambiarla después
 * (o vincular a otra persona) lo hace quien administra el archivo.
 */
export async function linkMyself(personId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Tu sesión terminó. Vuelve a entrar." };
  if (!UUID.test(personId)) return { ok: false, error: "No encontré a esa persona." };
  if (await getLinkedPersonId(session.user.id)) return { ok: false, error: "Tu usuario ya está vinculado. Pídele a quien administra el archivo que lo cambie." };
  const { rows } = await getPool().query(`select 1 from persons where id = $1 and tree_id = $2`, [personId, session.treeId]);
  if (!rows.length) return { ok: false, error: "No encontré a esa persona en el árbol." };
  await linkUserToPerson(session.user.id, personId);
  revalidatePath("/", "layout");
  return { ok: true };
}
