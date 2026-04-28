from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
import hashlib
import os
import shutil
from datetime import datetime
from pydantic import BaseModel
from typing import Optional
from google import genai
from google.genai import types
import json

from app.database import get_db
from app.models import Transaction, MerchantMapping
from app.auth import get_current_user

router = APIRouter(
    prefix="/upload",
    tags=["upload"],
)

# 基础目录配置
UPLOAD_DIR = "storage"

# OCR 响应模型，用于指导 AI 返回结构化数据
class OCRResult(BaseModel):
    transaction_date: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    merchant: Optional[str] = None
    category: Optional[str] = None

# 模拟的免费次数统计 (实际项目中可以存入数据库)
# Gemini 1.5 Flash 免费额度为 20 次，每日刷新
AI_FREE_TIER_LIMIT = 20
current_usage = 0
current_usage_date = datetime.now().date()

def calculate_md5(file_path: str) -> str:
    """计算文件的 MD5 哈希值"""
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def perform_ocr_with_gemini(file_path: str, mime_type: str) -> dict:
    """使用 Gemini 1.5 Flash 进行 OCR 识别"""
    global current_usage, current_usage_date
    today = datetime.now().date()
    if current_usage_date != today:
        current_usage = 0
        current_usage_date = today

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        print("Warning: GEMINI_API_KEY not found or invalid in environment variables.")
        return {}
        
    try:
        # 1. 初始化客户端
        client = genai.Client(api_key=api_key)
        
        # 2. 上传文件到 Gemini
        print(f"Uploading {file_path} to Gemini...")
        uploaded_file = client.files.upload(file=file_path)
        
        # 3. 构造提示词
        prompt = """
        You are an expert financial accountant. Extract the following information from this receipt/invoice.
        Respond ONLY with a valid JSON object matching this schema exactly, with no markdown formatting or extra text:
        {
            "transaction_date": "YYYY-MM-DD",
            "amount": float,
            "currency": "3-letter currency code like SGD, CNY, USD",
            "merchant": "Name of the store or service",
            "category": "One of: meals, transport, office, software, travel, other"
        }
        If a field is not found or unclear, use null.
        """
        
        # 4. 调用模型进行推理
        print("Starting inference...")
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[
                uploaded_file,
                prompt
            ],
            config=types.GenerateContentConfig(
                temperature=0.1, # 降低温度以获得更稳定的结构化输出
                response_mime_type="application/json",
            )
        )
        
        # 5. 清理远程文件
        client.files.delete(name=uploaded_file.name)
        
        # 6. 解析结果
        result_text = response.text
        print(f"Raw AI Response: {result_text}")
        
        try:
            parsed_data = json.loads(result_text)
            # 记录使用次数
            current_usage += 1
            return parsed_data
        except json.JSONDecodeError:
            print("Failed to parse AI response as JSON")
            return {}
            
    except Exception as e:
        print(f"OCR Inference failed: {str(e)}")
        return {}

@router.get("/ai_credits")
def get_ai_credits(current_user: str = Depends(get_current_user)):
    global current_usage, current_usage_date
    today = datetime.now().date()
    if current_usage_date != today:
        current_usage = 0
        current_usage_date = today
    
    return {"free_tier_remaining": max(0, AI_FREE_TIER_LIMIT - current_usage)}

@router.post("/")
async def upload_voucher(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """
    处理凭证上传：
    1. 保存到临时目录
    2. 计算 MD5
    3. 查重
    4. 移动到按年月归档的目录
    5. 调用 AI 进行 OCR 提取
    """
    
    # 1. 验证文件类型
    allowed_types = ["image/jpeg", "image/png", "application/pdf"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Only JPG, PNG, and PDF are supported.")
        
    # 2. 准备临时保存路径
    temp_dir = os.path.join(UPLOAD_DIR, "temp")
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, file.filename)
    
    try:
        # 3. 保存临时文件
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # 4. 计算 MD5
        file_md5 = calculate_md5(temp_path)
        
        # 5. 数据库去重校验
        existing_tx = db.query(Transaction).filter(Transaction.md5_hash == file_md5).first()
        if existing_tx:
            # 清理临时文件
            os.remove(temp_path)
            raise HTTPException(
                status_code=409, 
                detail="凭证已存在，请勿重复报销 (Duplicate Voucher)"
            )
            
        # 6. 确定最终归档路径 (storage/YYYY/MM/filename)
        now = datetime.now()
        year_month_dir = os.path.join(UPLOAD_DIR, str(now.year), f"{now.month:02d}")
        os.makedirs(year_month_dir, exist_ok=True)
        
        # 为了避免同名文件覆盖，加上时间戳前缀
        final_filename = f"{now.strftime('%Y%m%d_%H%M%S')}_{file.filename}"
        final_path = os.path.join(year_month_dir, final_filename)
        
        # 移动文件到最终目录
        shutil.move(temp_path, final_path)
        
        # 7. 调用 AI 进行 OCR
        # 注意：这里我们使用的是相对路径，实际生产中可能需要处理为绝对路径或根据部署环境调整
        ocr_data = perform_ocr_with_gemini(final_path, file.content_type)
        
        # 8. 结合数据库里的映射规则，进一步优化商户和分类
        merchant_name = ocr_data.get("merchant")
        if merchant_name:
            mapping = db.query(MerchantMapping).filter(
                MerchantMapping.original_name.ilike(f"%{merchant_name}%")
            ).first()
            if mapping:
                ocr_data["category"] = mapping.mapped_category
        
        global current_usage, current_usage_date
        today = datetime.now().date()
        if current_usage_date != today:
            current_usage = 0
            current_usage_date = today

        return {
            "status": "success",
            "message": "File processed successfully",
            "file_path": final_path,
            "md5_hash": file_md5,
            "extracted_data": ocr_data,
            "free_tier_remaining": AI_FREE_TIER_LIMIT - current_usage
        }
        
    except HTTPException:
        raise
    except Exception as e:
        # 清理可能残留的临时文件
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")