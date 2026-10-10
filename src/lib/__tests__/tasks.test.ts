import { describe, expect, it } from "vitest";
import {
  filterTasks,
  groupByVenue,
  isClosed,
  openByVenue,
  openCount,
  progress,
  sortTasks,
  validateTask,
  VENUES,
  type Task,
} from "../tasks";

const task = (o: Partial<Task>): Task => ({
  id: "1", personId: null, personName: null, title: "t", venue: "otro", status: "open", askText: null,
  reference: null, sourceUrl: null, hypothesis: null, result: null, createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z", ...o,
});

describe("validateTask", () => {
  it("exige título y lugar", () => {
    const v = validateTask({});
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errors)).toEqual(expect.arrayContaining(["title", "venue"]));
  });
  it("acepta un pendiente completo y limpia los textos", () => {
    const v = validateTask({ title: "  Pedir acta  ", venue: "registro_civil_linea", askText: " x " });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.title).toBe("Pedir acta");
      expect(v.value.status).toBe("open");
      expect(v.value.askText).toBe("x");
    }
  });
  it("rechaza un lugar desconocido", () => {
    expect(validateTask({ title: "a", venue: "luna" }).ok).toBe(false);
  });
});

describe("agrupar y contar", () => {
  const list = [
    task({ id: "a", venue: "familia", status: "resolved" }),
    task({ id: "b", venue: "familia", status: "open" }),
    task({ id: "c", venue: "cementerio", status: "dropped" }),
  ];
  it("cuenta solo los abiertos", () => expect(openCount(list)).toBe(1));
  it("agrupa por lugar y deja los abiertos primero", () => {
    const g = groupByVenue(sortTasks(list));
    const familia = g.find((x) => x.venue === "familia");
    expect(familia?.tasks.map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("filtrar, contar por lugar y avance", () => {
  const list = [
    task({ id: "a", venue: "familia", status: "resolved", title: "Papeles de Juana" }),
    task({ id: "b", venue: "familia", status: "open", title: "Llegada a Santiago", personName: "María del Carmen Ruz" }),
    task({ id: "c", venue: "cementerio", status: "dropped", title: "Sepultura" }),
    task({ id: "d", venue: "registro_civil_oficina", status: "in_progress", title: "Copia íntegra", askText: "Nacimiento en Romeral" }),
  ];
  const all = { venue: "all", query: "", showClosed: false } as const;

  it("por defecto esconde los cerrados", () => {
    expect(filterTasks(list, all).map((t) => t.id)).toEqual(["b", "d"]);
    expect(filterTasks(list, { ...all, showClosed: true })).toHaveLength(4);
  });
  it("filtra por lugar", () => {
    expect(filterTasks(list, { ...all, venue: "familia" }).map((t) => t.id)).toEqual(["b"]);
  });
  it("busca sin tildes ni mayúsculas, en la persona y en los detalles", () => {
    expect(filterTasks(list, { ...all, query: "maria ruz" }).map((t) => t.id)).toEqual(["b"]);
    expect(filterTasks(list, { ...all, query: "ROMERAL" }).map((t) => t.id)).toEqual(["d"]);
    expect(filterTasks(list, { ...all, query: "nada" })).toEqual([]);
  });
  it("cuenta los abiertos de cada lugar", () => {
    const counts = openByVenue(list);
    expect(counts.get("familia")).toBe(1);
    expect(counts.get("cementerio")).toBeUndefined();
  });
  it("calcula el avance", () => {
    expect(progress(list)).toEqual({ closed: 2, total: 4, percent: 50 });
    expect(progress([])).toEqual({ closed: 0, total: 0, percent: 0 });
    expect(isClosed("in_progress")).toBe(false);
  });
  it("cada lugar tiene un nombre corto para los filtros", () => {
    expect(VENUES.every((v) => v.short.length > 0 && v.short.length <= 28)).toBe(true);
  });
});
