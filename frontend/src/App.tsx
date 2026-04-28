import React, { useState, useRef, useEffect } from 'react'
import { Dashboard } from './Dashboard'

// 定义表单数据的接口
interface FormData {
  transaction_date: string;
  merchant: string;
  amount: string;
  currency: string;
  category: string;
  uploaded_by: string;
}

function App() {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isAuth, setIsAuth] = useState(!!localStorage.getItem('token')) // 检查是否有 token
  const [error, setError] = useState('')
  
  // 上传与 AI 识别状态
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [aiCredits, setAiCredits] = useState<number | null>(null) // 新增 AI 免费次数状态
  
  // 额外存储上传返回的文件信息以便保存
  const [fileInfo, setFileInfo] = useState<{file_path: string, md5_hash: string} | null>(null)
  
  // 表单数据状态
  const [formData, setFormData] = useState<FormData>({
    transaction_date: '',
    merchant: '',
    amount: '',
    currency: 'SGD',
    category: '',
    uploaded_by: ''
  })
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 当前标签页
  const [currentTab, setCurrentTab] = useState<'upload' | 'dashboard'>('upload')

  useEffect(() => {
    if (isAuth) {
      fetchAiCredits();
    }
  }, [isAuth]);

  const fetchAiCredits = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/upload/ai_credits`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.free_tier_remaining !== undefined) {
          setAiCredits(data.free_tier_remaining);
        }
      }
    } catch (err) {
      console.error("Failed to fetch AI credits", err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    // Mock login endpoint for Gatekeeper
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          'username': 'admin',
          'password': password
        })
      })

      if (response.ok) {
        const data = await response.json()
        localStorage.setItem('token', data.access_token)
        setIsAuth(true)
      } else {
        setError('Incorrect password / 密码错误')
      }
    } catch (err) {
      console.error(err);
      setError('Connection failed / 网络错误')
    }
  }
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // 如果是 PDF 文件，需要在 object url 中保留 type 信息以便 iframe 正确识别
    const objectUrl = URL.createObjectURL(file)
    if (file.type === 'application/pdf') {
      setPreviewUrl(`${objectUrl}#pdf`)
    } else {
      setPreviewUrl(objectUrl)
    }
    
    await uploadFileAndExtract(file)
  }
  
  const uploadFileAndExtract = async (file: File) => {
    setIsUploading(true)
    setUploadError('')
    
    const formDataObj = new FormData()
    formDataObj.append('file', file)
    
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/upload/`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`
              },
              body: formDataObj
            })
            
            if (response.status === 401) {
              localStorage.removeItem('token');
              setIsAuth(false);
              throw new Error('登录已过期，请重新登录');
            }
            
            const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.detail || '上传失败')
      }
      
      // 成功获取 AI 数据，更新表单
      if (data.extracted_data) {
        setFormData(prev => ({
          ...prev,
          transaction_date: data.extracted_data.transaction_date || '',
          merchant: data.extracted_data.merchant || '',
          amount: data.extracted_data.amount ? String(data.extracted_data.amount) : '',
          currency: data.extracted_data.currency || 'SGD',
          category: data.extracted_data.category || ''
        }))
      }
      
      if (data.file_path && data.md5_hash) {
        setFileInfo({
          file_path: data.file_path,
          md5_hash: data.md5_hash
        })
      }
      
      if (data.free_tier_remaining !== undefined) {
                setAiCredits(data.free_tier_remaining)
              }
              
            } catch (err) {
      console.error("Upload error:", err)
      setUploadError(err instanceof Error ? err.message : '上传处理失败，请重试')
    } finally {
      setIsUploading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    setIsAuth(false)
  }

  // 渲染函数中的一部分，添加登出按钮
  // 在 <div className="flex items-center justify-between p-4 bg-white/50 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-10"> 里面加入
  // 但我们通过不使用未引用的变量来解决 eslint 问题。
  
  // Removed unused renderHeader function

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleConfirmArchive = async () => {
    if (!fileInfo) {
      alert("请先上传凭证文件");
      return;
    }
    
    // Check missing fields
    const requiredFields: (keyof FormData)[] = ['transaction_date', 'merchant', 'amount', 'currency', 'category', 'uploaded_by'];
    const missingFields = requiredFields.filter(field => !formData[field]);
    if (missingFields.length > 0) {
      alert(`请填写所有必填项 (Please fill in all required fields):\n${missingFields.join(', ')}`);
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/transactions/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          transaction_date: formData.transaction_date || null,
          amount: formData.amount ? parseFloat(formData.amount) : null,
          file_path: fileInfo.file_path,
          md5_hash: fileInfo.md5_hash
        })
      });

      if (response.status === 401) {
        localStorage.removeItem('token');
        setIsAuth(false);
        throw new Error('登录已过期，请重新登录');
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '保存失败');
      }

      alert("入账成功！(Successfully archived!)");
      
      // Reset form
      setPreviewUrl(null);
      setFileInfo(null);
      setFormData(prev => ({
        transaction_date: '',
        merchant: '',
        amount: '',
        currency: 'SGD',
        category: '',
        uploaded_by: prev.uploaded_by // 保留上传者姓名以便连续上传
      }));
      
    } catch (err) {
      console.error(err);
      alert("提交失败，请检查网络或后端服务 (Submit failed)");
    }
  }

  if (!isAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#f0fdf4]">
        <div className="border border-green-100 bg-white p-10 max-w-sm w-full shadow-xl rounded-2xl">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-1 text-center tracking-wide">
            Smart Ledger
          </h1>
          <p className="text-sm text-green-600 font-medium text-center mb-8">Secure Gatekeeper</p>
          
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">访问密码 Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 p-2.5 pr-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  placeholder="Enter your password..."
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0a10.05 10.05 0 015.71-1.59c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0l-3.29-3.29" /></svg>
                  )}
                </button>
              </div>
            </div>
            {error && <div className="text-red-500 text-xs font-medium">{error}</div>}
            <button 
              type="submit" 
              className="mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-4 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg"
            >
              验证 Authenticate
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 min-h-screen flex flex-col bg-slate-50 text-slate-800 font-sans">
      <header className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center text-white font-bold">
            SL
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Smart Ledger <span className="text-sm font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full ml-2">v1.0</span></h1>
        </div>

        {/* 导航标签 */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button 
            onClick={() => setCurrentTab('upload')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              currentTab === 'upload' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            凭证入账 Upload
          </button>
          <button 
            onClick={() => setCurrentTab('dashboard')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              currentTab === 'dashboard' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            数据中心 Dashboard
          </button>
        </div>

        <div className="flex items-center gap-4">
          {aiCredits !== null && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full border border-emerald-100">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs font-medium text-slate-600">
                Gemini Flash 免费次数: <span className="text-emerald-600 font-bold">{aiCredits}</span>/20
              </span>
            </div>
          )}
          <button 
            onClick={handleLogout}
            className="text-sm font-medium text-slate-500 hover:text-red-600 transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            退出 Logout
          </button>
        </div>
      </header>

      <main className="flex-1">
        {currentTab === 'upload' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Pane: Voucher Preview */}
            <section className="lg:col-span-5 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50">
                <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  凭证预览 Voucher Preview
                </h2>
              </div>
              <div className="flex-1 p-6 flex items-center justify-center bg-slate-50 relative overflow-hidden">
                {previewUrl ? (
                  <div className="w-full h-full flex flex-col relative group">
                    <div className="flex-1 flex items-center justify-center overflow-auto rounded-lg border border-slate-200 bg-white">
                      {previewUrl.startsWith('blob:') && previewUrl.includes('pdf') ? (
                        <iframe 
                          src={previewUrl} 
                          className="w-full h-full rounded-lg border-0 bg-white"
                          title="PDF Preview"
                        />
                      ) : (
                        <img 
                          src={previewUrl} 
                          alt="Voucher Preview" 
                          className="w-full h-full object-contain rounded-lg"
                        />
                      )}
                    </div>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute top-4 right-4 bg-white/90 backdrop-blur text-slate-700 px-3 py-1.5 rounded-lg shadow-sm border border-slate-200 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-1.5 opacity-0 group-hover:opacity-100"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                      重新上传
                    </button>
                  </div>
                ) : (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-full border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center bg-white hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <div className="w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                    </div>
                    <p className="text-slate-500 text-sm font-medium">点击上传凭证文件</p>
                    <p className="text-slate-400 text-xs mt-1">支持 JPG, PNG, PDF</p>
                  </div>
                )}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/jpeg,image/png,application/pdf" 
                  className="hidden" 
                />
              </div>
            </section>

            {/* Right Pane: AI Verification */}
            <section className="lg:col-span-7 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                  数据核对 AI Inference & Verification
                </h2>
                <div className="flex items-center gap-2">
                  {aiCredits !== null && (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                      剩余免费次数: {aiCredits}
                    </span>
                  )}
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    isUploading ? 'bg-blue-50 text-blue-600 animate-pulse' : 
                    uploadError ? 'bg-red-50 text-red-600' :
                    previewUrl ? 'bg-green-50 text-green-600' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {isUploading ? 'AI 正在识别...' : 
                     uploadError ? '识别失败' : 
                     previewUrl ? '识别完成' : 
                     '等待上传'}
                  </span>
                </div>
              </div>
              
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                {/* Loading Overlay */}
                {isUploading && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center rounded-b-xl">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mb-3"></div>
                      <p className="text-sm font-medium text-slate-600">Gemini 正在提取关键信息...</p>
                    </div>
                  </div>
                )}
                
                {/* Error Message */}
                {uploadError && (
                  <div className="md:col-span-2 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
                    <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>{uploadError}</span>
                  </div>
                )}
                
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">日期 Date</label>
                  <input 
                    type="date" 
                    name="transaction_date"
                    value={formData.transaction_date}
                    onChange={handleInputChange}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all" 
                  />
                </div>
                
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">商户 Merchant</label>
                  <input 
                    type="text" 
                    name="merchant"
                    value={formData.merchant}
                    onChange={handleInputChange}
                    placeholder="例如: Grab, Starbucks..." 
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all" 
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">上传者 Upload By</label>
                  <input 
                    type="text" 
                    name="uploaded_by"
                    value={formData.uploaded_by}
                    onChange={handleInputChange}
                    placeholder="您的名字 Your Name" 
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all" 
                  />
                </div>
                
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">金额 Amount</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      step="0.01" 
                      name="amount"
                      value={formData.amount}
                      onChange={handleInputChange}
                      placeholder="0.00" 
                      className="w-full bg-slate-50 border border-slate-200 text-green-700 font-bold p-2.5 pl-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all" 
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  </div>
                </div>
                
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">币种 Currency</label>
                  <select 
                    name="currency"
                    value={formData.currency}
                    onChange={handleInputChange}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all cursor-pointer appearance-none"
                    style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%2364748b\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.25em 1.25em', paddingRight: '2.5rem' }}
                  >
                    <option value="SGD">🇸🇬 SGD - 新加坡元</option>
                    <option value="CNY">🇨🇳 CNY - 人民币</option>
                    <option value="USD">🇺🇸 USD - 美元</option>
                    <option value="EUR">🇪🇺 EUR - 欧元</option>
                    <option value="GBP">🇬🇧 GBP - 英镑</option>
                    <option value="MYR">🇲🇾 MYR - 马来西亚林吉特</option>
                    <option value="HKD">🇭🇰 HKD - 港币</option>
                    <option value="JPY">🇯🇵 JPY - 日元</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">分类 Category</label>
                  <select 
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  >
                    <option value="">请选择分类...</option>
                    <option value="meals">餐饮 Meals & Entertainment</option>
                    <option value="transport">交通 Transportation</option>
                    <option value="office">办公用品 Office Supplies</option>
                    <option value="software">软件订阅 Software & Subscriptions</option>
                    <option value="travel">差旅 Travel</option>
                    <option value="other">其他 Other</option>
                  </select>
                </div>

                <div className="md:col-span-2 mt-4 pt-6 border-t border-slate-100 flex gap-4">
                  <button 
                    onClick={handleConfirmArchive}
                    disabled={isUploading}
                    className={`flex-1 font-bold py-3 px-4 rounded-xl transition-colors shadow-md flex justify-center items-center gap-2 ${
                      isUploading 
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                        : 'bg-green-600 text-white hover:bg-green-700 hover:shadow-lg'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    确认入账 Confirm & Archive
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <Dashboard />
        )}
      </main>
    </div>
  )
}

export default App