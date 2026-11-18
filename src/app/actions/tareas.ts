"use server";

// Tachar o destachar una tarea de investigación. Solo administradores.

import { revalidatePath } from "next/cache";
import { canAdmin } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { getPool } from "@/lib/db/pool";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setResearchTaskDone(id: string, done: boolean): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session || !canAdmin(session.role)) return { error: "No tienes permiso." };
  if (!UUID.test(id)) return { error: "Tarea no válida." };
  await getPool().query(
    `update research_tasks set done = $3, done_at = case when $3 then now() else null end
      where id = $1 and tree_id = $2`,
    [id, session.treeId, done],
  );
  // Los hechos marcados «por revisar» que resuelve la tarea: se quitan del árbol al tacharla.
  await getPool().query(
    `update events set needs_review = not $3
      where tree_id = $2 and id in (select unnest(event_ids) from research_tasks where id = $1)`,
    [id, session.treeId, done],
  );
  revalidatePath("/pendientes");
  revalidatePath("/");
  return {};
}
