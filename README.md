# Archivo VN – catálogo sencillo de novelas visuales

Stack: Node.js + Express, base de datos SQLite (un solo archivo) y páginas HTML/CSS/JS sin framework.

## Puesta en marcha (Windows, PowerShell)

1. Instala Node.js LTS (https://nodejs.org).
2. En esta carpeta:

   npm install express better-sqlite3 multer express-session dotenv
   Copy-Item .env.example .env
   notepad .env        # rellena ADMIN_PASSWORD y SESSION_SECRET
   npm start

3. Abre http://localhost:3000 (catálogo) y http://localhost:3000/admin.html (administración).

## Dónde se guarda todo

- data/catalog.db  -> base de datos
- uploads/         -> imágenes subidas
Haz copia de seguridad de ambas carpetas. No se suben a Git.
