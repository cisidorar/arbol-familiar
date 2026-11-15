// Tareas de investigación: qué buscar (FamilySearch, Registro Civil, datos por cargar),
// ordenadas por lo que más desbloquean. Viven en research_tasks (migración 0023).

import { getPool } from "../db/pool";

export type ResearchTask = {
  id: string;
  title: string;
  detail: string;
  links: { label: string; url: string }[];
  done: boolean;
};

export type ResearchGroup = {
  rank: number;
  label: string;
  unlocks: string;
  tasks: ResearchTask[];
};

export async function listResearchTasks(treeId: string): Promise<ResearchGroup[]> {
  const { rows } = await getPool().query(
    `select id, group_rank, group_label, group_unlocks, title, detail, links, done
       from research_tasks
      where tree_id = $1
      order by group_rank, item_rank`,
    [treeId],
  );
  const groups: ResearchGroup[] = [];
  for (const r of rows) {
    let g = groups.find((x) => x.rank === r.group_rank);
    if (!g) {
      g = { rank: r.group_rank, label: r.group_label, unlocks: r.group_unlocks, tasks: [] };
      groups.push(g);
    }
    g.tasks.push({ id: r.id, title: r.title, detail: r.detail, links: r.links ?? [], done: r.done });
  }
  return groups;
}
