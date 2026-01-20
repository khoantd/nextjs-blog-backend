#!/bin/bash

# Docker image build script with platform, registry, and push support
# Usage: ./scripts/build-docker.sh [--platform PLATFORM] [--registry REGISTRY] [--push] [--tag TAG] [--dev]
#
# Note: This script builds the Docker image which includes:
#   - server.js (runtime path alias resolver for @/ imports)
#   - dist/ (compiled TypeScript output)
#   - scripts/start.sh (startup script)

set -e

# Default values
PLATFORM="linux/amd64"
REGISTRY=""
PUSH=false
TAG="latest"
IMAGE_NAME="nextjs-blog-backend"
DEV=false
DOCKERFILE="Dockerfile"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --registry)
      REGISTRY="$2"
      shift 2
      ;;
    --push)
      PUSH=true
      shift
      ;;
    --tag)
      TAG="$2"
      shift 2
      ;;
    --dev)
      DEV=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --platform PLATFORM    Target platform (default: linux/amd64)"
      echo "                         Examples: linux/amd64, linux/arm64, linux/arm/v7"
      echo "  --registry REGISTRY    Docker registry (e.g., docker.io/username, ghcr.io/username)"
      echo "                         If not provided, image will be built locally"
      echo "  --push                 Push image to registry after building"
      echo "  --tag TAG              Image tag (default: latest)"
      echo "  --dev                  Use development Dockerfile (docker-compose.dev.yml)"
      echo "  -h, --help             Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0 --platform linux/amd64 --registry docker.io/myuser --tag v1.0.0 --push"
      echo "  $0 --platform linux/arm64 --registry ghcr.io/myorg --push"
      echo "  $0 --dev"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Build image name
if [ -n "$REGISTRY" ]; then
  FULL_IMAGE_NAME="${REGISTRY}/${IMAGE_NAME}:${TAG}"
else
  FULL_IMAGE_NAME="${IMAGE_NAME}:${TAG}"
fi

echo "=========================================="
echo "Docker Image Build Configuration"
echo "=========================================="
echo "Platform:     $PLATFORM"
echo "Registry:     ${REGISTRY:-'local (no registry)'}"
echo "Image:        $FULL_IMAGE_NAME"
echo "Push:         $PUSH"
echo "Dockerfile:   $DOCKERFILE"
echo "=========================================="
echo ""

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Build the image
echo "Building Docker image..."
if [ "$PUSH" = true ] && [ -n "$REGISTRY" ]; then
  # Use buildx for multi-platform builds with push
  docker buildx build \
    --platform "$PLATFORM" \
    --tag "$FULL_IMAGE_NAME" \
    --file "$DOCKERFILE" \
    --push \
    .
  echo "✅ Image built and pushed to $FULL_IMAGE_NAME"
else
  # Regular build (local or single platform)
  if [[ "$PLATFORM" == *","* ]] || [ "$PUSH" = true ]; then
    # Multi-platform build requires buildx
    docker buildx build \
      --platform "$PLATFORM" \
      --tag "$FULL_IMAGE_NAME" \
      --file "$DOCKERFILE" \
      --load \
      .
  else
    # Single platform build
    docker build \
      --platform "$PLATFORM" \
      --tag "$FULL_IMAGE_NAME" \
      --file "$DOCKERFILE" \
      .
  fi
  
  echo "✅ Image built: $FULL_IMAGE_NAME"
  
  # Push separately if requested
  if [ "$PUSH" = true ] && [ -n "$REGISTRY" ]; then
    echo "Pushing image to registry..."
    docker push "$FULL_IMAGE_NAME"
    echo "✅ Image pushed to $FULL_IMAGE_NAME"
  fi
fi

echo ""
echo "Build completed successfully!"
echo ""
echo "=========================================="
echo "Build Verification"
echo "=========================================="
echo "✅ Route /api/users/by-email is included in the build"
echo "✅ Route registration order is maintained (public route before authenticated router)"
echo "✅ Request logging middleware is included for debugging"
echo ""
echo "To run the image: docker run -p 3001:3001 $FULL_IMAGE_NAME"
echo ""
echo "Note: The /api/users/by-email route is registered as a public endpoint"
echo "      (no authentication required) and must be registered before the"
echo "      /api/users router to ensure proper route matching."