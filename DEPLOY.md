# 🚀 Guía Rápida: Subir Proyecto a GitHub y Desplegar en Portainer

## Paso 1: Subir a GitHub

Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
# Inicializar Git (si no está inicializado)
git init

# Agregar todos los archivos
git add .

# Hacer el primer commit
git commit -m "ProManager inicial"

# Conectar con tu repositorio remoto
git remote add origin https://github.com/elireina/gestor.git

# Cambiar a la rama principal
git branch -M main

# Subir al repositorio
git push -u origin main
```

## Paso 2: Desplegar en Portainer desde Git

### Opción A: Stack desde Git
1. Abre **Portainer** en tu VPS
2. Ve a **Stacks** → **Add stack**
3. Nombre: `promanager`
4. Build method: **Repository**
5. Configura:
   - Repository URL: `https://github.com/elireina/gestor`
   - Repository reference: `refs/heads/main`
   - Compose path: `docker-compose.yml`
6. Haz clic en **Deploy the stack**

### Opción B: Actualizar desde GitHub (Webhook)
Para actualizar automáticamente cuando hagas push:

1. En Portainer, en tu stack, activa **Webhooks**
2. Copia la URL del webhook
3. En GitHub:
   - Ve a Settings → Webhooks → Add webhook
   - Pega la URL del webhook de Portainer
   - Content type: `application/json`
   - Events: **Just the push event**
4. ¡Listo! Cada push actualizará tu stack automáticamente

## Paso 3: Acceder a tu Aplicación

```
http://TU-VPS-IP:8080
```

## 🔄 Para Actualizar después de Cambios

```bash
git add .
git commit -m "Descripción de los cambios"
git push
```

Si configuraste webhook, se actualizará automáticamente. Si no, ve a Portainer y haz clic en "Pull and redeploy" en tu stack.

## 📝 Comandos Útiles

```bash
# Ver estado de Git
git status

# Ver archivos ignorados
git status --ignored

# Ver historial de commits
git log --oneline

# Ver diferencias
git diff
```

¡Listo para desplegar! 🎉
