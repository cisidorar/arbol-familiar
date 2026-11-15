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
  revalidatePath("/pendientes");
  return {};
}
