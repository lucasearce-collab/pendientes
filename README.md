# Pendientes — tu mente, liberada

App de gestión de tareas con 3 áreas (Trabajo, Vida Personal, Plan de Vida).
Diseño responsivo: funciona en celu y Mac desde el navegador.

---

## Cómo publicar (paso a paso)

### 1. Crear cuenta en GitHub
- Entrá a https://github.com y hacé click en "Sign up"
- Completá email, contraseña y username
- Verificá el email

### 2. Crear un repositorio
- En GitHub, click en el "+" arriba a la derecha → "New repository"
- Nombre: `pendientes`
- Dejalo en Public
- Click "Create repository"

### 3. Subir los archivos
La forma más simple es arrastrar los archivos directamente en GitHub:
- Abrí el repositorio recién creado
- Arrastrá todos los archivos de esta carpeta al navegador
- Click "Commit changes"

O si tenés git instalado en la Mac:
```bash
cd pendientes
git init
git add .
git commit -m "primera versión"
git remote add origin https://github.com/TU_USUARIO/pendientes.git
git push -u origin main
```

### 4. Publicar en Vercel
- Entrá a https://vercel.com y hacé click en "Sign up with GitHub"
- Una vez dentro: "Add New Project"
- Seleccioná el repositorio `pendientes`
- Vercel detecta automáticamente que es Vite/React
- Click "Deploy"
- En 1-2 minutos tenés una URL tipo `pendientes-tuusuario.vercel.app`

### 5. (Opcional) Instalar como app en el celu
- Abrí la URL en Safari (iPhone) o Chrome (Android)
- En Safari: compartir → "Agregar a pantalla de inicio"
- Queda como ícono de app, sin barra del navegador

---

## Notas técnicas
- Los datos se guardan en localStorage del navegador (por dispositivo)
- Sin base de datos ni cuenta necesaria
- Para sincronizar entre Mac y celu en el futuro, se puede agregar un backend

## Para correr localmente
```bash
npm install
npm run dev
```
