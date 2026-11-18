// Fotos y capturas que se suben a una tarea de investigación (tabla research_task_images, migración 0026).

import { getPool } from "../db/pool";

export const MAX_TASK_IMAGE_BYTES = 3_000_000;
export const MAX_IMAGES_PER_TASK = 12;

/** `link` es el enlace de la tarea al que corresponde la foto (null si es de la tarea en general). */
export type TaskImage = { id: string; version: number; by: string | null; link: string | null };

/** Las imágenes de cada tarea (sin los bytes): sirven para mostrar las miniaturas. */
export async function listTaskImages(treeId: string): Promise<Record<string, TaskImage[]>> {
  const { rows } = await getPool().query(
    `select id, task_id, link_url, (extract(epoch from uploaded_at) * 1000)::bigint as v, uploaded_by_name
       from research_task_images where tree_id = $1 order by uploaded_at`,
    [treeId],
  );
  const out: Record<string, TaskImage[]> = {};
  for (const r of rows) (out[r.task_id as string] ??= []).push({ id: r.id, version: Number(r.v), by: r.uploaded_by_name ?? null, link: r.link_url ?? null });
  return out;
}

export async function getTaskImage(treeId: string, id: string): Promise<{ type: string; data: Buffer } | null> {
  const { rows } = await getPool().query(`select content_type, data from research_task_images where tree_id = $1 and id = $2`, [treeId, id]);
  return rows[0] ? { type: rows[0].content_type, data: rows[0].data } : null;
}

/** Guarda una imagen en la tarea. Devuelve null si la tarea no existe o ya tiene el máximo. */
export async function saveTaskImage(
  treeId: string,
  taskId: string,
  type: string,
  data: Buffer,
  actor: { id: string; name: string },
  link: string | null = null,
): Promise<TaskImage | "no-task" | "full"> {
  const pool = getPool();
  const task = await pool.query(`select 1 from research_tasks where id = $1 and tree_id = $2`, [taskId, treeId]);
  if (!task.rowCount) return "no-task";
  const count = await pool.query(`select count(*)::int as n from research_task_images where task_id = $1`, [taskId]);
  if (count.rows[0].n >= MAX_IMAGES_PER_TASK) return "full";
  const { rows } = await pool.query(
    `insert into research_task_images (tree_id, task_id, content_type, data, uploaded_by, uploaded_by_name, link_url)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, (extract(epoch from uploaded_at) * 1000)::bigint as v`,
    [treeId, taskId, type, data, actor.id, actor.name, link],
  );
  return { id: rows[0].id, version: Number(rows[0].v), by: actor.name, link };
}

export async function deleteTaskImage(treeId: string, id: string): Promise<void> {
  await getPool().query(`delete from research_task_images where tree_id = $1 and id = $2`, [treeId, id]);
}
