from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import os
from datetime import timedelta
from dotenv import load_dotenv

from . import models, schemas, database, auth
from .routers import upload, transactions

load_dotenv()

from fastapi.staticfiles import StaticFiles

# Setup App
app = FastAPI(title="Smart Ledger API")

# Mount storage directory
if not os.path.exists("storage"):
    os.makedirs("storage")
app.mount("/storage", StaticFiles(directory="storage"), name="storage")

# 配置 CORS 允许前端访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 生产环境应改为具体的源
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB tables
models.Base.metadata.create_all(bind=database.engine)

@app.post("/token", response_model=schemas.Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    env_password = os.getenv("APP_PASSWORD", "Quaphase888")
    
    # We only care about matching the password from .env
    if form_data.password != env_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": "admin"}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

# 注册路由
app.include_router(upload.router)
app.include_router(transactions.router)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Smart Ledger API is running"}
