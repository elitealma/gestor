# ProManager - Gestor de Proyectos

Gestor de proyectos moderno con diseño premium, dark mode y funcionalidad completa de gestión de proyectos y tareas.

## 🚀 Características

- ✅ Dashboard con estadísticas en tiempo real
- ✅ Gestión completa de proyectos (CRUD)
- ✅ Gestión de tareas con estados
- ✅ Búsqueda y filtros
- ✅ Persistencia local (localStorage)
- ✅ Diseño premium con glassmorphism
- ✅ Completamente responsive

## 📦 Despliegue con Docker

### Opción 1: Usando Docker Compose (Recomendado para Portainer)

1. **Subir archivos a tu VPS**:
   ```bash
   # Sube todos los archivos del proyecto a tu VPS
   scp -r * usuario@tu-vps:/ruta/al/proyecto
   ```

2. **En Portainer**:
   - Ve a **Stacks** → **Add stack**
   - Nombre: `promanager`
   - Build method: **Repository** o **Upload**
   - Carga el archivo `docker-compose.yml`
   - Haz clic en **Deploy the stack**

3. **Acceder a la aplicación**:
   ```
   http://tu-vps-ip:8080
   ```

### Opción 2: Usando Docker directamente

1. **Construir la imagen**:
   ```bash
   docker build -t promanager .
   ```

2. **Ejecutar el contenedor**:
   ```bash
   docker run -d -p 8080:80 --name promanager --restart unless-stopped promanager
   ```

### Opción 3: Desde Portainer con Git

1. En Portainer, ve a **Stacks** → **Add stack**
2. Sube tu código a un repositorio Git (GitHub, GitLab, etc.)
3. Selecciona **Repository** como método
4. Pega la URL del repositorio
5. Deploy

## 🔧 Configuración de Puerto

Por defecto, la aplicación se expone en el puerto **8080**. Para cambiar el puerto:

Edita `docker-compose.yml`:
```yaml
ports:
  - "TU_PUERTO:80"  # Cambia 8080 por el puerto que desees
```

## 🌐 Configurar Dominio (Opcional)

Si tienes un dominio, puedes configurar nginx como proxy inverso o usar Traefik con Portainer:

### Con Nginx Proxy Manager en Portainer:

1. Instala Nginx Proxy Manager desde Portainer
2. Agrega un nuevo Proxy Host:
   - Domain: `tudominio.com`
   - Forward Hostname/IP: `promanager`
   - Forward Port: `80`
3. Habilita SSL con Let's Encrypt

## 📝 Archivos del Proyecto

```
.
├── index.html          # Estructura HTML
├── styles.css          # Estilos y diseño
├── app.js             # Lógica de la aplicación
├── Dockerfile         # Configuración Docker
├── nginx.conf         # Configuración Nginx
├── docker-compose.yml # Orquestación Docker
└── README.md          # Este archivo
```

## 💾 Persistencia de Datos

**Importante**: La aplicación usa localStorage del navegador para guardar datos. Esto significa que:
- Los datos se guardan en el navegador de cada usuario
- Cada usuario tendrá sus propios proyectos
- Si se cambia de navegador o dispositivo, no verá los mismos datos

### Para agregar persistencia en el servidor:

Si deseas que los datos se guarden en el servidor (para todos los usuarios), necesitarías agregar:
1. Un backend (Node.js + Express, por ejemplo)
2. Una base de datos (MongoDB, PostgreSQL, etc.)
3. API REST para CRUD de proyectos/tareas

## 🔒 Seguridad

- El archivo `nginx.conf` incluye headers de seguridad básicos
- Para producción, considera usar HTTPS (certificado SSL)
- Configura un firewall en tu VPS
- Limita el acceso si es necesario (autenticación básica de nginx)

## 📱 Uso Local

Para probar localmente sin Docker:
```bash
# Simplemente abre index.html en tu navegador
```

## 🛠️ Soporte

Para cualquier problema o mejora, consulta la documentación de:
- [Docker](https://docs.docker.com/)
- [Portainer](https://docs.portainer.io/)
- [Nginx](https://nginx.org/en/docs/)

---

¡Disfruta gestionando tus proyectos! 🎉
