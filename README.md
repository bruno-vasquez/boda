# Lista de Invitados

Sistema simple para gestionar la lista de invitados entre Bruno y Maya, con sincronización en vivo entre dispositivos.

## Cómo funciona

- Frontend estático (HTML/CSS/JS, sin build) + **Firebase Firestore** como base de datos en tiempo real. Todo lo que añade, edita o borra un editor se ve al instante en el otro dispositivo.
- Al entrar, se elige **Bruno**, **Maya** o **Invitad@**:
  - **Bruno** y **Maya** piden contraseña. Si es correcta, quedan como editores: pueden añadir, editar y borrar invitados, y su nombre queda registrado en cada acción.
  - **Invitad@** no pide nada y entra en modo solo lectura: ve la lista y los filtros, pero no hay formulario para añadir ni botones de editar/borrar.
- Cada invitado tiene:
  - **Categoría**: Familia Maya, Familia Bruno, Amigos, Congre o Niños.
  - **Prioridad** (de menor a mayor): Invitado Prescindible, Prescindible, Invitado Ideal, Ideal que esté, Invitado Imprescindible, Imprescindible.
- Filtros por categoría (incluye un filtro agrupado "Familia" que junta Familia Maya + Familia Bruno, además de los específicos), por prioridad y búsqueda por nombre.
- **Historial de cambios**: panel con quién añadió, editó o eliminó a cada invitado y cuándo. Es de solo lectura (nadie puede alterarlo, ni siquiera borrando un invitado).
- El puntito junto a "Hola, ..." en la esquina indica si hay conexión con la base de datos (verde = conectado).

## Seguridad

- La contraseña de Bruno y Maya la valida **Firebase Authentication** (no un `if` en el código): existen dos cuentas fijas, `bruno@lista-invitados.local` y `maya@lista-invitados.local`, con la misma contraseña. El botón que tocas decide con cuál de las dos se intenta entrar.
- Las reglas de Firestore ([firestore.rules](firestore.rules)) son las que de verdad bloquean escrituras: solo esas dos cuentas pueden crear/editar/borrar en `invitados` y crear entradas en `historial`. Cualquier otra persona (incluido "Invitad@") solo puede leer, aunque intente llamar a la base de datos directamente sin pasar por la página.
- La lectura es pública (cualquiera con el link puede ver la lista, con o sin login) para mantener el login de "Invitad@" simple, sin contraseña.

## Proyecto Firebase

- Proyecto: `lista-invitados-bm` — dedicado solo a esto, separado del proyecto de Alabanza.
- Base de datos: Firestore Native, colecciones `invitados` e `historial`.
- Auth: Email/Password, con las dos cuentas fijas de Bruno y Maya.
- Consola: https://console.firebase.google.com/project/lista-invitados-bm/overview

### Configuración pendiente en Firebase Console

1. **Authentication → Sign-in method → Email/Password → Habilitar.**
2. Crear las 2 cuentas (Authentication → Users → Add user), o pedirle a Claude que las cree por CLI una vez habilitado el paso 1:
   - `bruno@lista-invitados.local`
   - `maya@lista-invitados.local`

Si alguna vez cambias las reglas de seguridad (`firestore.rules`), despliégalas con:
```
firebase deploy --only firestore:rules --project lista-invitados-bm
```

## Respaldo manual

Los botones **Exportar / Importar datos** al fondo de la página son solo un respaldo de emergencia (por ejemplo, antes de borrar algo importante). Ya no hacen falta para sincronizar entre dispositivos — eso ahora es automático.

## Uso local

Como usa módulos de JavaScript (`type="module"`), no puedes abrir `index.html` con doble clic (el navegador bloquea los `import` sobre `file://`). Necesitas un servidor estático simple:
```
python -m http.server 8080
```
y abrir `http://localhost:8080`.

## Deploy con GitHub Pages

1. Sube el proyecto a un repositorio en GitHub (incluye `js/firebase-config.js` — esas claves son públicas por diseño, la seguridad real la dan las reglas de Firestore, no ocultarlas).
2. En GitHub: **Settings → Pages → Source → Deploy from branch → main → / (root)**.
3. La app queda disponible en `https://<usuario>.github.io/<repo>/`.

Cada vez que quieras actualizar el sitio: `git add .`, `git commit`, `git push`.
