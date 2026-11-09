import { describe, expect, it } from "vitest";
import { limitLiving } from "../privacy";
import type { TimelineEntry } from "../timeline";

const entry = (kind: string, extra: Record<string, unknown> = {}) =>
  ({ year: 1990, yearEnd: null, approx: false, sortKey: "1990-05-03", dateText: "3 de mayo de 1990", kind, tag: null, title: kind, place: "Buin, Chile", description: "algo", age: null, person: null, sources: [{ title: "x", url: "u" }], participants: [{ role: "r", name: "n", personId: null }], edit: { id: "1", research: null, form: {} }, ...extra }) as unknown as TimelineEntry;

const make = (isLiving: boolean) => ({
  isLiving,
  notes: "vive en la calle X",
  media: [{ id: 1 }],
  timeline: [entry("BIRT"), entry("OCCU"), entry("MARR"), entry("RESI")],
  familiesAsPartner: [{ id: "f", family_events: [{}] }],
});

describe("limitLiving", () => {
  it("al lector le deja de un vivo solo año de nacimiento y de matrimonio", () => {
    const d = limitLiving(make(true), false);
    expect(d.timeline.map((e) => e.kind)).toEqual(["BIRT", "MARR"]);
    expect(d.timeline[0]).toMatchObject({ dateText: "1990", place: null, description: null, sources: [], edit: null });
    expect(d.notes).toBe("");
    expect(d.media).toEqual([]);
    expect(d.familiesAsPartner[0].family_events).toBeNull();
  });
  it("quien edita lo ve todo", () => {
    const d = limitLiving(make(true), true);
    expect(d.timeline).toHaveLength(4);
    expect(d.notes).not.toBe("");
  });
  it("los fallecidos no se tocan", () => {
    expect(limitLiving(make(false), false).timeline).toHaveLength(4);
  });
});
