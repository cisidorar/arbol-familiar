-- Qué tipo de pendiente es un hecho marcado «por revisar». Por ahora hay uno solo:
-- 'familysearch_presencial' (hay que ir a verlo en persona a un centro de FamilySearch,
-- porque el documento no se puede ver en línea). Más adelante se pueden sumar otros.
-- events.needs_review sigue siendo la marca (true cuando hay un tipo).
alter table events add column if not exists review_kind text;
update events set review_kind = 'familysearch_presencial' where needs_review and review_kind is null;
