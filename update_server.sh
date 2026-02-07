#!/bin/bash
# Script de actualización para el servidor

echo "🚀 Iniciando actualización..."

# 1. Definir el nombre del servicio (basado en lo que vimos en docker ps)
SERVICE_NAME="promanager"
CONTAINER_NAME="promanager_promanager.1.zdn7othd2vbpe58yrflcnlvlj"

# 2. Intentar actualizar el servicio específico
echo "📥 Descargando nueva imagen..."
docker update --image elitealma/promanager:latest $CONTAINER_NAME 2>/dev/null || docker pull elitealma/promanager:latest

# 3. Recrear el contenedor si docker-compose falla
# Dado que 'docker compose' falló por falta de archivo de configuración,
# vamos a intentar actualizar el servicio usando docker service update si es un swarm,
# o recreando el contenedor manualmente si es standalone.

if docker info | grep -q "Swarm: active"; then
    echo "🔄 Actualizando servicio en Swarm..."
    docker service update --image elitealma/promanager:latest $SERVICE_NAME
else
    echo "⚠️ No se detectó configuración estándar de docker-compose."
    echo "Intentando reiniciar el contenedor existente para ver si toma cambios..."
    docker restart $CONTAINER_NAME
fi

echo "✅ Proceso finalizado. Verifica la web en unos segundos."
