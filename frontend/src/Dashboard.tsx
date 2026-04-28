import React, { useEffect, useState } from 'react';

interface Transaction {
  id: number;
  transaction_date: string;
  merchant: string;
  amount: number;
  currency: string;
  category: string;
  status: string;
  uploaded_by?: string;
  last_modified_by?: string;
  file_path?: string;
}

interface Summary {
  currency_totals: { currency: string, total: number }[];
  category_totals: { category: string, total: number }[];
  total_count: number;
}

export const Dashboard: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const [filterYear, setFilterYear] = useState<string>('');
  const [filterMonth, setFilterMonth] = useState<string>('');

  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Transaction>>({});

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        
        const queryParams = new URLSearchParams();
        if (filterYear) queryParams.append('year', filterYear);
        if (filterMonth) queryParams.append('month', filterMonth);

        const [txRes, summaryRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/transactions/?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/transactions/summary`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);

        if (txRes.ok && summaryRes.ok) {
          setTransactions(await txRes.json());
          setSummary(await summaryRes.json());
        }
      } catch (err) {
        console.error("Failed to fetch dashboard data", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [filterYear, filterMonth]);

  // Expose fetchData for manual refresh
  const handleRefresh = () => {
    const fetchFreshData = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        
        const queryParams = new URLSearchParams();
        if (filterYear) queryParams.append('year', filterYear);
        if (filterMonth) queryParams.append('month', filterMonth);

        const [txRes, summaryRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/transactions/?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/transactions/summary`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);

        if (txRes.ok && summaryRes.ok) {
          setTransactions(await txRes.json());
          setSummary(await summaryRes.json());
        }
      } catch (err) {
        console.error("Failed to fetch dashboard data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchFreshData();
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/transactions/export`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error('Export failed');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions_export_${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Export error", err);
      alert("导出失败 (Export Failed)");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定要删除这条记录吗？(Are you sure you want to delete this record?)")) {
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/transactions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        handleRefresh();
      } else {
        alert("删除失败 (Delete failed)");
      }
    } catch (err) {
      console.error(err);
      alert("网络错误 (Network error)");
    }
  };

  const handleEditClick = (tx: Transaction) => {
    setEditTx(tx);
    setEditFormData(tx);
  };

  const handleEditSave = async () => {
    if (!editTx) return;

    // Check missing fields for edit
    const requiredFields = ['transaction_date', 'merchant', 'amount', 'currency', 'category', 'uploaded_by'];
    const missingFields = requiredFields.filter(field => !editFormData[field as keyof Transaction]);
    if (missingFields.length > 0) {
      alert(`请填写所有必填项 (Please fill in all required fields):\n${missingFields.join(', ')}`);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const payload = {
        ...editTx,
        ...editFormData,
        last_modified_by: editFormData.last_modified_by || editFormData.uploaded_by // or a separate field if user edits their name
      };

      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/transactions/${editTx.id}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setEditTx(null);
        handleRefresh();
      } else {
        alert("修改失败 (Edit failed)");
      }
    } catch (err) {
      console.error(err);
      alert("网络错误 (Network error)");
    }
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: name === 'amount' ? parseFloat(value) : value
    }));
  };

  if (loading && !transactions.length) {
    return <div className="p-6 text-center text-slate-500">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">总笔数 Total Transactions</h3>
          <div className="text-3xl font-bold text-slate-800">{summary?.total_count || 0}</div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 md:col-span-2">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">币种汇总 Currency Totals</h3>
          <div className="flex flex-wrap gap-4">
            {summary?.currency_totals.map(c => (
              <div key={c.currency} className="bg-slate-50 px-4 py-3 rounded-lg border border-slate-100 flex-1 min-w-[120px]">
                <div className="text-xs text-slate-500 mb-1">{c.currency}</div>
                <div className="text-xl font-bold text-green-700">{c.total.toFixed(2)}</div>
              </div>
            ))}
            {!summary?.currency_totals.length && <div className="text-slate-400 text-sm">暂无数据 No data</div>}
          </div>
        </div>
      </div>

      {/* Filters and List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              入账记录 Transactions
            </h2>
            <div className="flex gap-2">
              <select 
                value={filterYear} 
                onChange={e => setFilterYear(e.target.value)}
                className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-green-500"
              >
                <option value="">所有年份 All Years</option>
                <option value="2023">2023</option>
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
              </select>
              <select 
                value={filterMonth} 
                onChange={e => setFilterMonth(e.target.value)}
                className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-green-500"
              >
                <option value="">所有月份 All Months</option>
                {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{m}月</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={handleExport}
              className="text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:text-green-600 hover:border-green-200 px-3 py-1.5 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              导出 XLSX (Export)
            </button>
            <button 
              onClick={handleRefresh}
              className="text-xs font-medium text-slate-500 hover:text-green-600 transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              刷新 Refresh
            </button>
          </div>
        </div>
        <div className="overflow-x-auto relative">
          {loading && (
            <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex justify-center pt-10 z-10">
              <div className="w-6 h-6 border-2 border-green-200 border-t-green-600 rounded-full animate-spin"></div>
            </div>
          )}
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-white border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                <th className="p-4 font-semibold">日期 Date</th>
                <th className="p-4 font-semibold">商户 Merchant</th>
                <th className="p-4 font-semibold">分类 Category</th>
                <th className="p-4 font-semibold text-right">金额 Amount</th>
                <th className="p-4 font-semibold">上传与修改 Users</th>
                <th className="p-4 font-semibold">凭证 Voucher</th>
                <th className="p-4 font-semibold text-right">操作 Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {transactions.map(tx => (
                <tr key={tx.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 text-slate-600">{tx.transaction_date || '-'}</td>
                  <td className="p-4 font-medium text-slate-800">{tx.merchant || '-'}</td>
                  <td className="p-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                      {tx.category || '未分类'}
                    </span>
                  </td>
                  <td className="p-4 text-right font-bold text-slate-800">
                    {tx.amount ? `${tx.amount.toFixed(2)} ${tx.currency}` : '-'}
                  </td>
                  <td className="p-4">
                    <div className="text-xs text-slate-700">上传: <span className="font-medium">{tx.uploaded_by || '-'}</span></div>
                    <div className="text-[10px] text-slate-500 mt-0.5">修改: {tx.last_modified_by || tx.uploaded_by || '-'}</div>
                  </td>
                  <td className="p-4">
                    {tx.file_path ? (
                      <a 
                        href={`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/${tx.file_path}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        查看 View
                      </a>
                    ) : '-'}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-3">
                      <button onClick={() => handleEditClick(tx)} className="text-slate-400 hover:text-blue-600 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => handleDelete(tx.id)} className="text-slate-400 hover:text-red-600 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    暂无数据 No transactions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editTx && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">编辑记录 Edit Transaction</h3>
              <button onClick={() => setEditTx(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">日期 Date</label>
                  <input type="date" name="transaction_date" value={editFormData.transaction_date || ''} onChange={handleEditChange} className="w-full border rounded p-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">金额 Amount</label>
                  <input type="number" step="0.01" name="amount" value={editFormData.amount || ''} onChange={handleEditChange} className="w-full border rounded p-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">商户 Merchant</label>
                  <input type="text" name="merchant" value={editFormData.merchant || ''} onChange={handleEditChange} className="w-full border rounded p-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">币种 Currency</label>
                  <select name="currency" value={editFormData.currency || ''} onChange={handleEditChange} className="w-full border rounded p-2 text-sm">
                    <option value="SGD">SGD</option>
                    <option value="CNY">CNY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="MYR">MYR</option>
                    <option value="HKD">HKD</option>
                    <option value="JPY">JPY</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">分类 Category</label>
                  <select name="category" value={editFormData.category || ''} onChange={handleEditChange} className="w-full border rounded p-2 text-sm">
                    <option value="">请选择...</option>
                    <option value="meals">餐饮 Meals</option>
                    <option value="transport">交通 Transport</option>
                    <option value="office">办公 Office</option>
                    <option value="software">软件 Software</option>
                    <option value="travel">差旅 Travel</option>
                    <option value="other">其他 Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">修改人 Modified By</label>
                  <input type="text" name="last_modified_by" value={editFormData.last_modified_by || editFormData.uploaded_by || ''} onChange={handleEditChange} placeholder="您的名字 Name" className="w-full border rounded p-2 text-sm" />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setEditTx(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                取消 Cancel
              </button>
              <button onClick={handleEditSave} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                保存修改 Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};