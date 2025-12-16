#!/bin/bash
# Build and push Docker image

IMAGE_NAME="elitealma/promanager"
VERSION="latest"

echo "🔨 Building Docker image..."
docker build -t $IMAGE_NAME:$VERSION .

echo "📤 Pushing to Docker Hub..."
docker push $IMAGE_NAME:$VERSION

echo "✅ Done! Image: $IMAGE_NAME:$VERSION"
