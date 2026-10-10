-- Cada usuario puede quedar vinculado a su propia persona del árbol
-- ("esta soy yo"): el árbol se abre centrado en ella.
alter table users add column person_id uuid references persons(id) on delete set null;
