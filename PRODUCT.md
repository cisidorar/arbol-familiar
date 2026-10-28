# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Una familia extensa (primos, tíos, de varias edades), con muchas personas mayores y poco familiarizadas con la tecnología. Entran por invitación como lectores, editores o administradores. La mayoría explora el árbol, busca a un antepasado o dónde está enterrado; un grupo menor investiga, corrige y carga datos.

## Product Purpose

"Archivo Zamora Balcázar" es el archivo genealógico privado de la familia, construido a partir de un GEDCOM de MyHeritage. Permite ver el árbol, la ficha de cada persona con sus hechos y fuentes, editar los datos con historial de cambios, y llevar la investigación familiar. Éxito: que cualquier pariente encuentre a sus antepasados y sus lugares sin ayuda, y que lo investigado quede registrado y verificable.

## Positioning

Lo que un árbol genérico (MyHeritage) no copia: la guía de cementerios y sepulturas (dónde está enterrado cada antepasado, por región y cementerio) y el mapa de orígenes de la familia. Es un archivo propio y privado, no una plataforma pública.

## Operating Context

- Acceso solo por invitación; sin registro libre. Nada se ve sin sesión; los enlaces de invitación los envía la administradora por WhatsApp o correo (la app no envía correos).
- Datos que vienen de GEDCOM más hechos investigados (`data/investigacion.json`) con fuente, enlace y cita textual.
- Portada pública mínima: solo antepasados fallecidos hace mucho y cifras generales.
- Secciones existentes: árbol, fichas, búsqueda, cementerios, mapa, pendientes, administración.

## Capabilities and Constraints

- Stack: Next.js (versión con cambios; leer `node_modules/next/dist/docs/`), React, Tailwind 4, Postgres (Supabase + Vercel al publicar), árbol con family-chart.
- Roles: lector, editor, administrador. Historial de cada cambio.
- Todo el texto en español de Chile.
- Aún no se editan desde la app matrimonios ni vínculos familiares.
- Sin definir: requisitos formales de accesibilidad (ver abajo).

## Brand Commitments

Nombre: Archivo Zamora Balcázar. Tono cercano, de familia.

## Evidence on Hand

Archivo real `data/zamora-balcazar.ged`, 162 fotos de MyHeritage con enlaces que vencen (27 sep 2026 en el export usado), `data/investigacion.json`. No inventar personas, fuentes ni cifras.

## Product Principles

- Privado y familiar: nada público más allá de la portada acotada.
- Entendible para quien no es técnico: lenguaje simple, sin jerga.
- Lo verificable manda: cada dato investigado lleva su fuente.
- Los lugares (cementerios, orígenes) son parte central, no un extra.

## Accessibility & Inclusion

Inferido, no confirmado por la usuaria: dado que muchos usuarios son mayores, priorizar legibilidad, contraste y objetivos táctiles amplios. Confirmar el estándar exacto si importa.
