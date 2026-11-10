-- Invitaciones por correo: se guarda si el correo salió (o por qué falló), si la
-- persona abrió el enlace y si alguien lo anuló. Antes anular borraba la fila;
-- ahora queda en el historial con revoked_at.
alter table invitations
  add column if not exists sent_at    timestamptz,
  add column if not exists send_error text,
  add column if not exists opened_at  timestamptz,
  add column if not exists revoked_at timestamptz;
