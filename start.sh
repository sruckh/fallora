#!/bin/bash

# Build the new frontend-only falLoRA application
echo "Building falLoRA frontend application..."
docker build -t fallora .

# Stop and remove existing container
echo "Stopping existing container..."
docker rm -f fallora-app || true

# Run the new container on shared_net network with environment variables
echo "Starting falLoRA on shared_net network..."
docker run --name fallora-app --network shared_net -d \
  --env-file .env \
  fallora

# Show status
echo "Container status:"
docker ps | grep fallora-app

echo ""
echo "✅ falLoRA is now running!"
echo "📱 Access the app via: Nginx Proxy Manager (shared_net network)"
echo "🔍 Check logs with: docker logs -f fallora-app"
echo "🛑 Stop with: docker stop fallora-app"
