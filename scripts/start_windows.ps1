$ErrorActionPreference = "Stop"
$IMAGE = "kampeerhub"
$CONTAINER = "kampeerhub"

if ($args -contains "--build" -or !(docker image inspect $IMAGE 2>$null)) {
    Write-Host "Building Docker image..."
    docker build -t $IMAGE .
}

$running = docker ps -q -f "name=$CONTAINER"
if ($running) {
    Write-Host "Container already running at http://localhost:8000"
    exit 0
}

docker run -d `
    --name $CONTAINER `
    --rm `
    -p 8000:8000 `
    -v kampeerhub-data:/app/database `
    --env-file .env `
    $IMAGE

Write-Host "kampeerhub running at http://localhost:8000"
