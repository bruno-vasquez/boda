# Lista de Invitados

Sistema simple para gestionar la lista de invitados entre Bruno y Maya.

## Cómo funciona

- No usa servidor ni base de datos: es una página estática (HTML/CSS/JS) que guarda todo en el `localStorage` del navegador donde se abre.
- Al entrar, cada quien elige si es **Bruno** o **Maya**. Ese nombre queda registrado en cada invitado que se añade, edita o borra.
- Cada invitado tiene:
  - **Categoría**: Familia, Amigos o Congre.
  - **Prioridad**: Prescindible, Ideal que esté, Imprescindible.
- Hay filtros por categoría, prioridad y búsqueda por nombre.
- Hay un **Historial de cambios** con quién añadió, editó o eliminó a cada invitado y cuándo.

## Importante: sincronización entre dispositivos

Como no hay base de datos, los datos viven **solo en el navegador donde se usan**. Si Bruno y Maya abren la app desde dispositivos distintos, cada uno tendrá su propia copia — no se sincronizan solas.

Para mantenerlas iguales, usa los botones de **Respaldo** al fondo de la página:
- **Exportar datos**: descarga un archivo `.json` con la lista y el historial.
- **Importar datos**: carga un archivo `.json` exportado, reemplazando los datos del dispositivo actual.

La idea es exportar de vez en cuando y compartirse el archivo (por WhatsApp, por ejemplo) para que ambos tengan lo último.

## Uso local

Solo abre `index.html` en el navegador (doble clic, o arrástralo a una pestaña).

## Deploy con GitHub Pages

1. Crea un repositorio en GitHub (puede ser público o privado).
2. Sube este proyecto:
   ```
   git init
   git add .
   git commit -m "Lista de invitados inicial"
   git branch -M main
   git remote add origin <URL-del-repo>
   git push -u origin main
   ```
3. En GitHub: **Settings → Pages → Source → Deploy from branch → main → / (root)**.
4. La app quedará disponible en `https://<usuario>.github.io/<repo>/`.

Cada vez que quieras actualizar el sitio, solo haz `git add .`, `git commit` y `git push` de nuevo.
