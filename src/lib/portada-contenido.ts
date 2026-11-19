// Lo que dice la portada pública para la familia. Se edita aquí, a mano.
// Regla: solo antepasados fallecidos hace mucho; nada de personas vivas ni de datos de contacto.

export const PORTADA = {
  /** Fecha de la última vez que se tocó esta lista (texto libre). */
  actualizado: "19 de noviembre de 2026",

  /**
   * La ficha grande de la portada: un hallazgo contado en pocas líneas (sin personas vivas). Se muestra la primera
   * cuyas `personas` no sean teoría en el árbol; las demás quedan de reemplazo.
   */
  destacados: [
    {
      tipo: "Hallazgo",
      nombre: "Roque Galdames",
      lugar: "Aconcagua, 1664",
      frase: "Capitán del Real Ejército, se casó en 1664. Todavía discutimos si fue en Putaendo o en Santa Rosa de los Andes.",
      personas: ["Roque Galdames González"],
    },
    {
      tipo: "Hallazgo",
      nombre: "Pabla Araya",
      lugar: "Buin, 1849",
      frase: "Se casó con Isidoro Balcázar en 1849. En el acta solo aparece el nombre de su madre, Anastacia: seguimos buscando de dónde venía.",
      personas: ["Pabla Araya Zuñiga"],
    },
  ],

  /**
   * "Lo último que encontramos": cada entrada (las más recientes primero; `cuando` es cuándo lo encontramos) es una
   * historia corta. `personas` nombra a quienes trata, tal como están en el árbol: si alguna es teoría, la entrada no se
   * muestra hasta que se confirme.
   */
  hallazgos: [
    {
      anio: "1913",
      cuando: "Noviembre 2026",
      titulo: "Juan Balcázar, lejos de los suyos",
      personas: ["Juan Balcazar Araya"],
      texto:
        "Juan Balcázar Araya, hijo de Pabla Araya, murió en Santiago el 27 de agosto de 1913, a los 45 años, de neumonía. El permiso de sepultura lo dice natural de Buin. Lo sepultaron en un nicho perpetuo de un cementerio católico de Santiago, mientras sus padres, su esposa y sus hijas descansan en el cementerio parroquial de Buin. Falta confirmar en cuál cementerio de Santiago está.",
    },
    {
      anio: "1896",
      cuando: "Noviembre 2026",
      titulo: "Rosa Elvira y su madre sin nombre",
      personas: ["Rosa Elvira Canelo Frez"],
      texto:
        "La inscripción civil de nacimiento de Rosa Elvira Canelo, del 2 de marzo de 1896, no declara quién era su madre. Su bautizo, diez días después, dice que era hija de José Canelo y Petronila Montesino. Otras actas de 1906 y 1915 siguen los pasos de Petronila, y de a poco se arma la historia de esa familia en Viña del Mar.",
    },
    {
      anio: "1664",
      cuando: "Noviembre 2026",
      titulo: "Un capitán de 1664",
      personas: ["Roque Galdames González", "Ana Agustina de Sylva y Salamanca", "Bartola Galdames Ibaceta"],
      texto:
        "Roque Galdames González, capitán del Real Ejército, se casó el 2 de noviembre de 1664 con Agustina de Silva y Salamanca. Fue el abuelo de Bartola Galdames, la del testamento. Una página lo ubica en Putaendo y el índice de FamilySearch dice Santa Rosa de los Andes: falta mirar el libro para saber dónde fue.",
    },
    {
      anio: "1748",
      cuando: "Noviembre 2026",
      titulo: "El testamento de Bartola Galdames",
      personas: ["Bartola Galdames Ibaceta", "Andrés Lobo"],
      texto:
        "Bartola Galdames Ibaceta nació en Santa Rosa de los Andes en 1704. En 1747 su marido le dio poder para testar y en 1748 hizo su testamento; fue albacea y tutora de sus hijos menores. Su hija Isabel fue la madre de Andrés Lobo, así que Bartola es abuela de un antepasado de la familia en San Felipe. Los datos vienen del árbol de FamilySearch y falta confirmarlos con los documentos.",
    },
    {
      anio: "1764",
      cuando: "Noviembre 2026",
      titulo: "Dos familias grandes de San Felipe",
      personas: ["Norberto Lobo", "Isabel Muñoz", "Francisco Ahumada", "Narcisa Herrera", "Andrés Lobo"],
      texto:
        "Norberto Lobo e Isabel Muñoz se casaron en San Felipe en 1764 y tuvieron diez hijos. Francisco Ahumada y Narcisa Herrera se casaron allí en 1766 y tuvieron doce. Dos de esos hijos, Andrés Lobo y Ventura Ahumada, bautizados en 1781, se casaron en 1805. Los datos vienen del árbol de FamilySearch y falta confirmarlos con las actas.",
    },
    {
      anio: "1849",
      cuando: "Octubre 2026",
      titulo: "Pabla Araya, la madre de Juan",
      personas: ["Pabla Araya Zuñiga"],
      texto:
        "En el matrimonio de 1849 con Isidoro Balcázar, a Pabla (nacida hacia 1829) solo se le nombra a su madre, Anastacia. Su hijo Juan Balcázar Araya nació en Maipo en 1868. Seguimos buscando de dónde venía.",
    },
    {
      anio: "1888",
      cuando: "Octubre 2026",
      titulo: "Los padrinos de Manuel Zamora",
      personas: [],
      texto:
        "Manuel Zamora Galdames nació en San Esteban en 1888. Sus padrinos fueron David Saavedra y Margarita Zamora, parientes de su papá: ese detalle ayudó a confirmar que estábamos siguiendo a la familia correcta.",
    },
  ],

};
