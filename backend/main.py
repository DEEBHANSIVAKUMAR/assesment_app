import os
from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pymongo import ReturnDocument
from pydantic import BaseModel, EmailStr, Field, field_validator

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "assessment_app")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

app = FastAPI(title="Technical Assessment API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncIOMotorClient(MONGODB_URI)
db = client[DATABASE_NAME]
users = db.users
tasks = db.tasks

password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Name must contain at least 2 characters")
        return value

    @field_validator("password")
    @classmethod
    def validate_password_size(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be 72 bytes or fewer")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class TaskRequest(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=5, max_length=500)
    status: str = Field(default="pending")

    @field_validator("title", "description")
    @classmethod
    def trim_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required")
        return value

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        allowed = {"pending", "in-progress", "completed"}
        if value not in allowed:
            raise ValueError("Invalid status")
        return value


def serialize_document(document: dict[str, Any]) -> dict[str, Any]:
    document["id"] = str(document.pop("_id"))
    return document


def create_access_token(user_id: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": user_id, "exp": expires}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict[str, Any]:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise credentials_error
    except JWTError as exc:
        raise credentials_error from exc

    user = await users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise credentials_error
    return user


@app.on_event("startup")
async def create_indexes() -> None:
    await users.create_index("email", unique=True)
    await tasks.create_index("user_id")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/register", status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest) -> dict[str, Any]:
    existing_user = await users.find_one({"email": payload.email.lower()})
    if existing_user:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = {
        "name": payload.name,
        "email": payload.email.lower(),
        "password": password_context.hash(payload.password),
        "created_at": datetime.now(timezone.utc),
    }
    result = await users.insert_one(user)
    token = create_access_token(str(result.inserted_id))
    return {"token": token, "user": {"id": str(result.inserted_id), "name": user["name"], "email": user["email"]}}


@app.post("/login")
async def login(payload: LoginRequest) -> dict[str, Any]:
    user = await users.find_one({"email": payload.email.lower()})
    if not user or not password_context.verify(payload.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(str(user["_id"]))
    return {"token": token, "user": {"id": str(user["_id"]), "name": user["name"], "email": user["email"]}}


@app.get("/me")
async def me(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return {"id": str(current_user["_id"]), "name": current_user["name"], "email": current_user["email"]}


@app.get("/tasks")
async def list_tasks(current_user: dict[str, Any] = Depends(get_current_user)) -> list[dict[str, Any]]:
    cursor = tasks.find({"user_id": str(current_user["_id"])}).sort("created_at", -1)
    return [serialize_document(task) async for task in cursor]


@app.post("/tasks", status_code=status.HTTP_201_CREATED)
async def create_task(payload: TaskRequest, current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    task = payload.model_dump()
    task.update({"user_id": str(current_user["_id"]), "created_at": datetime.now(timezone.utc)})
    result = await tasks.insert_one(task)
    task["_id"] = result.inserted_id
    return serialize_document(task)


@app.put("/tasks/{task_id}")
async def update_task(
    task_id: str,
    payload: TaskRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if not ObjectId.is_valid(task_id):
        raise HTTPException(status_code=400, detail="Invalid task id")

    updated = await tasks.find_one_and_update(
        {"_id": ObjectId(task_id), "user_id": str(current_user["_id"])},
        {"$set": {**payload.model_dump(), "updated_at": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Task not found")
    return serialize_document(updated)


@app.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: str, current_user: dict[str, Any] = Depends(get_current_user)) -> None:
    if not ObjectId.is_valid(task_id):
        raise HTTPException(status_code=400, detail="Invalid task id")

    result = await tasks.delete_one({"_id": ObjectId(task_id), "user_id": str(current_user["_id"])})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
