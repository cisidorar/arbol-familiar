/**
 * De Digna Frez Carvallo solo se sabe (por la familia) que es la madre de Rosa Elvira Canelo.
 * Este script saca a sus otros hijos anotados (Manuel (chirigua), María…) de la unión
 * José Dolores + Digna y los deja como hijos de José Dolores con madre sin anotar.
 * No borra a nadie ni toca a Rosa Elvira. Cada cambio queda en el historial.
 *
 *   npx tsx scripts/quitar-hijos-de-digna.ts            (solo muestra qué haría)
 *   npx tsx scripts/quitar-hijos-de-digna.ts --apply    (escribe)
 *   Opcional: --correo tu@correo.cl
 */
import "dotenv/config";
import { getPool } from "../src/lib/db/pool";
import { logChange, transaction } from "../src/lib/data/edit";

const APPLY = process.argv.includes("--apply");
const mailIdx = process.argv.indexOf("--correo");
const MAIL = mailIdx > 0 ? process.argv[mailIdx + 1] : null;
const pool = getPool();

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

  const { rows: fams } = await pool.query(
    `select f.id, f.partner1_id, f.partner2_id, n.display_name as otra, o.id as otra_id
     from families f
     join persons o on o.id = case when f.partner1_id = $2 then f.partner2_id else f.partner1_id end
     join person_names n on n.person_id = o.id and n.is_primary
     where f.tree_id = $1 and $2 in (f.partner1_id, f.partner2_id) and lower(n.display_name) like 'digna frez%'`,
    [treeId, jose]);
  if (fams.length !== 1) throw new Error(`Esperaba una sola unión de José Dolores con Digna y hay ${fams.length}.`);
  const famDigna = fams[0].id as string;
  const digna = fams[0].otra_id as string;

  const { rows: hijos } = await pool.query(
    `select c.id, n.display_name from family_children fc
     join persons c on c.id = fc.child_id join person_names n on n.person_id = c.id and n.is_primary
     where fc.family_id = $1 order by n.display_name`, [famDigna]);
  const mover = hijos.filter((h) => !/^rosa elvira canelo/i.test(h.display_name as string));
  console.log(`Hijos hoy bajo Digna: ${hijos.map((h) => h.display_name).join(", ")}`);
  if (!hijos.some((h) => /^rosa elvira canelo/i.test(h.display_name as string)))
    throw new Error("Rosa Elvira no está entre los hijos de Digna: no toco nada.");
  if (!mover.length) { console.log("Nada que mover: Digna ya solo tiene a Rosa Elvira."); await pool.end(); return; }
  for (const h of mover) console.log(`- ${h.display_name}: pasa a hijo/a de José Dolores, sin madre anotada`);
  console.log(`- Digna: queda como madre de Rosa Elvira, con una nota`);
  if (!APPLY) { console.log("\nSi está bien, corre de nuevo con --apply"); await pool.end(); return; }

  await transaction(async (client) => {
    let { rows: solo } = await client.query(
      `select id from families where tree_id = $1
         and ((partner1_id = $2 and partner2_id is null) or (partner2_id = $2 and partner1_id is null))
       order by created_at limit 1`, [treeId, jose]);
    if (!solo.length) {
      ({ rows: solo } = await client.query(
        `insert into families (tree_id, partner1_id, union_type) values ($1, $2, 'unknown') returning id`, [treeId, jose]));
    }
    const famSolo = solo[0].id as string;
    for (const h of mover) {
      await client.query(`delete from family_children where family_id = $1 and child_id = $2`, [famDigna, h.id]);
      await client.query(`insert into family_children (family_id, child_id) values ($1, $2) on conflict do nothing`, [famSolo, h.id]);
      await logChange(client, {
        treeId, actor, personId: h.id as string, entity: "person", entityId: h.id as string, action: "update",
        before: { madre: "Digna Frez Carvallo" }, after: { madre: null, nota: "Solo se sabe que Digna es madre de Rosa Elvira" },
      });
    }
    await client.query(
      `update persons set notes = 'Por tradición familiar es la madre de Rosa Elvira Canelo. Ningún registro la nombra; de los otros hijos de José Dolores no se sabe quién es la madre.', edited_at = now(), edited_by = $2
       where id = $1 and (notes is null or notes = '')`, [digna, actor.id]);
  });
  console.log("\nListo. Recarga la app.");
  await pool.end();
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
