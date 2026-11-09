-- La invitación puede traer a qué persona del árbol corresponde la cuenta:
-- quien la acepta entra ya vinculado, sin tener que buscarse.
alter table invitations add column person_id uuid references persons(id) on delete set null;
