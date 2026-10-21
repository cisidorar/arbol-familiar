import { getPool } from "@/lib/db/pool";

export type FamilyDateItem = {
  /** 0 = hoy, 1 = mañana… */
  inDays: number;
  /** MM-DD, para mostrar "20 oct". */
  month: number;
  day: number;
  kind: "nace" | "cumple" | "muere" | "casan";
  /** Años desde el hecho (o la edad que se cumple). */
  years: number;
  people: { id: string; name: string }[];
  place: string | null;
};

/** La fecha de hoy en Chile, como "YYYY-MM-DD". */
export function todayInChile(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

const APPROX = /^\s*(ABT|EST|CAL|BEF|AFT|BET|FROM|TO|INT)\b/i;

/**
 * Lo que pasó en la familia en estas fechas (de hoy a `days - 1` días más): nacimientos, defunciones y matrimonios
 * con día exacto. Las fechas de solo año o aproximadas no cuentan: no se sabe el día.
 */
export async function getFamilyOnDates(treeId: string, today: string, days = 14): Promise<FamilyDateItem[]> {
  const pool = getPool();
  const base = `with days as (select k, ($2::date + k) as d from generate_series(0, $3::int - 1) k)`;
  const year = Number(today.slice(0, 4));

  const { rows: personRows } = await pool.query(
    `${base}
     select days.k, e.event_type, e.date_text, extract(year from e.date_from)::int as y,
            extract(month from days.d)::int as m, extract(day from days.d)::int as dd, extract(year from days.d)::int as ty,
            p.id as person_id, n.display_name, p.is_living, pl.raw_text as place
     from days
     join events e on e.tree_id = $1
                  and e.event_type in ('BIRT', 'DEAT')
                  and e.person_id is not null
                  and e.date_from = e.date_to
                  and extract(month from e.date_from) = extract(month from days.d)
                  and extract(day from e.date_from) = extract(day from days.d)
     join persons p on p.id = e.person_id
     left join person_names n on n.person_id = p.id and n.is_primary
     left join places pl on pl.id = e.place_id
     order by days.k, e.date_from`,
    [treeId, today, days],
  );

  const { rows: marrRows } = await pool.query(
    `${base}
     select days.k, e.date_text, extract(year from e.date_from)::int as y,
            extract(month from days.d)::int as m, extract(day from days.d)::int as dd, extract(year from days.d)::int as ty,
            f.partner1_id, f.partner2_id, n1.display_name as n1, n2.display_name as n2, pl.raw_text as place
     from days
     join events e on e.tree_id = $1
                  and e.event_type = 'MARR'
                  and e.family_id is not null
                  and e.date_from = e.date_to
                  and extract(month from e.date_from) = extract(month from days.d)
                  and extract(day from e.date_from) = extract(day from days.d)
     join families f on f.id = e.family_id
     left join person_names n1 on n1.person_id = f.partner1_id and n1.is_primary
     left join person_names n2 on n2.person_id = f.partner2_id and n2.is_primary
     left join places pl on pl.id = e.place_id`,
    [treeId, today, days],
  );

  const items: FamilyDateItem[] = [];
  for (const r of personRows) {
    if (APPROX.test(r.date_text ?? "")) continue;
    const years = r.ty - r.y;
    const name = (r.display_name as string | null) ?? "(sin nombre)";
    const person = { id: r.person_id as string, name };
    if (r.event_type === "DEAT") {
      if (years >= 0) items.push({ inDays: r.k, month: r.m, day: r.dd, kind: "muere", years, people: [person], place: r.place });
    } else if (r.is_living) {
      if (years > 0) items.push({ inDays: r.k, month: r.m, day: r.dd, kind: "cumple", years, people: [person], place: null });
    } else if (years >= 0) {
      items.push({ inDays: r.k, month: r.m, day: r.dd, kind: "nace", years, people: [person], place: r.place });
    }
  }
  for (const r of marrRows) {
    if (APPROX.test(r.date_text ?? "")) continue;
    const people = [
      r.partner1_id && r.n1 ? { id: r.partner1_id as string, name: r.n1 as string } : null,
      r.partner2_id && r.n2 ? { id: r.partner2_id as string, name: r.n2 as string } : null,
    ].filter((x): x is { id: string; name: string } => x !== null);
    const years = r.ty - r.y;
    if (people.length && years > 0) items.push({ inDays: r.k, month: r.m, day: r.dd, kind: "casan", years, people, place: r.place });
  }
  void year;
  // Primero los días más cercanos; en un mismo día, lo más antiguo primero (más años).
  return items.sort((a, b) => a.inDays - b.inDays || b.years - a.years);
}
