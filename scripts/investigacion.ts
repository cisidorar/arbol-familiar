/**
 * Ayuda para escribir data/investigacion.json (los hechos investigados que se
 * muestran en la ficha junto a los del GEDCOM). No toca la base de datos.
 *
 *   npm run investigacion                    revisa el archivo contra el árbol
 *   npm run investigacion -- buscar morales  muestra el uid de quien coincida
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGedcom } from "../src/lib/gedcom";
import type { ParsedEvent, ParsedPerson } from "../src/lib/gedcom/types";
import { parseResearch, type ReplaceRule } from "../src/lib/research";

const DATA_DIR = join(process.cwd(), "data");
const RESEARCH_PATH = join(DATA_DIR, "investigacion.json");

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const yearOf = (e: ParsedEvent) => {
  const iso = e.date?.from ?? e.date?.to;
  return iso ? Number(iso.slice(0, 4)) : null;
};
const nameOf = (p: ParsedPerson) => p.names.find((n) => n.isPrimary)?.display ?? p.names[0]?.display ?? "(sin nombre)";
const birthOf = (p: ParsedPerson) => {
  const birth = p.events.find((e) => e.type === "BIRT");
  return birth ? yearOf(birth) : null;
};

function loadTree() {
  const file = readdirSync(DATA_DIR).find((f) => f.toLowerCase().endsWith(".ged"));
  if (!file) throw new Error("No hay ningún archivo .ged en data/");
  return parseGedcom(readFileSync(join(DATA_DIR, file), "utf-8"));
}

function search(query: string) {
  const words = plain(query).split(/\s+/).filter(Boolean);
  const matches = loadTree().persons.filter((p) => words.every((w) => plain(nameOf(p)).includes(w)));
  if (matches.length === 0) {
    console.log(`Nadie coincide con "${query}".`);
    return;
  }
  for (const p of matches) {
    const birth = birthOf(p);
    console.log(`${p.gedcomUid ?? p.xref}  ${nameOf(p)}${birth ? ` (n. ${birth})` : ""}`);
  }
}

function check(): number {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(RESEARCH_PATH, "utf-8"));
  } catch (err) {
    console.error(`No se pudo leer data/investigacion.json: ${(err as Error).message}`);
    return 1;
  }

  const tree = loadTree();
  const byUid = new Map(tree.persons.map((p) => [p.gedcomUid ?? p.xref, p]));
  const index = parseResearch(raw);
  const problems = [...index.problems];

  for (const person of index.people) {
    const who = person.name ?? person.uid;
    const inTree = byUid.get(person.uid);
    if (!inTree) {
      problems.push(`${who}: el uid ${person.uid} no existe en el árbol (búscalo con: npm run investigacion -- buscar <nombre>).`);
      continue;
    }
    if (person.name && plain(person.name) !== plain(nameOf(inTree))) {
      problems.push(`${who}: ese uid en el árbol es "${nameOf(inTree)}"; revisa que sea la persona correcta.`);
    }

    // Lo que hay en el GEDCOM para esta persona, para saber si cada
    // "reemplaza" de verdad encuentra algo que reemplazar.
    const existing: ReplaceRule[] = [
      ...inTree.events,
      ...tree.families
        .filter((f) => f.husbXref === inTree.xref || f.wifeXref === inTree.xref)
        .flatMap((f) => f.events),
    ].map((e) => ({ kind: e.type, year: yearOf(e) }));

    console.log(`\n${nameOf(inTree)} — ${person.facts.length} hecho(s)`);
    person.facts.forEach((fact, i) => {
      const when = fact.date
        ? `${fact.date.approx ? "c. " : ""}${fact.date.year}${fact.date.yearEnd ? `–${fact.date.yearEnd}` : ""}`
        : "s/f";
      console.log(`  ${when.padEnd(11)} [${fact.tag}] ${fact.text}`);
      for (const s of fact.sources) console.log(`${" ".repeat(14)}↗ ${s.title}`);

      const where = `${who}, hecho ${i + 1}`;
      if (fact.withUid && !byUid.has(fact.withUid)) {
        problems.push(`${where}: "con" apunta al uid ${fact.withUid}, que no existe en el árbol.`);
      }
      for (const rule of fact.replaces) {
        const found = existing.some((e) => e.kind === rule.kind && (rule.year == null || e.year === rule.year));
        if (!found) {
          const have = existing.map((e) => `${e.kind}${e.year ? ` ${e.year}` : ""}`).join(", ") || "ninguno";
          problems.push(
            `${where}: "reemplaza" busca ${rule.kind}${rule.year ? ` ${rule.year}` : ""} y esta persona no tiene ese hecho en el GEDCOM (tiene: ${have}).`,
          );
        }
      }
    });
  }

  if (problems.length === 0) {
    console.log("\nTodo bien: el archivo se entiende completo.");
    return 0;
  }
  console.log(`\n${problems.length} cosa(s) por revisar:`);
  for (const p of problems) console.log(`  - ${p}`);
  return 1;
}

const [command, ...rest] = process.argv.slice(2);
if (command === "buscar") {
  if (rest.length === 0) {
    console.error("Uso: npm run investigacion -- buscar <nombre o apellido>");
    process.exit(1);
  }
  search(rest.join(" "));
} else {
  process.exit(check());
}
