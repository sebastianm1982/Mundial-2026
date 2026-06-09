# Prode Mundial

App web para organizar un prode del Mundial.

## Funcionalidades

- Registro e inicio de sesión de usuarios.
- Fixture editable.
- Pronósticos por partido.
- Cierre automático del pronóstico cuando empieza el partido.
- Panel administrador para crear partidos y cargar resultados.
- Ranking automático.
- Puntaje:
  - Resultado exacto: 6 puntos.
  - Ganador o empate correcto: 3 puntos.
  - Error: 0 puntos.

## Requisitos

- Node.js 20 o superior.

## Instalación local

```bash
npm install
cp .env.example .env
npm start
```

Abrir:

```txt
http://localhost:3000
```

## Usuario administrador inicial

Por defecto, si no cambiás el `.env`:

```txt
Email: admin@prode.com
Contraseña: admin123
```

Cambialo en producción con estas variables:

```env
ADMIN_EMAIL=tu-email@dominio.com
ADMIN_PASSWORD=una-clave-segura
SESSION_SECRET=un-secreto-largo-y-random
```

## Subir a GitHub

```bash
git init
git add .
git commit -m "prode mundial inicial"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/prode-mundial.git
git push -u origin main
```

## Deploy en Render

1. Crear un repositorio en GitHub y subir este proyecto.
2. Entrar a Render y crear un **Web Service**.
3. Conectar el repositorio.
4. Configurar:

```txt
Build Command: npm install
Start Command: npm start
```

5. Agregar variables de entorno:

```txt
SESSION_SECRET=un-secreto-largo-y-random
ADMIN_EMAIL=tu-email@dominio.com
ADMIN_PASSWORD=una-clave-segura
```

Nota: esta versión usa SQLite local. En planes gratuitos o entornos efímeros, los datos pueden perderse si el servicio se reinicia sin disco persistente. Para producción real conviene agregar un disco persistente o migrar a PostgreSQL.

## Estructura

```txt
src/server.js        Rutas y servidor Express
src/db.js            Base de datos, migraciones, seed y cálculo de puntos
src/views/           Pantallas EJS
public/styles.css    Estilos
```
