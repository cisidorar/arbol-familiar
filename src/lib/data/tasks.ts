// Pendientes de investigación en la base (tabla research_tasks).
// No comprueban permisos: eso lo hacen las rutas de la API y las páginas.

import { getPool } from "../db/pool";
import { sortTasks, type Task, type TaskStatus, type TaskValues } from "../tasks";

const SELECT = `
  select t.id, t.person_id, t.question as title, t.venue, t.status, t.ask_text, t.reference, t.source_url,
         t.hypothesis, t.result, t.created_at, t.updated_at,
         (select n.display_name from person_names n where n.person_id = t.person_id and n.is_primary limit 1) as person_name
  from research_tasks t`;

type Row = {
  id: string; person_id: string | null; title: string; venue: Task["venue"]; status: TaskStatus;
  ask_text: string | null; reference: string | null; source_url: string | null; hypothesis: string | null;
  result: string | null; created_at: Date; updated_at: Date; person_name: string | null;
};

function toTask(r: Row): Task {
  return {
    id: r.id,
    personId: r.person_id,
    personName: r.person_name,
    title: r.title,
    venue: r.venue,
    status: r.status,
    askText: r.ask_text,
    reference: r.reference,
    sourceUrl: r.source_url,
    hypothesis: r.hypothesis,
    result: r.result,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function listTasks(treeId: string, personId?: string): Promise<Task[]> {
  const { rows } = personId
    ? await getPool().query(`${SELECT} where t.tree_id = $1 and t.person_id = $2`, [treeId, personId])
    : await getPool().query(`${SELECT} where t.tree_id = $1`, [treeId]);
  return sortTasks((rows as Row[]).map(toTask));
}

async function getTask(treeId: string, id: string): Promise<Task | null> {
  const { rows } = await getPool().query(`${SELECT} where t.tree_id = $1 and t.id = $2`, [treeId, id]);
  return rows[0] ? toTask(rows[0] as Row) : null;
}

/** false = la persona indicada no es de este árbol. */
async function personInTree(treeId: string, personId: string | null): Promise<boolean> {
  if (!personId) return true;
  const { rows } = await getPool().query(`select 1 from persons where tree_id = $1 and id = $2`, [treeId, personId]);
  return rows.length > 0;
}

export type TaskResult = { ok: true; task: Task } | { ok: false; status: 400 | 404; error: string };

export async function createTask(treeId: string, v: TaskValues, userId: string): Promise<TaskResult> {
  if (!(await personInTree(treeId, v.personId))) return { ok: false, status: 400, error: "No se encontró a esa persona." };
  const { rows } = await getPool().query(
    `insert into research_tasks (tree_id, person_id, question, hypothesis, status, venue, ask_text, reference, source_url, result, created_by, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) returning id`,
    [treeId, v.personId, v.title, v.hypothesis, v.status, v.venue, v.askText, v.reference, v.sourceUrl, v.result, userId],
  );
  const task = await getTask(treeId, rows[0].id as string);
  return task ? { ok: true, task } : { ok: false, status: 404, error: "No se encontró." };
}

export async function updateTask(treeId: string, id: string, v: TaskValues, userId: string): Promise<TaskResult> {
  if (!(await personInTree(treeId, v.personId))) return { ok: false, status: 400, error: "No se encontró a esa persona." };
  const { rowCount } = await getPool().query(
    `update research_tasks
        set person_id = $3, question = $4, hypothesis = $5, status = $6, venue = $7, ask_text = $8,
            reference = $9, source_url = $10, result = $11, updated_by = $12, updated_at = now()
      where tree_id = $1 and id = $2`,
    [treeId, id, v.personId, v.title, v.hypothesis, v.status, v.venue, v.askText, v.reference, v.sourceUrl, v.result, userId],
  );
  if (!rowCount) return { ok: false, status: 404, error: "No se encontró. Puede que alguien lo haya borrado." };
  const task = await getTask(treeId, id);
  return task ? { ok: true, task } : { ok: false, status: 404, error: "No se encontró." };
}

export async function deleteTask(treeId: string, id: string): Promise<boolean> {
  const { rowCount } = await getPool().query(`delete from research_tasks where tree_id = $1 and id = $2`, [treeId, id]);
  return !!rowCount;
}
