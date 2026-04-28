from sqlalchemy import Column, Integer, String, Float, Date, DateTime
from sqlalchemy.sql import func
from .database import Base

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    md5_hash = Column(String, unique=True, index=True)
    file_path = Column(String)  # Example: storage/2023/10/receipt.png
    
    transaction_date = Column(Date, nullable=True)
    amount = Column(Float, nullable=True)
    currency = Column(String, nullable=True)
    base_amount = Column(Float, nullable=True)  # Converted amount
    
    merchant = Column(String, index=True, nullable=True)
    category = Column(String, index=True, nullable=True)
    
    status = Column(String, default="pending")  # 'pending', 'verified'
    
    uploaded_by = Column(String, index=True, nullable=True)
    last_modified_by = Column(String, index=True, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class MerchantMapping(Base):
    __tablename__ = "merchant_mappings"

    id = Column(Integer, primary_key=True, index=True)
    original_name = Column(String, unique=True, index=True)
    mapped_category = Column(String)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())