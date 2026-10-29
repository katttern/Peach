from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.agenda import router as agenda_router
from app.api.meetings import router as meetings_router
from app.settings import settings

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["content-type", "authorization"],
)
app.include_router(meetings_router, prefix="/api")
app.include_router(agenda_router, prefix="/api")
