/**
 * Pone una fecha aproximada de nacimiento a los hijos de José Dolores Canelo e Isidora Valencia
 * que solo tienen defunción (por la edad anotada al morir). Usa la misma función que el botón
 * "Agregar fecha aproximada" de la ficha: no toca la ficha de los hijos y queda en el historial.
 * Salta a quien ya tenga una fecha aproximada.
 *
 *   npx tsx scripts/fechas-hijos-isidora.ts            (solo muestra qué haría)
 *   npx tsx scripts/fechas-hijos-isidora.ts --apply
 *   Opcional: --correo tu@correo.cl
 */
import "dotenv/config";
import { getPool } from "../src/lib/db/pool";
import { setChildBirthApprox } from "../src/lib/data/child-birth";

const APPLY = process.argv.includes("--apply");
const mailIdx = process.argv.indexOf("--correo");
const MAIL = mailIdx > 0 ? process.argv[mailIdx + 1] : null;
const pool = getPool();

// nombre → [fecha aproximada, de dónde sale]
const FECHAS: Record<string, [string, string]> = {
  "Antonio Canelo Valencia": ["c. 1870", "índice civil (murió en 1885)"],
  "Cesaria Canelo Valencia": ["c. 1871", "28 años al morir en 1899 (partida parroquial); el índice civil dice 1877"],
  "Rosa Canelo Valencia": ["c. 1878", "índice civil (murió en 1888)"],
  "Horacio Canelo Valencia": ["c. 1882", "índice civil (murió en 1885)"],
  "Manuel Canelo Valencia": ["c. 1884", "partida parroquial (2 años al morir en 1886); el índice civil dice 1861, imposible"],
};

async function main() {
  const { rows: ref } = await pool.query(
    `select p.tree_id, p.id from persons p join person_names n on n.person_id = p.id
     where lower(n.display_name) = 'josé dolores canelo' group by p.tree_id, p.id`);
  if (ref.length !== 1) throw new Error(`Esperaba un solo "José Dolores Canelo" y hay ${ref.length}.`);
  const treeId = ref[0].tree_id as string;
  const jose = ref[0].id as string;
  const { rows: users } = MAIL
    ? await pool.query(`select id, name from users where lower(email) = lower($1)`, [MAIL])
    : await pool.query(`select id, name from users order by created_at limit 1`);
  if (!users[0]) throw new Error("No encontré el usuario. Usa --correo tu@correo.");
  const actor = { id: users[0].id as string, name: users[0].name as string };
  console.log(`${APPLY ? "ESCRIBIENDO" : "SIMULACRO (no escribe)"} como ${actor.name}\n`);

  for (const [nombre, [fecha, nota]] of Object.entries(FECHAS)) {
    const { rows } = await pool.query(
      `select c.id, fc.approx_birth_text,
              exists (select 1 from events e where e.person_id = c.id and e.event_type = 'BIRT' and e.date_from is not null) as tiene_nac
       from persons c join person_names n on n.person_id = c.id
       join family_children fc on fc.child_id = c.id join families f on f.id = fc.family_id
       where c.tree_id = $1 and lower(n.display_name) = lower($2) and $3 in (f.partner1_id, f.partner2_id)`,
      [treeId, nombre, jose]);
    if (rows.length !== 1) { console.log(`? ${nombre}: encontré ${rows.length}, no toco nada`); continue; }
    if (rows[0].approx_birth_text || rows[0].tiene_nac) { console.log(`= ${nombre}: ya tiene fecha`); continue; }
    console.log(`+ ${nombre}: ${fecha} — ${nota}`);
    if (!APPLY) continue;
    const r = await setChildBirthApprox(treeId, jose, rows[0].id as string, fecha, actor);
    if (!r.ok) throw new Error(`${nombre}: ${r.error} ${JSON.stringify(r.errors ?? {})}`);
  }
  if (!APPLY) console.log("\nSi está bien, corre de nuevo con --apply");
  await pool.end();
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
