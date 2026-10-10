# Archivo Zamora Balcázar

App de árbol genealógico familiar, hecha a partir de un GEDCOM exportado de
MyHeritage. Corre local hoy; está preparada para publicarse después en
Supabase + Vercel sin cambiar el código (ver el plan completo en el
documento del proyecto).

## Qué incluye esta primera versión (fases 0–2 del plan)

- Parser GEDCOM 5.5.1 propio, con 16 pruebas contra el archivo real de la
  familia (`src/lib/gedcom`, `npm test`).
- Esquema SQL versionado para Postgres (`db/migrations/0001_init.sql`):
  personas, familias, hechos, lugares, fotos, fuentes y citas.
- Script de importación idempotente: se puede volver a correr sobre el
  mismo archivo sin duplicar nada (usa el `_UID` de MyHeritage).
- Vista de árbol interactiva (family-chart), ficha de persona con sus
  hechos y familia, y búsqueda por nombre que ignora tildes.

- Login propio (usuarios y contraseñas en la misma base), acceso solo por
  invitación con roles, y edición de cada persona desde su ficha con
  historial de cambios (ver "Usuarios, acceso y edición").

Lo que falta: editar matrimonios y vínculos familiares, exportar GEDCOM,
panel de calidad de datos, y publicar en Supabase + Vercel.

## Requisitos

- Node.js 20+ y npm.
- Postgres 16, de cualquiera de estas dos formas:
  - **Supabase CLI** (recomendado, es lo que se usará también en producción):
    `supabase start` levanta Postgres en `localhost:54322` (necesita Docker
    o [OrbStack](https://orbstack.dev)).
  - **Postgres instalado directo**, como se usó para armar esta versión:
    `brew install postgresql@16` en macOS.

## Cómo correrla

```bash
npm install
cp .env.example .env.local   # ajusta DATABASE_URL a tu Postgres
npm run db:migrate           # aplica las migraciones que falten (db/migrations)
npm run db:import -- data/zamora-balcazar.ged "Familia Zamora Balcázar"
npm run usuario -- crear-admin tu@correo.cl "Tu Nombre"   # tu cuenta; pide la contraseña
npm run dev                  # abre http://localhost:3000 y entra con esa cuenta
```

`npm run db:migrate` recuerda qué migraciones ya corrieron, así que se puede
correr siempre: solo aplica las nuevas.

`npm run db:import` se puede volver a correr cuando reexportes un GEDCOM
más nuevo de MyHeritage: actualiza a las personas existentes por su `_UID`
en vez de duplicarlas.

## Usuarios, acceso y edición

El archivo es privado: sin iniciar sesión no se ve nada (ni el árbol ni las
fichas ni la API). Nadie puede registrarse por su cuenta.

**Roles**

| Rol | Puede |
| --- | --- |
| Lector | Ver el árbol y las fichas. |
| Editor | Lo anterior, y editar la información de las personas. |
| Administrador | Lo anterior, invitar gente, cambiar roles, quitar accesos y ver el historial. |

**Invitar a alguien** (menú de tu inicial, arriba a la derecha → "Usuarios e
historial"): escribes su correo, eliges el rol y la app te da un enlace. Se
lo mandas tú (WhatsApp, correo); la app no envía correos. El enlace sirve
una sola vez, vence en 14 días y solo se muestra al crearlo. Con él la
persona elige su nombre y su contraseña.

**Contraseña olvidada**: en esa misma pantalla, "Enlace para nueva
contraseña" junto a la persona (vence en 48 horas). Si la que la olvidó es la
única administradora:

```bash
npm run usuario -- clave tu@correo.cl    # pone una contraseña nueva
npm run usuario -- lista                 # quién tiene acceso y con qué rol
```

**Quién eres en el árbol**: `npm run usuario -- vincular tu@correo.cl "Tu
nombre en el árbol"` une tu cuenta con tu persona; desde entonces el árbol se
abre centrado en ti.

**Editar una persona**: en su ficha, el botón **Editar** abre un formulario
con todo lo que la ficha tiene: los datos de la persona (nombres, apellidos,
sexo, viva/fallecida, notas) y un recuadro por cada hecho, ya llenos. Se
corrige lo que haga falta, se agregan hechos ("Agregar un hecho": nacimiento,
bautismo, defunción, sepultura, residencia, trabajo, estudios, nacionalidad u
otro) o se quitan ("Quitar", con "Deshacer" mientras no se guarde), y un solo
**Guardar cambios** lo guarda todo junto: o entra todo o no entra nada.
"Cancelar" (o la ✕) sale sin guardar y pregunta antes si había cambios. La
fecha se escribe como se dice: `5 de mayo de 1891`, `1891`, `c. 1910`,
`1944-1947`, `antes de 1900`, `década de 1920`. Cada hecho puede llevar su
fuente (enlace, qué es y cita textual).

Los hechos de `data/investigacion.json` también se editan ahí. Al guardar uno
cambiado pasa a la base como un hecho normal y el del archivo deja de
mostrarse para esa persona (queda anotado en la tabla `research_overrides`;
el archivo no se toca). La excepción son los que nombran a otra persona
(`"con"`): esos se siguen cambiando en el archivo.

Todavía no se editan desde la app: matrimonios y demás hechos de pareja, y
quién es hijo o pareja de quién. El formulario los lista al final como "No se
cambian desde aquí".

**Historial**: cada cambio queda registrado con quién lo hizo, cuándo, qué
había antes y qué quedó (pantalla de administración).

**Editar y reimportar**: una persona editada en la app queda marcada y
`npm run db:import` ya no la toca (ni sus datos, ni sus nombres, ni sus
hechos); el reporte de la importación lista a quiénes dejó como estaban. Sus
vínculos familiares sí se siguen leyendo del GEDCOM. Es decir: desde que
editas a alguien acá, lo que cambies de esa persona en MyHeritage no entra.

**Seguridad, en corto**: las contraseñas se guardan con hash (scrypt), nunca
en claro; de las sesiones y de los enlaces de invitación la base solo guarda
el hash; tras 8 contraseñas malas seguidas la cuenta se bloquea 15 minutos;
cada ruta que entrega o guarda datos comprueba la sesión y el rol en el
servidor.

## Hechos investigados y sus fuentes

Lo que se encuentra fuera de MyHeritage (prensa, actas del Congreso,
decretos) se anota en `data/investigacion.json`. La ficha lo muestra
mezclado con los hechos del GEDCOM, con el enlace a cada fuente. No hace
falta reimportar: basta guardar el archivo y volver a abrir la ficha.

```json
{
  "personas": [
    {
      "uid": "6AAEB7FEC35355F746C510AE2B4953A0",
      "nombre": "Celedonio Segundo Morales Aravena",
      "hechos": [
        {
          "fecha": "1924",
          "etiqueta": "Comercio y política",
          "texto": "Su zapatería es saqueada durante los disturbios electorales.",
          "lugar": "Curicó",
          "reemplaza": "ocupación 1924",
          "fuentes": [
            { "titulo": "Senado, sesión del 30 de julio de 1924", "url": "https://…", "cita": "…" }
          ]
        }
      ]
    }
  ]
}
```

Cada hecho:

| Campo | Qué es |
| --- | --- |
| `texto` | La frase que se muestra. Es lo único obligatorio. |
| `fecha` | Como en una cronología: `1924`, `c. 1910`, `1944-1947`, `desde 1911`, `antes de 1900`, `década de 1920`, `30 de julio de 1924`. Sin fecha, el hecho va al final. |
| `etiqueta` | La categoría chica sobre la frase: "Trabajo", "Vida pública", "Familia"… Texto libre. |
| `lugar` | Opcional. |
| `fuentes` | Lista de enlaces. Cada una con `url` y, si quieres, `titulo` y `cita` (el pasaje textual). |
| `reemplaza` | Oculta el hecho del GEDCOM que este cuenta mejor: `"ocupación 1924"`, `"matrimonio"`, `"elección 1938"`. |
| `con` | `uid` de otra persona del árbol; se muestra con un enlace a su ficha. |
| `enAmbos` | `true` para que el hecho aparezca también en la ficha de la persona de `con`. |

```bash
npm run investigacion                      # revisa el archivo contra el árbol
npm run investigacion -- buscar morales    # muestra el uid de una persona
```

## Pruebas

```bash
npm test
```

Corre el parser GEDCOM contra `data/zamora-balcazar.ged` (tu archivo real)
y verifica conteos, fechas, fotos, citas y casos raros (personas sin
nombre, apellidos compuestos, etc.).
También prueba la navegación del árbol, la línea de tiempo, los hechos
investigados, y del login y la edición: contraseñas, roles, validación de lo
que llega de los formularios y el texto del historial.

## Fotos: lo urgente

Las 162 fotos del GEDCOM son enlaces a MyHeritage con fecha de vencimiento
(27 sep 2026 en el export usado). El importador las registra en la tabla
`media` con su URL original, pero **no las descarga**. Antes de que esos
enlaces dejen de funcionar: exportar de nuevo desde MyHeritage y escribir
un script que descargue cada `original_url` a `storage_path` (fase 0/3 del
plan).

## Estructura

```
src/lib/gedcom/      parser GEDCOM (tokenizer, fechas, mapeo a dominio)
src/lib/data/tree.ts consultas a Postgres para la vista de árbol/ficha
src/lib/timeline.ts  cómo se titula, etiqueta y ordena cada hecho de la ficha
src/lib/research.ts  hechos investigados (data/investigacion.json)
src/lib/auth/        contraseñas, tokens, roles y sesión
src/lib/edit.ts      qué se puede editar y cómo se valida
src/lib/data/edit.ts guardar cambios (con historial) · users.ts: usuarios e invitaciones
src/proxy.ts         sin cookie de sesión no se pasa del login
src/app/              páginas, rutas API y acciones (Next.js App Router)
db/migrations/        esquema SQL versionado
scripts/migrate.ts        aplica las migraciones que falten
scripts/usuarios.ts       primer administrador y contraseñas desde la terminal
scripts/import-gedcom.ts  importador idempotente
scripts/investigacion.ts  revisa data/investigacion.json y busca uids
data/                  tu GEDCOM real (usado también como fixture de pruebas)
```
