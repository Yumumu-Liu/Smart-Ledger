from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

class TransactionBase(BaseModel):
    transaction_date: Optional[date] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    merchant: Optional[str] = None
    category: Optional[str] = None
    status: str = "pending"
    uploaded_by: Optional[str] = None
    last_modified_by: Optional[str] = None

class TransactionCreate(TransactionBase):
    md5_hash: str
    file_path: str

class TransactionUpdate(TransactionBase):
    pass

class TransactionResponse(TransactionBase):
    id: int
    md5_hash: str
    file_path: str
    base_amount: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        orm_mode = True

class Token(BaseModel):
    access_token: str
    token_type: str