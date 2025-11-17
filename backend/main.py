"""
FastAPI application with LLM routes
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

# Ensure backend directory is in path
backend_dir = Path(__file__).parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from routers.llm_routes import router as llm_router
from routers.external_routes import router as external_router
from routers.google_calendar import router as google_calendar_router
from routers.onboarding_routes import router as onboarding_router
from routers.state_standards_routes import router as state_standards_router
from routers.year_routes import router as year_router
from routers.blackout_routes import router as blackout_router
from routers.ai_routes import router as ai_router
from routers.attendance_routes import router as attendance_router
from routers.analytics_routes import router as analytics_router
from routers.records_routes import router as records_router
from routers.planner_routes import router as planner_router, events_router
from routers.extension_routes import router as extension_router
from routers.invite_routes import router as invite_router
from routers.dashboard_routes import router as dashboard_router
from routers.integrations_routes import router as integrations_router
from routers.family_routes import router as family_router
from routers.tutor_routes import router as tutor_router
from routers.child_routes import router as child_router
from routers.standards_routes import router as standards_router

app = FastAPI(
    title="Learnadoodle LLM API",
    description="LLM-powered syllabus parsing and schedule planning",
    version="1.0.0"
)

# CORS configuration
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]

# If no origins specified, fall back to common local development hosts
if not allowed_origins:
    allowed_origins = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8081",  # Expo / React Native web dev server
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8081",
    ]

# Ensure Expo dev server origin is allowed when not using wildcard
if "*" not in allowed_origins:
    expo_origin = "http://localhost:8081"
    if expo_origin not in allowed_origins:
        allowed_origins.append(expo_origin)

# CORS middleware - MUST be added BEFORE other middleware to handle OPTIONS preflight
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if "*" not in allowed_origins else ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

# Add request logging middleware for debugging (after CORS)
@app.middleware("http")
async def log_requests(request, call_next):
    if request.method == "OPTIONS":
        origin = request.headers.get('origin', 'none')
        print(f"[CORS DEBUG] OPTIONS request to {request.url.path}")
        print(f"[CORS DEBUG] Origin: {origin}")
        print(f"[CORS DEBUG] Allowed origins: {allowed_origins}")
        print(f"[CORS DEBUG] Access-Control-Request-Method: {request.headers.get('access-control-request-method', 'none')}")
    try:
        response = await call_next(request)
        if request.method == "OPTIONS":
            print(f"[CORS DEBUG] OPTIONS response status: {response.status_code}")
            if response.status_code == 400:
                print(f"[CORS DEBUG] 400 Error - checking if origin is allowed")
        return response
    except Exception as e:
        if request.method == "OPTIONS":
            print(f"[CORS DEBUG] Exception handling OPTIONS: {e}")
        raise

# Include routers
app.include_router(llm_router)
app.include_router(external_router)
app.include_router(google_calendar_router)
app.include_router(onboarding_router)
app.include_router(state_standards_router)
app.include_router(year_router)
app.include_router(blackout_router)
app.include_router(ai_router)
app.include_router(attendance_router)
app.include_router(analytics_router)
app.include_router(records_router)
app.include_router(planner_router)
app.include_router(events_router)
app.include_router(extension_router)
app.include_router(invite_router)
app.include_router(dashboard_router)
app.include_router(integrations_router)
app.include_router(family_router)
app.include_router(tutor_router)
app.include_router(child_router)
app.include_router(standards_router)

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "learnadoodle-llm-api",
        "version": "1.0.0"
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

