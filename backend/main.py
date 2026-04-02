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
from routers.google_drive import router as google_drive_router
from routers.onboarding_routes import router as onboarding_router
from routers.state_standards_routes import router as state_standards_router
from routers.year_routes import router as year_router
from routers.academic_year_routes import router as academic_year_router
from routers.holiday_routes import router as holiday_router
from routers.blackout_routes import router as blackout_router
from routers.ai_routes import router as ai_router
from routers.attendance_routes import router as attendance_router
from routers.attendance_enhanced_routes import router as attendance_enhanced_router
from routers.analytics_routes import router as analytics_router
from routers.records_routes import router as records_router
from routers.planner_routes import router as planner_router, events_router
from routers.curriculum_routes import router as curriculum_router
from routers.extension_routes import router as extension_router
from routers.invite_routes import router as invite_router
from routers.dashboard_routes import router as dashboard_router
from routers.integrations_routes import router as integrations_router
from routers.family_routes import router as family_router
from routers.tutor_routes import router as tutor_router
from routers.child_routes import router as child_router
from routers.standards_routes import router as standards_router
from routers.compliance_routes import router as compliance_router
from routers.tutor_collaboration_routes import router as tutor_collaboration_router
from routers.parent_motivation_routes import router as parent_motivation_router
from routers.conversation_routes import router as conversation_router
from routers.confidence_routes import router as confidence_router
from routers.child_auth_routes import router as child_auth_router
from routers.account_routes import router as account_router
from routers.signup_confirmation_routes import router as signup_confirmation_router
from routers.skills_routes import router as skills_router
from routers.accreditation_routes import router as accreditation_router
from routers.insights_routes import router as insights_router
from routers.notes_routes import router as notes_router
from routers.ai_assignment_routes import router as ai_assignment_router
from routers.ai_workload_routes import router as ai_workload_router
from routers.ai_recommendations_routes import router as ai_recommendations_router
from routers.ai_coach_routes import router as ai_coach_router
from routers.ai_advanced_insights_routes import router as ai_advanced_insights_router
from routers.ai_template_generation_routes import router as ai_template_generation_router
from routers.ai_review_recommendations_routes import router as ai_review_recommendations_router
from routers.family_calendar_routes import router as family_calendar_router
from routers.curriculum_routes import router as curriculum_router
from routers.progress_routes import router as progress_router
from routers.inspire_routes import router as inspire_router
from routers.schedule_routes import router as schedule_router
from routers.log_routes import router as log_router
from routers.lesson_templates_routes import router as lesson_templates_router
from routers.content_routes import router as content_router
from routers.gradebook_routes import router as gradebook_router
from routers.export_routes import router as export_router
from routers.social_routes import router as social_router
from routers.scheduling_assistant_routes import router as scheduling_assistant_router

# Initialize planner instrumentation
from planner_logging.planner_instrumentation import init_instrumentation
import os

app = FastAPI(
    title="Learnadoodle LLM API",
    description="LLM-powered syllabus parsing and schedule planning",
    version="1.0.0"
)

# Initialize instrumentation if Supabase credentials are available
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    try:
        init_instrumentation(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    except Exception as e:
        print(f"Warning: Failed to initialize planner instrumentation: {e}")

# Log level configuration (needed for CORS messages)
_LOG_LEVEL = os.environ.get("LOG_LEVEL", "warn").lower()

# CORS configuration
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]

# If no origins specified, fall back to common local development hosts
# For development, allow all localhost origins
if not allowed_origins:
    # In development, allow all localhost ports
    # This covers Expo, React Native Web, Vite, Next.js, etc.
    allowed_origins = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8081",  # Expo / React Native web dev server
        "http://localhost:19006",  # Expo web
        "http://localhost:19000",  # Expo
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8081",
        "http://127.0.0.1:19006",
        "http://127.0.0.1:19000",
    ]
    
    # In development mode, allow any localhost origin
    # This is safer than "*" but still permissive for dev
    if os.getenv("ENVIRONMENT", "development") == "development":
        # We'll use a custom middleware to allow any localhost origin
        pass

# Ensure Expo dev server origin is allowed when not using wildcard
if "*" not in allowed_origins:
    expo_origin = "http://localhost:8081"
    if expo_origin not in allowed_origins:
        allowed_origins.append(expo_origin)

# CORS middleware - MUST be added BEFORE other middleware to handle OPTIONS preflight
# In development, be more permissive with localhost origins
is_development = os.getenv("ENVIRONMENT", "development").lower() == "development"

# Use a function to check if origin should be allowed
def is_origin_allowed(origin: str) -> bool:
    """Check if origin should be allowed"""
    if "*" in allowed_origins:
        return True
    if origin in allowed_origins:
        return True
    # In development, allow any localhost origin
    if is_development and origin:
        if "localhost" in origin or "127.0.0.1" in origin:
            return True
    return False

# Standard CORS middleware - FastAPI's CORSMiddleware will handle most cases
# In development, be very permissive - allow all localhost origins
if is_development:
    if _LOG_LEVEL == "debug":
        print(f"[CORS] Development mode: Using regex pattern for localhost origins")
        print(f"[CORS] Regex pattern: https?://(localhost|127\\.0\\.0\\.1)(:\\d+)?$")
    # Use allow_origin_regex - this allows any localhost port
    # IMPORTANT: Don't set allow_origins when using allow_origin_regex
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],  # Allow all methods
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=3600,  # Increase cache time for preflight requests
    )
else:
    if _LOG_LEVEL == "debug":
        print(f"[CORS] Production mode: Using explicit origins: {allowed_origins}")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins if "*" not in allowed_origins else ["*"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=600,
    )

# Log every request to academic_year GET so we can confirm the backend receives it
@app.middleware("http")
async def log_academic_year_requests(request, call_next):
    if request.method == "GET" and "/api/academic_year/" in str(request.url.path) and request.url.path != "/api/academic_year/plan_health" and "holidays_for_range" not in request.url.path:
        print(f"[BACKEND] Received GET {request.url.path}", flush=True)
    return await call_next(request)

# Add request logging middleware for debugging (after CORS)
# Only logs if LOG_LEVEL=debug
# Note: _LOG_LEVEL is defined earlier in the file

@app.middleware("http")
async def log_requests(request, call_next):
    if _LOG_LEVEL == "debug":
        origin = request.headers.get('origin', 'none')
        if request.method == "OPTIONS":
            print(f"[CORS DEBUG] OPTIONS request to {request.url.path}")
            print(f"[CORS DEBUG] Origin: {origin}")
            print(f"[CORS DEBUG] Is development: {is_development}")
            print(f"[CORS DEBUG] Access-Control-Request-Method: {request.headers.get('access-control-request-method', 'none')}")
    try:
        response = await call_next(request)
        if _LOG_LEVEL == "debug":
            if request.method == "OPTIONS":
                print(f"[CORS DEBUG] OPTIONS response status: {response.status_code}")
                print(f"[CORS DEBUG] Response headers: {dict(response.headers)}")
            elif request.method in ["GET", "POST", "PUT", "PATCH", "DELETE"]:
                # Log CORS headers in response for debugging
                cors_headers = {k: v for k, v in response.headers.items() if k.lower().startswith('access-control')}
                if cors_headers:
                    print(f"[CORS DEBUG] Response CORS headers for {request.method} {request.url.path}: {cors_headers}")
        return response
    except Exception as e:
        if _LOG_LEVEL == "debug" and request.method == "OPTIONS":
            print(f"[CORS DEBUG] Exception handling OPTIONS: {e}")
        raise

# Include routers
app.include_router(llm_router)
app.include_router(external_router)
app.include_router(google_calendar_router)
app.include_router(google_drive_router)
app.include_router(onboarding_router)
app.include_router(state_standards_router)
app.include_router(year_router)
app.include_router(academic_year_router)
app.include_router(holiday_router)
app.include_router(blackout_router)
app.include_router(ai_router)
app.include_router(attendance_router)
app.include_router(attendance_enhanced_router)
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
app.include_router(compliance_router)
app.include_router(tutor_collaboration_router)
app.include_router(parent_motivation_router)
app.include_router(conversation_router)
app.include_router(confidence_router)
app.include_router(child_auth_router)
app.include_router(account_router)
app.include_router(signup_confirmation_router)
app.include_router(skills_router)
app.include_router(accreditation_router)
app.include_router(insights_router)
app.include_router(gradebook_router)
app.include_router(notes_router)
app.include_router(curriculum_router)
app.include_router(progress_router)
app.include_router(inspire_router)
app.include_router(schedule_router)
app.include_router(log_router)
app.include_router(lesson_templates_router)
app.include_router(content_router)
app.include_router(ai_assignment_router)
app.include_router(ai_workload_router)
app.include_router(ai_recommendations_router)
app.include_router(ai_coach_router)
app.include_router(ai_advanced_insights_router)
app.include_router(ai_template_generation_router)
app.include_router(ai_review_recommendations_router)
app.include_router(family_calendar_router)
app.include_router(export_router)
app.include_router(social_router)
app.include_router(scheduling_assistant_router)

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
    # Increased timeout for long-running LLM requests (6 minutes)
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=port,
        timeout_keep_alive=360,  # 6 minutes keep-alive timeout
        timeout_graceful_shutdown=600  # 10 minutes graceful shutdown
    )

