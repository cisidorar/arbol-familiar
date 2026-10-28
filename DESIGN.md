---
name: Archivo Zamora Balcázar
description: Archivo genealógico familiar, privado, legible para todas las edades, con aire de álbum del valle del Maipo hacia 1900 (teja, parra, adobe).
colors:
  tinta-de-maquina: "#1a1816"
  papel-de-ficha: "#f4f1ea"
  gris-de-grafito: "#4a4740"
  filo-de-papel: "#d6d2ca"
  sello-terracota: "#a8432a"
  teja: "#a8432a"
  trigo: "#d9a441"
  parra: "#3f5b34"
  burdeos: "#6e1f2e"
  adobe: "#f4e9d3"
  adobe-2: "#e9d8b6"
  azul-hombre: "#2f66b8"
  rosa-mujer: "#b03a62"
  rojo-aviso: "#b3261e"
  verde-listo: "#1f6b43"
  borde-de-campo: "#8f8a80"
  papel-nuevo: "#ffffff"
typography:
  titulo:
    fontFamily: "Special Elite, Courier New, Courier, monospace"
    fontSize: "clamp(2rem, 6vw, 2.75rem)"
    fontWeight: 400
    lineHeight: 1.12
  seccion:
    fontFamily: "Special Elite, Courier New, Courier, monospace"
    fontSize: "clamp(1.6rem, 4.5vw, 2rem)"
    fontWeight: 400
    lineHeight: 1.2
  nombre:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
  cuerpo:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.55
  apoyo:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  etiqueta:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.08em"
rounded:
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  pill: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-principal:
    backgroundColor: "{colors.teja}"
    textColor: "{colors.papel-nuevo}"
    typography: "{typography.cuerpo}"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "8px 28px"
  button-principal-hover:
    backgroundColor: "{colors.burdeos}"
  button-secundario:
    backgroundColor: "{colors.papel-nuevo}"
    textColor: "{colors.tinta-de-maquina}"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "8px 24px"
  button-secundario-hover:
    backgroundColor: "{colors.papel-de-ficha}"
  campo:
    backgroundColor: "{colors.papel-nuevo}"
    textColor: "{colors.tinta-de-maquina}"
    rounded: "{rounded.lg}"
    height: "48px"
    padding: "8px 14px"
  tarjeta-persona:
    backgroundColor: "{colors.papel-nuevo}"
    textColor: "{colors.tinta-de-maquina}"
    rounded: "{rounded.2xl}"
    padding: "12px 16px"
---

# Design System: Archivo Zamora Balcázar

## Identidad: "Álbum de la parra" (valle del Maipo, hacia 1900)

Toda la app (inicio, fichas, cementerios, mapa, pendientes, administración, portada y entrada) comparte esta identidad. El dibujo del árbol conserva sus colores de sexo (azul/rosa) y su propia tarjeta. Se lee como un álbum de familia del valle del Maipo (Buin, Paine, Chada): alero de tejas, paredes de adobe, parras, fotos con esquineros, sellos. Cercana, no de museo.

**Paleta (contrastes medidos, WCAG AA):**
- **Adobe** #f4e9d3: fondo (con motas burdeos al 6 %). Tinta sobre adobe 14,3:1.
- **Tinta** #1e1a17: texto.
- **Teja** #a8432a: color de acción. Botón principal, "Árbol". Adobe sobre teja 5,0:1.
- **Trigo** #d9a441: cinta del buscador, fechas de cumpleaños, cinta adhesiva. Tinta sobre trigo 7,7:1; nunca texto adobe sobre trigo.
- **Parra** #3f5b34: nacimientos, "De dónde vienen", puntos de lugar conocido. Adobe sobre parra 6,3:1.
- **Burdeos** #6e1f2e: fallecimientos, "Dónde descansan", tarjeta "Te tocó", esquineros. Adobe sobre burdeos 9,2:1.

**Reglas:**
- La teja es el único color de acción: un botón grande de teja por pantalla ("Ir al árbol"). Trigo, parra y burdeos solo categorizan y siempre con palabra o ícono (nunca solo color).
- Títulos de sección en **Zilla Slab** 700 (`.al-titulo`, `font-slab`); Special Elite solo en pies de foto, años y números de sello; Atkinson Hyperlegible en todo texto de lectura. Nunca slab ni máquina en párrafos.
- Escala extra en `/inicio`: 1.375rem (botón principal), 1.5rem (título de nota), 1.625rem (título de sello), 1.75rem (nombre en la foto); etiquetas de 1rem, no 0.875rem.
- Texto de 18 px (16 px de piso), botones de 48 px mínimo (el principal, 56 px). Foco: anillo de tinta de 3 px (blanco sobre fondos oscuros, clase `on-dark`).
- Decoración (parra SVG, tejas, esquineros, cinta) siempre `aria-hidden` y fuera del texto de lectura.
- Giros leves (±1°) solo en fotos, notas y fichas de fecha; con `prefers-reduced-motion` la ruleta no anima.
- Sombra permitida solo en la foto de "Te tocó" y la nota pegada; botones, campos y listas siguen planos.
- Componentes: `.alero` / `.alero-tejas` (franja de tejas), `.foto` (+ `.esq-a`, `.esq-b`), `.sello` (tarjeta con filete punteado), `.cinta`, `.album` (fondo).

**Aplicación en toda la app:**
- **Cabecera y barra del celular:** burdeos con texto blanco, pestaña activa adobe y borde de tejas colgando (no en el árbol flotante). Logo: fondo adobe con barra teja.
- **Botones (`ui.tsx`):** principal teja (hover burdeos), secundario blanco con borde de tinta (hover adobe-2), enlace subrayado con hover teja. Campos con borde de tinta al enfocar. Avisos de información en adobe-2 con ícono burdeos.
- **Portadas por sección:** "Dónde descansan" y la portada pública/entrada en burdeos; la franja "¿Tienes algo de la familia?" en parra. Fondos de página: adobe con motas.
- **Ficha de persona:** inicial en foto con esquineros (color según sexo, siempre con el parentesco dicho con palabras); hechos con año en sello redondo burdeos.
- **Mapa de orígenes:** la escala de comunas va de trigo claro a burdeos (1, 2, 3, 4 o más antepasados) y el lugar por confirmar con rayas teja; la cantidad siempre está escrita en el marcador y en la lista. Los nombres de las comunas con datos van siempre visibles.
- **Árbol:** fondo de álbum (adobe con motas) y alero de tejas bajo la cabecera, como en el resto de la app. Tarjeta de papel blanco con borde adobe, barra de acento por sexo y avatar tintado; nombre en Atkinson y fecha en Special Elite con las palabras de Inicio ("nació 1935", "falleció"). Si se sabe dónde está sepultado, una tercera línea con alfiler y el nombre corto del cementerio ("Parque de Auco"; el nombre completo va en la ficha); con ella el nombre se limita a 2 líneas. En el teléfono la cabecera es de dos filas: Volver y el zoom bajan a 132 px. Tarjetas de 250×104 px con nombre de 16 px y fecha de 14 px; los controles de la tarjeta (flechas 28 px, "+" y comprimir 24 px) tienen área táctil de 44 a 48 px. Tarjetas y controles se alcanzan con Tab (Enter o Espacio los activan) con anillo de tinta de 3 px. Botones de zoom con ícono SVG de tinta (`text-ink` explícito en la raíz: sin él heredan el texto claro del modo oscuro del sistema). Colores de la leyenda: hombre #3f7fcb, mujer #c44f72 (los de la tarjeta, no los azul/rosa de la guía). Los hilos son de tinta cálida (#7a6a55, 2,5 px; el de la línea hasta el centro, burdeos 3 px); cada ficha lleva por dentro un filete punteado burdeos, el mismo del sello postal de Inicio; y "Comprimir" es un círculo adobe con flecha de tinta, igual que las demás flechas. Las flechas de arriba y abajo son pastillas con su palabra ("Padres", "Hijos", "Hermanos", "Pareja"); las laterales siguen siendo círculos. El área táctil de los controles llega a 56 px a escala 1 para no bajar de 44 px en el teléfono (escala 0,8). La persona del centro lleva borde burdeos de 3 px y la pestaña "Centro". El sexo se lee también por la forma: la silueta de mujer lleva el pelo hasta los hombros y la tarjeta dice "Hombre" o "Mujer" a quien usa lector de pantalla (la leyenda muestra ambas siluetas). "Ver todo" nunca baja de 0,7 de escala (0,8 en el teléfono): si el árbol entero no cabe así, se centra en el tronco y avisa. En el teléfono, ayuda, "Volver a mí" y el zoom (− y +) van en una barra propia sobre la de secciones y el lienzo termina sobre ella, así nada se tapa; en escritorio van arriba a la derecha. El cuerpo de toda la app usa Atkinson Hyperlegible (antes caía en Arial). Escape cierra "Más", luego la ficha; al editar, pasa por la confirmación de descarte; el panel de edición va por encima del velo. "Ver todo" no baja de 0,8 de escala. La ficha muestra "Editar" y "Centrar el árbol" y deja el resto bajo "Más"; "Guardar cambios" está inactivo mientras no haya cambios; al abrir la ficha el foco entra en ella y vuelve a la tarjeta al cerrarla, y el enlace "Saltar al árbol" es lo primero que aparece con Tab. Al encuadrar (carga, "Volver a mí", abrir una rama) se reserva lugar para la cabecera con su alero, la pastilla que sube 36 px sobre cada tarjeta y la columna de zoom a la derecha; tras abrir una rama, la vista baja lo justo para que nada quede bajo el alero. La ficha de la persona (panel de la derecha) sigue la misma guía: fondo de álbum, nombre y sitio de sepultura en Zilla Slab, años y cifras en Special Elite, "Editar" como botón principal de teja y el resto como botones secundarios (`buttonClass` de `ui.tsx`), pestaña activa con subrayado burdeos, "Viva" en parra y "Fallecido" en burdeos, la marca de documento por revisar en teja, y texto de 16 px como mínimo; el formulario de edición (`PersonEditor.tsx`), el diálogo de agregar un familiar (`AddRelative.tsx`) y el de agregar un participante (`AddParticipant.tsx`) usan lo mismo: campos con borde de campo y foco de tinta, botones de `buttonClass`, "Guardar cambios" de teja. La tarjeta de la persona cuya ficha está abierta lleva un anillo de tinta de 3 px, y si el panel de la derecha la taparía la vista se corre lo justo para que quede a la vista (en el teléfono el panel ocupa todo el ancho y no se mueve nada). El botón "Volver a mí" (bajo el zoom, 48 px) trae a la persona de quien mira: si el árbol está centrado en otro la recentra, y si no, la vuelve a centrar a una escala que se lee. En el teléfono la vista se centra en la franja entre la cabecera y la barra de abajo, y al cargar procura mostrar de arriba abajo al centro, sus padres y sus abuelos. Si abrir una rama deja fuera de la vista a la persona central, el árbol se encuadra entero cuando cabe a escala legible (≥0,7); si no, aparece el aviso "Parte del árbol quedó fuera de la vista" con "Ver todo". Botones flotantes de 48 px: Volver, Ayuda y Zoom (+, −, ver todo). La marca de "documento por revisar" es teja.
- **Color `terra`** quedó igual a la teja (#a8432a) para que los enlaces antiguos cumplan AA.
- Esto reemplaza "El archivo del abuelo", "un solo acento terracota" y "botón negro principal". Special Elite queda para el logo, números, años y pies de foto.

## Overview

**Creative North Star: "El archivo del abuelo"**

Un cajón de documentos familiares: fichas mecanografiadas, papel crema, tinta de cinta y un sello de lacre terracota. La calidez viene del material, no de adornos. Todo lo que se lee y se toca está pensado para quien no es experto: letra grande, botones amplios, un solo camino principal por pantalla, mensajes en tono de conversación.

La densidad es baja y la jerarquía es obvia. La máquina de escribir se reserva para la voz del archivo (logo, títulos); el resto es Atkinson Hyperlegible, diseñada para distinguir letras parecidas. La accesibilidad no es una capa añadida: es la guía de estilo ("Un archivo que toda la familia pueda usar").

**Key Characteristics:**
- Un botón principal de teja por pantalla.
- Mínimo 48 px de alto en lo táctil, texto de 18 px (nunca menos de 16 px).
- Íconos siempre acompañados de su palabra.
- Sexo en el árbol por color de acento (azul/rosa), nunca solo por color: también barra y silueta.
- Plano y redondeado: píldoras y tarjetas de borde grueso; la sombra queda para el árbol y las fichas sueltas de la portada.

## Colors

Tinta cálida sobre papel envejecido, con un único acento terracota. Azul y rosa existen solo para distinguir sexo.

### Primary
- **Sello de lacre** (#c4572e): el único acento. Cifras destacadas, regla bajo fichas de apellido, hover de enlaces.

### Neutral
- **Tinta de máquina** (#1a1816): texto, botón principal, fondo de la portada.
- **Papel de ficha** (#f4f1ea): fondos suaves, avisos informativos, hover de secundarios.
- **Grafito** (#4a4740): texto de apoyo y hover del botón principal.
- **Filo de papel** (#d6d2ca): bordes de tarjetas y separadores.
- **Borde de campo** (#8f8a80): borde de campos de texto, con contraste suficiente.
- **Papel nuevo** (#ffffff): fondo de página y de tarjetas.

### Semantic
- **Azul hombre** (#2f66b8): hombres y también anillo de foco (3 px).
- **Rosa mujer** (#b03a62): mujeres.
- **Rojo de aviso** (#b3261e) y **Verde listo** (#1f6b43): errores y confirmaciones, siempre con ícono y palabra.

### Named Rules
**The One Action Color Rule.** La teja es el único color de acción; trigo, parra y burdeos solo categorizan o enmarcan, siempre con palabra o ícono.
**The Never Color Alone Rule.** Ningún estado ni sexo se comunica solo con color.

## Typography

**Display Font:** Zilla Slab (títulos) y Special Elite (logo, números, años, pies de foto)
**Body Font:** Atkinson Hyperlegible (con system-ui)

**Character:** Máquina de escribir para la voz del archivo, y una sans pensada para baja visión para todo lo demás.

### Hierarchy
- **Título** (400, clamp 2–2.75rem, 1.12): título de pantalla.
- **Sección** (400, clamp 1.6–2rem, 1.2): encabezados internos.
- **Nombre** (700, 1.25rem, 1.3): nombre de una persona.
- **Cuerpo** (400, 1.125rem, 1.55): texto corrido; líneas de hasta ~46rem.
- **Apoyo** (400, 1rem, 1.5, grafito): fechas, relaciones, ayudas.
- **Etiqueta** (700, 0.875rem, 0.08em, mayúsculas): rótulos pequeños.

El tamaño se escala con el control "A A A": todo en rem.

### Named Rules
**The Typewriter Voice Rule.** Special Elite solo en logo, años, números y pies de foto; los títulos van en Zilla Slab; nunca ninguna de las dos en texto de lectura.

## Layout

Una columna cómoda, sin cuadrículas densas. Contenedores de lectura de hasta ~46rem. Fila superior de 4,5rem con el logo siempre en el mismo lugar; relleno lateral 16/24/40 px según ancho. En teléfono hay una barra de secciones inferior (MobileTabBar) y la página reserva su espacio. El árbol ocupa toda la pantalla.

## Elevation & Depth

Plano por defecto. La profundidad se logra con bordes de 2 px y cambios de fondo, no con sombras. Excepciones: las tarjetas del árbol (sombra suave tintada de azul) y las fichas sueltas de la portada, ligeramente inclinadas (±1°) como papeles sobre una mesa.

### Named Rules
**The Flat Interface Rule.** Botones, campos y listas no llevan sombra.

## Shapes

Forma redondeada y generosa: píldoras (9999px) para botones y filtros, 16 px para tarjetas de persona, 12 px para avisos e iniciales, 8 px para campos. Las tarjetas del árbol usan 10 px con barra de acento de 6 px a la izquierda.

## Components

### Buttons
- **Principal:** píldora teja, texto blanco 18 px bold, 48 px de alto; hover a burdeos. Uno por pantalla.
- **Secundario:** píldora blanca con borde negro de 2 px; hover a adobe-2.
- **Enlace:** subrayado de 2 px; hover terracota.
- **Foco:** anillo azul de 3 px con separación de 2 px.

### Inputs / Fields
Etiqueta visible en negrita sobre el campo; 48 px de alto, borde de 2 px (#8f8a80) que pasa a azul en foco; error en rojo con "⚠" y mensaje en conversación.

### Tarjeta de persona
Toda la tarjeta es tocable: inicial en cuadrado redondeado (azul/rosa/papel), nombre, relación y años, y "Ver ficha →" subrayado. Borde de 2 px que pasa a negro en hover.

### Avisos
Caja suave con ícono circular y palabra: información, listo, atención.

### Selector segmentado
Píldora con borde, opciones de 44 px; la activa en burdeos.

### Tarjeta del árbol (signature)
Ficha con avatar circular blanco con silueta (niño/niña con forma propia), nombre en negrita 16 px, fecha en 14 px, fondo tintado por sexo y barra de acento izquierda; el tronco lleva un anillo del color de su acento. Líneas de conexión grises (#a3b0c2) con codo recto.

## Do's and Don'ts

### Do:
- **Do** usar un solo botón de teja principal por pantalla.
- **Do** mantener 48 px mínimo en todo lo tocable y texto de 18 px (16 px como piso).
- **Do** acompañar cada ícono con su palabra y cada color de estado con texto.
- **Do** escribir mensajes de conversación en español de Chile.

### Don't:
- **Don't** usar trigo, parra o burdeos como color de acción.
- **Don't** usar Special Elite para párrafos.
- **Don't** añadir sombras a botones, campos o listas.
- **Don't** reducir texto bajo 16 px fuera del árbol.

**Cementerios ("Dónde descansan"):** "Cómo llegar" solo aparece cuando se sabe la comuna y el lugar es un cementerio de verdad; si no, el texto dice "Todavía no sabemos dónde queda este lugar". La cremación no es un cementerio: sale de la lista y de los conteos, la persona dice "Fue cremado/a" y la hoja impresa la agrupa en "Cremados". En el detalle de un cementerio van primero el nombre, la comuna y "Cómo llegar"; la foto viene después y, si no hay, solo queda un botón "Agregar una foto del cementerio" para quienes pueden editar. La tumba tiene su propia línea en 18 px y negrita ("Tumba: Sector Quillay C20"); si falta, "aún no sabemos en qué parte".
