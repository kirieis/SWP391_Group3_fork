"""Điểm khởi động FastAPI:  uvicorn ast_engine.main:app --reload --port 8001"""
from fastapi import FastAPI

from . import __version__
from .api.routes import router

app = FastAPI(title="AITA AST Engine", version=__version__)
app.include_router(router)

from ast_engine.api.analysis import router as analysis_router
app.include_router(analysis_router)