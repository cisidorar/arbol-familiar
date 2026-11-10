-- Teoría: la filiación de una persona (de quiénes es hija o hijo) todavía no está probada.
-- Quien está arriba de ese vínculo se ve en otro color en el árbol (ver getFamilyChartData).
alter table persons add column if not exists parents_theory boolean not null default false;
alter table persons add column if not exists theory_note text;
