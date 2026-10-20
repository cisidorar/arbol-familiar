-- La marca «por revisar» también se puede poner en un hecho de la línea de vida
-- (por ejemplo, la fuente de un bautismo que solo se puede ver en persona en FamilySearch).
-- La persona queda marcada en el árbol si ella, o alguno de sus hechos, tiene la marca.
alter table events add column if not exists needs_review boolean not null default false;
create index if not exists idx_events_needs_review on events(tree_id) where needs_review;
