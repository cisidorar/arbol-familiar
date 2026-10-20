// Las fotos de los cementerios las sube la familia (se guardan en la base de datos).
// Esta es la dirección con la que se pide una foto ya subida; "v" cambia cuando se reemplaza
// para que el navegador no muestre la anterior.
export const uploadedPhotoUrl = (key: string, v: string | number) => `/api/cementerios/foto?k=${encodeURIComponent(key)}&v=${v}`;
