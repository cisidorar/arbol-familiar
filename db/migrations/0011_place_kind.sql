-- Clasifica los lugares: cementerio, iglesia, salud, educación, localidad u otro.
-- Sirve para ofrecer "todos los cementerios" al elegir dónde está sepultada una persona.
alter table places add column if not exists place_kind text;

update places set place_kind = 'cemetery'
 where place_kind is null
   and coalesce(normalized, raw_text) !~* '^\s*(cremad[oa]|cremaci)'
   and (
     coalesce(normalized, raw_text) ~* '(cementerio|cementario|camposanto|campo santo|mausoleo|crematorio|parque del recuerdo|parque santiago)'
     or id in (select place_id from events where event_type = 'BURI' and place_id is not null)
   );

update places set place_kind = 'church'
 where place_kind is null
   and coalesce(normalized, raw_text) ~* '(parroquia|iglesia|catedral|capilla|nuestra se[ñn]ora|inmaculada|san mart[ií]n de tours|bas[ií]lica)';

update places set place_kind = 'health'
 where place_kind is null
   and coalesce(normalized, raw_text) ~* '(hospital|cl[ií]nica|sanatorio|maternidad|posta)';

update places set place_kind = 'education'
 where place_kind is null
   and coalesce(normalized, raw_text) ~* '(escuela|colegio|universidad|liceo|instituto)';

update places set place_kind = case when comuna_code is not null then 'locality' else 'other' end
 where place_kind is null;

create index if not exists idx_places_kind on places(tree_id, place_kind);
