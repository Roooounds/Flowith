"""Health check endpoint — used by Tauri for liveness detection."""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    """Simple liveness probe. Returns 200 when the backend is ready."""
    return {"status": "ok", "service": "flowith-backend"}


@router.get("/health/ready")
async def ready():
    """Readiness probe. Returns environment info for diagnostics."""
    import sys

    return {
        "status": "ready",
        "python": sys.version,
        "platform": sys.platform,
    }
