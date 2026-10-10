-- Fecha tentativa del nacimiento de un hijo/a, anotada en la ficha de sus
-- padres (en el vínculo familia–hijo) sin tocar la ficha del hijo/a. Texto en
-- sintaxis GEDCOM ("ABT 1885") y su fecha interpretada.
alter table family_children
  add column approx_birth_text text,
  add column approx_birth_from date;
