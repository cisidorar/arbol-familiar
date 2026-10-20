-- Se quita la lista de «Pendientes de investigación» (página, API y tabla, con sus datos)
-- y se reemplaza por una marca simple en cada persona: «hay que revisar un documento».
-- Sirve para anotar, por ejemplo, que falta mirar en FamilySearch el acta de bautismo,
-- de matrimonio o de defunción. La marca se ve en la ficha y en la tarjeta del árbol.
--
-- OJO: esto borra para siempre los pendientes que había (tabla research_tasks).
-- Lo que se conserva de la migración 0009: las columnas comuna_code / region_code de places.

drop table if exists research_tasks;

alter table persons
  add column if not exists needs_review boolean not null default false,
  add column if not exists review_note  text;

-- Para listar rápido a quienes tienen una revisión pendiente.
create index if not exists idx_persons_needs_review on persons(tree_id) where needs_review;
