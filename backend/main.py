"""
Flowith Python Backend — FastAPI service for advanced agent orchestration.
Launched as a subprocess by the Tauri app. Communicates via HTTP on localhost.
"""

import asyncio
import logging
import sys
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from routes.agent import router as agent_router
from routes.health import router as health_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,  # stderr so Tauri can capture logs separately
)
logger = logging.getLogger("flowith")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown hooks."""
    logger.info("Flowith backend starting on port 8420")
    yield
    logger.info("Flowith backend shutting down")


app = FastAPI(
    title="Flowith Backend",
    version="0.1.0",
    lifespan=lifespan,
)

# Allow requests from the Tauri frontend (localhost dev server + WebView)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(agent_router, prefix="/agent")


@app.exception_handler(Exception)
async def global_exception_handler(_, exc: Exception):
    """Log all unhandled exceptions with full traceback."""
    logger.error(f"Unhandled error: {exc}\n{traceback.format_exc()}")
    raise HTTPException(status_code=500, detail=str(exc))


def main():
    import uvicorn
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8420,
        log_level="info",
    )


if __name__ == "__main__":
    main()
