// Lo que dice la portada pública para la familia. Se edita aquí, a mano.
// Regla: solo antepasados fallecidos hace mucho; nada de personas vivas ni de datos de contacto.

export const PORTADA = {
  /** Fecha de la última vez que se tocó esta lista (texto libre). */
  actualizado: "21 de octubre de 2026",

  /** La ficha grande de la portada: un hallazgo contado en pocas líneas (sin personas vivas). */
  destacado: {
    tipo: "Hallazgo",
    nombre: "Dominga Bravo",
    lugar: "Registros de Maipo",
    frase: "La escribieron de tres maneras: «Domingo Bravo», «Dominga Urabo» y «Dominga Brabo».",
  },

  /** "Lo último que encontramos": cada entrada (ordenadas por el año del hecho; `cuando` es cuándo lo encontramos) es una historia corta. */
  hallazgos: [
    {
      anio: "1849",
      cuando: "Octubre 2026",
      titulo: "Pabla Araya, la madre de Juan",
      texto:
        "En el matrimonio de 1849 con Isidoro Balcázar, a Pabla (nacida hacia 1829) solo se le nombra a su madre, Anastacia. Su hijo Juan Balcázar Araya nació en Maipo en 1868. Seguimos buscando de dónde venía.",
    },
    {
      anio: "1888",
      cuando: "Octubre 2026",
      titulo: "Los padrinos de Manuel Zamora",
      texto:
        "Manuel Zamora Galdames nació en San Esteban en 1888. Sus padrinos fueron David Saavedra y Margarita Zamora, parientes de su papá: ese detalle ayudó a confirmar que estábamos siguiendo a la familia correcta.",
    },
    {
      anio: "1924",
      cuando: "Septiembre 2026",
      titulo: "La zapatería de Celedonio Morales",
      texto:
        "En 1924 saquearon la zapatería de Celedonio Segundo Morales Aravena, un hecho que según el acta llegó hasta una sesión del Senado. Años después fue regidor.",
    },
  ],

};
