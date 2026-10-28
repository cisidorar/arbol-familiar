---
name: Archivo Zamora Balcázar
description: Archivo genealógico familiar, privado, legible para todas las edades, con aire de ficha mecanografiada.
colors:
  tinta-de-maquina: "#1a1816"
  papel-de-ficha: "#f4f1ea"
  gris-de-grafito: "#4a4740"
  filo-de-papel: "#d6d2ca"
  sello-terracota: "#c4572e"
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
    backgroundColor: "{colors.tinta-de-maquina}"
    textColor: "{colors.papel-nuevo}"
    typography: "{typography.cuerpo}"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "8px 28px"
  button-principal-hover:
    backgroundColor: "{colors.gris-de-grafito}"
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

## Overview

**Creative North Star: "El archivo del abuelo"**

Un cajón de documentos familiares: fichas mecanografiadas, papel crema, tinta de cinta y un sello de lacre terracota. La calidez viene del material, no de adornos. Todo lo que se lee y se toca está pensado para quien no es experto: letra grande, botones amplios, un solo camino principal por pantalla, mensajes en tono de conversación.

La densidad es baja y la jerarquía es obvia. La máquina de escribir se reserva para la voz del archivo (logo, títulos); el resto es Atkinson Hyperlegible, diseñada para distinguir letras parecidas. La accesibilidad no es una capa añadida: es la guía de estilo ("Un archivo que toda la familia pueda usar").

**Key Characteristics:**
- Un botón negro principal por pantalla.
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
**The One Seal Rule.** El terracota es el único acento; no se suman otros.
**The Never Color Alone Rule.** Ningún estado ni sexo se comunica solo con color.

## Typography

**Display Font:** Special Elite (con Courier New, monospace)
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
**The Typewriter Voice Rule.** Special Elite solo en logo, títulos y cifras destacadas; nunca en texto de lectura.

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
- **Principal:** píldora negra, texto blanco 18 px bold, 48 px de alto; hover a grafito. Uno por pantalla.
- **Secundario:** píldora blanca con borde negro de 2 px; hover a papel.
- **Enlace:** subrayado de 2 px; hover terracota.
- **Foco:** anillo azul de 3 px con separación de 2 px.

### Inputs / Fields
Etiqueta visible en negrita sobre el campo; 48 px de alto, borde de 2 px (#8f8a80) que pasa a azul en foco; error en rojo con "⚠" y mensaje en conversación.

### Tarjeta de persona
Toda la tarjeta es tocable: inicial en cuadrado redondeado (azul/rosa/papel), nombre, relación y años, y "Ver ficha →" subrayado. Borde de 2 px que pasa a negro en hover.

### Avisos
Caja suave con ícono circular y palabra: información, listo, atención.

### Selector segmentado
Píldora con borde, opciones de 44 px; la activa en negro.

### Tarjeta del árbol (signature)
Ficha con avatar circular blanco con silueta (niño/niña con forma propia), nombre en negrita 14 px, fecha en 11,5 px, fondo tintado por sexo y barra de acento izquierda; el tronco lleva un anillo del color de su acento. Líneas de conexión grises (#a3b0c2) con codo recto.

## Do's and Don'ts

### Do:
- **Do** usar un solo botón negro principal por pantalla.
- **Do** mantener 48 px mínimo en todo lo tocable y texto de 18 px (16 px como piso).
- **Do** acompañar cada ícono con su palabra y cada color de estado con texto.
- **Do** escribir mensajes de conversación en español de Chile.

### Don't:
- **Don't** introducir un segundo color de acento.
- **Don't** usar Special Elite para párrafos.
- **Don't** añadir sombras a botones, campos o listas.
- **Don't** reducir texto bajo 16 px fuera del árbol.
