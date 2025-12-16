# Usar nginx alpine para servir archivos estáticos
FROM nginx:alpine

# Copiar archivos de la aplicación al directorio de nginx
COPY index.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/

# Configuración personalizada de nginx (opcional)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exponer puerto 80
EXPOSE 80

# Nginx se ejecuta en primer plano por defecto en la imagen oficial
CMD ["nginx", "-g", "daemon off;"]
