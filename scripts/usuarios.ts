/**
 * Usuarios desde la terminal, para lo que no se puede hacer desde la app:
 * crear el primer administrador (antes de él no hay nadie que invite) y
 * recuperar el acceso si el administrador olvida su contraseña.
 *
 *   npm run usuario -- crear-admin <correo> "<nombre>"
 *   npm run usuario -- clave <correo>          (pone una contraseña nueva)
 *   npm run usuario -- vincular <correo> "<nombre en el árbol>"   (quién eres en el árbol)
 *   npm run usuario -- lista
 *
 * La contraseña se pide por teclado y no se muestra. (Para automatizar, se
 * puede pasar en la variable de entorno CLAVE.)
 */
import "dotenv/config";
import { createInterface } from "node:readline";
import { passwordProblem } from "../src/lib/auth/password";
import { normalizeEmail, ROLE_LABELS } from "../src/lib/auth/roles";
import { getPool } from "../src/lib/db/pool";
import { findPersonsByName, linkUserToPerson, listMembers, upsertUserWithRole } from "../src/lib/data/users";

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = process.stdout;
    // Mientras se escribe la contraseña no se muestra nada en pantalla.
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
    let muted = false;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (!muted) write.call(rl, s);
    };
    rl.question(question, (answer) => {
      rl.close();
      out.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function readPassword(): Promise<string> {
  if (process.env.CLAVE) return process.env.CLAVE;
  const first = await askHidden("Contraseña (no se muestra): ");
  const second = await askHidden("Repítela: ");
  if (first !== second) throw new Error("Las dos contraseñas no coinciden.");
  return first;
}

async function defaultTreeId(): Promise<string> {
  const { rows } = await getPool().query(`select id from trees order by created_at asc limit 1`);
  if (!rows[0]) throw new Error("Todavía no hay un árbol importado. Corre primero: npm run db:import -- data/zamora-balcazar.ged");
  return rows[0].id;
}

async function main() {
  const [command, rawEmail, name] = process.argv.slice(2);

  if (command === "lista") {
    const members = await listMembers(await defaultTreeId());
    if (!members.length) console.log("No hay nadie con acceso todavía.");
    for (const m of members) console.log(`${ROLE_LABELS[m.role].padEnd(14)} ${m.name} <${m.email}>`);
    return;
  }

  if (command === "vincular") {
    const email = normalizeEmail(rawEmail ?? "");
    if (!email || !name?.trim()) throw new Error('Uso: npm run usuario -- vincular correo@x.cl "Nombre en el árbol"');
    const treeId = await defaultTreeId();
    const { rows } = await getPool().query(`select id, name from users where lower(email) = $1`, [email]);
    if (!rows[0]) throw new Error(`No hay nadie con el correo ${email}.`);
    const matches = await findPersonsByName(treeId, name);
    if (!matches.length) throw new Error(`No encontré a nadie que se llame "${name}" en el árbol.`);
    if (matches.length > 1) {
      console.log("Hay varias personas; repite el comando con un nombre más completo:");
      for (const m of matches) console.log(`  ${m.displayName}${m.birth ? ` (${m.birth})` : ""}`);
      process.exitCode = 1;
      return;
    }
    await linkUserToPerson(rows[0].id, matches[0].id);
    console.log(`Listo: ${rows[0].name} quedó vinculada con ${matches[0].displayName}. El árbol se abrirá centrado en esa persona.`);
    return;
  }

  if (command !== "crear-admin" && command !== "clave") {
    console.log('Uso:\n  npm run usuario -- crear-admin <correo> "<nombre>"\n  npm run usuario -- clave <correo>\n  npm run usuario -- vincular <correo> "<nombre en el árbol>"\n  npm run usuario -- lista');
    process.exitCode = 1;
    return;
  }

  const email = normalizeEmail(rawEmail ?? "");
  if (!email) throw new Error("Falta un correo válido.");
  const treeId = await defaultTreeId();

  if (command === "clave") {
    const { rows } = await getPool().query(
      `select u.name, m.role from users u join tree_members m on m.user_id = u.id and m.tree_id = $2
       where lower(u.email) = $1`,
      [email, treeId],
    );
    if (!rows[0]) throw new Error(`No hay nadie con el correo ${email}.`);
    const password = await readPassword();
    const problem = passwordProblem(password);
    if (problem) throw new Error(problem);
    const userId = await upsertUserWithRole({ treeId, email, name: rows[0].name, password, role: rows[0].role });
    await getPool().query(`delete from sessions where user_id = $1`, [userId]);
    console.log(`Listo: ${rows[0].name} tiene contraseña nueva y se cerraron sus sesiones abiertas.`);
    return;
  }

  if (!name?.trim()) throw new Error('Falta el nombre, entre comillas: npm run usuario -- crear-admin correo@x.cl "Tu Nombre"');
  const password = await readPassword();
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  await upsertUserWithRole({ treeId, email, name: name.trim(), password, role: "admin" });
  console.log(`Listo: ${name.trim()} <${email}> es administrador. Ya puede entrar en /login.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
