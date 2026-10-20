-- Comentario de un pendiente: qué hay que mirar al revisarlo ("ver la edad de los padres", "comparar con el acta civil").
-- Solo tiene sentido mientras el hecho está marcado (needs_review); al quitar el pendiente se borra.
alter table events add column if not exists review_note text;
