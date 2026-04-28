from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, date
import pandas as pd
import os
import tempfile

from app.database import get_db
from app.models import Transaction, MerchantMapping
from app.schemas import TransactionCreate, TransactionResponse
from app.auth import get_current_user

router = APIRouter(
    prefix="/transactions",
    tags=["transactions"],
    dependencies=[Depends(get_current_user)]
)

@router.post("/", response_model=TransactionResponse)
def create_transaction(transaction: TransactionCreate, db: Session = Depends(get_db)):
    # Check if duplicate md5_hash exists again just in case
    db_tx = db.query(Transaction).filter(Transaction.md5_hash == transaction.md5_hash).first()
    if db_tx:
        raise HTTPException(status_code=409, detail="Transaction with this file already exists")

    # Create transaction
    new_tx = Transaction(
        md5_hash=transaction.md5_hash,
        file_path=transaction.file_path,
        transaction_date=transaction.transaction_date,
        amount=transaction.amount,
        currency=transaction.currency,
        merchant=transaction.merchant,
        category=transaction.category,
        status="verified",
        uploaded_by=transaction.uploaded_by,
        last_modified_by=transaction.uploaded_by
    )
    db.add(new_tx)
    
    # Optional: Automatically learn merchant mapping
    if transaction.merchant and transaction.category:
        existing_mapping = db.query(MerchantMapping).filter(
            MerchantMapping.original_name.ilike(f"%{transaction.merchant}%")
        ).first()
        if not existing_mapping:
            new_mapping = MerchantMapping(
                original_name=transaction.merchant,
                mapped_category=transaction.category
            )
            db.add(new_mapping)
        elif existing_mapping.mapped_category != transaction.category:
            existing_mapping.mapped_category = transaction.category

    db.commit()
    db.refresh(new_tx)
    return new_tx

@router.get("/", response_model=List[TransactionResponse])
def get_transactions(
    skip: int = 0, limit: int = 100, 
    currency: Optional[str] = None,
    category: Optional[str] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Transaction)
    if currency:
        query = query.filter(Transaction.currency == currency)
    if category:
        query = query.filter(Transaction.category == category)
    if year:
        query = query.filter(func.strftime('%Y', Transaction.transaction_date) == str(year))
    if month:
        query = query.filter(func.strftime('%m', Transaction.transaction_date) == f"{month:02d}")
        
    return query.order_by(Transaction.created_at.desc()).offset(skip).limit(limit).all()

@router.put("/{tx_id}", response_model=TransactionResponse)
def update_transaction(tx_id: int, transaction: TransactionCreate, db: Session = Depends(get_db)):
    db_tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
    if not db_tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    db_tx.transaction_date = transaction.transaction_date
    db_tx.amount = transaction.amount
    db_tx.currency = transaction.currency
    db_tx.merchant = transaction.merchant
    db_tx.category = transaction.category
    db_tx.uploaded_by = transaction.uploaded_by
    db_tx.last_modified_by = transaction.last_modified_by
    
    db.commit()
    db.refresh(db_tx)
    return db_tx

@router.delete("/{tx_id}")
def delete_transaction(tx_id: int, db: Session = Depends(get_db)):
    db_tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
    if not db_tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    db.delete(db_tx)
    db.commit()
    return {"status": "success", "message": "Transaction deleted"}

@router.get("/summary")
def get_summary(db: Session = Depends(get_db)):
    # Total by currency
    currency_totals = db.query(
        Transaction.currency, 
        func.sum(Transaction.amount).label("total")
    ).group_by(Transaction.currency).all()
    
    # Total by category
    category_totals = db.query(
        Transaction.category, 
        func.sum(Transaction.amount).label("total")
    ).group_by(Transaction.category).all()
    
    # Total counts
    total_count = db.query(func.count(Transaction.id)).scalar()

    return {
        "currency_totals": [{"currency": c[0], "total": c[1]} for c in currency_totals if c[0]],
        "category_totals": [{"category": c[0], "total": c[1]} for c in category_totals if c[0]],
        "total_count": total_count
    }

@router.get("/export")
def export_transactions(db: Session = Depends(get_db)):
    transactions = db.query(Transaction).order_by(Transaction.created_at.desc()).all()
    
    if not transactions:
        raise HTTPException(status_code=404, detail="No transactions to export")
        
    data = []
    for tx in transactions:
        data.append({
                "ID": tx.id,
                "Date": tx.transaction_date,
                "Merchant": tx.merchant,
                "Category": tx.category,
                "Amount": tx.amount,
                "Currency": tx.currency,
                "Status": tx.status,
                "File MD5": tx.md5_hash,
                "Uploaded By": tx.uploaded_by,
                "Last Modified By": tx.last_modified_by,
                "Created At": tx.created_at.strftime("%Y-%m-%d %H:%M:%S") if tx.created_at else None
            })
        
    df = pd.DataFrame(data)
    
    # Create a temporary file
    fd, path = tempfile.mkstemp(suffix=".xlsx")
    os.close(fd)
    
    df.to_excel(path, index=False)
    
    return FileResponse(
        path=path, 
        filename=f"transactions_export_{datetime.now().strftime('%Y%m%d')}.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
