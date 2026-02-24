import React, { useState, useMemo, useEffect } from 'react';
import { 
  Upload, BarChart3, TrendingUp, ShoppingCart, 
  Eye, Search, ArrowUpDown, CheckCircle2, AlertCircle, 
  ChevronRight, X, LayoutDashboard, 
  History, MousePointer2, RefreshCw, Server, Database, ChevronDown, Menu
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar
} from 'recharts';

/**
 * [중요] 서버 주소 설정
 * 배포된 Vercel 앱이 이 주소를 통해 데이터베이스와 통신합니다.
 * Render에서 받은 실제 주소로 꼭 바꿔주세요!
 * 예: const SERVER_URL = 'https://report-backend-xxxx.onrender.com';
 */
const SERVER_URL = 'https://report-backend-0fwr.onrender.com';

const App = () => {
  // --- 데이터 상태 ---
  const [processedData, setProcessedData] = useState([]);
  const [dailyTrend, setDailyTrend] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [globalMaxDate, setGlobalMaxDate] = useState('');
  
  // --- UI 및 진행 상태 ---
  const [isUploading, setIsUploading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyNameChanged, setShowOnlyNameChanged] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: '상품상세조회수', direction: 'desc' });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [visibleCount, setVisibleCount] = useState(50);
  const [hasConnectionError, setHasConnectionError] = useState(false);

  // 검색/정렬 변경 시 목록 초기화
  useEffect(() => {
    setVisibleCount(50);
  }, [searchTerm, sortConfig, showOnlyNameChanged, activeTab]);

  /**
   * 서버(DB)에서 최신 데이터를 가져오는 함수
   */
  const fetchDashboardData = async () => {
    setIsFetching(true);
    setHasConnectionError(false);
    try {
      // 타임아웃 설정을 추가하여 무한 대기 방지
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${SERVER_URL}/api/data`, { signal: controller.signal });
      clearTimeout(id);

      if (!response.ok) throw new Error('서버 응답 오류');
      
      const data = await response.json();
      
      setProcessedData(Array.isArray(data.processedData) ? data.processedData : []);
      setDailyTrend(Array.isArray(data.dailyTrend) ? data.dailyTrend : []);
      setMonthlyTrend(Array.isArray(data.monthlyTrend) ? data.monthlyTrend : []);
      setGlobalMaxDate(String(data.globalMaxDate || ''));
    } catch (error) {
      console.error("Fetch error:", error);
      setHasConnectionError(true);
      setStatusMessage({ 
        type: 'error', 
        text: '서버에 연결할 수 없습니다. SERVER_URL 주소와 서버 실행 여부를 확인하세요.' 
      });
    } finally {
      setIsFetching(false);
    }
  };

  // 앱 시작 시 데이터 로드
  useEffect(() => {
    fetchDashboardData();
  }, []);

  /**
   * 엑셀 파일을 백엔드 서버로 전송하는 함수
   */
  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setIsUploading(true);
    setStatusMessage({ type: 'info', text: '서버로 데이터를 전송 중입니다...' });

    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('excelFile', files[i]);

        const response = await fetch(`${SERVER_URL}/api/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) throw new Error(`${files[i].name} 업로드 실패`);
      }

      setStatusMessage({ type: 'success', text: '데이터베이스 저장이 완료되었습니다!' });
      await fetchDashboardData(); 

    } catch (error) {
      console.error("Upload error:", error);
      setStatusMessage({ type: 'error', text: '데이터 전송 중 에러가 발생했습니다. 서버 상태를 확인하세요.' });
    } finally {
      setIsUploading(false);
      event.target.value = null; 
    }
  };

  // 통계 요약 데이터 계산 (방어 로직 추가)
  const summary = useMemo(() => {
    const safeData = Array.isArray(processedData) ? processedData : [];
    const totalRev = safeData.reduce((acc, curr) => acc + (Number(curr.결제금액) || 0), 0);
    const totalSales = safeData.reduce((acc, curr) => acc + (Number(curr.결제상품수량) || 0), 0);
    const totalViews = safeData.reduce((acc, curr) => acc + (Number(curr.상품상세조회수) || 0), 0);
    return { 
      revenue: totalRev, 
      sales: totalSales, 
      views: totalViews, 
      dailyAvgViews: dailyTrend.length > 0 ? totalViews / dailyTrend.length : 0, 
      conversionRate: totalViews > 0 ? (totalSales / totalViews) * 100 : 0 
    };
  }, [processedData, dailyTrend]);

  // 필터링 및 정렬된 데이터
  const sortedData = useMemo(() => {
    const safeData = Array.isArray(processedData) ? processedData : [];
    let filtered = safeData.filter(p => {
      const name = String(p.lastName || '').toLowerCase();
      const id = String(p.상품ID || '');
      const matchesSearch = name.includes(searchTerm.toLowerCase()) || id.includes(searchTerm);
      const matchesFilter = showOnlyNameChanged ? (Number(p.nameCount) > 1) : true;
      return matchesSearch && matchesFilter;
    });

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        const valA = Number(a[sortConfig.key]) || 0;
        const valB = Number(b[sortConfig.key]) || 0;
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
      });
    }
    return filtered;
  }, [processedData, searchTerm, showOnlyNameChanged, sortConfig]);

  const handleSort = (key) => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));

  // 데이터 전체 삭제
  const clearData = async () => {
    if (window.confirm("서버의 모든 데이터를 삭제하시겠습니까?")) {
      try {
        const response = await fetch(`${SERVER_URL}/api/clear`, { method: 'DELETE' });
        if (!response.ok) throw new Error('삭제 실패');
        
        setStatusMessage({ type: 'success', text: '서버 데이터가 초기화되었습니다.' });
        fetchDashboardData();
      } catch(e) { 
        setStatusMessage({ type: 'error', text: '초기화에 실패했습니다.' });
      }
    }
  };

  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 font-sans">
      <aside className={`fixed left-0 top-0 h-full bg-white border-r border-slate-200 z-30 flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <div className="p-6 flex items-center gap-3 border-b border-slate-50">
          <div className="bg-emerald-600 p-2 rounded-xl text-white shadow-xl shrink-0"><Server size={20} /></div>
          {!isSidebarCollapsed && <h1 className="font-black text-xl tracking-tighter text-slate-900">판매분석 <span className="text-emerald-600 font-bold text-sm ml-1 uppercase italic">PRO</span></h1>}
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-4 p-3.5 rounded-2xl transition-all ${activeTab === 'dashboard' ? 'bg-emerald-50 text-emerald-700 shadow-sm font-bold' : 'text-slate-400 hover:bg-slate-50'}`}>
            <LayoutDashboard size={20} /> {!isSidebarCollapsed && <span>서버 기반 리포트</span>}
          </button>
          <button onClick={() => setActiveTab('products')} className={`w-full flex items-center gap-4 p-3.5 rounded-2xl transition-all ${activeTab === 'products' ? 'bg-emerald-50 text-emerald-700 shadow-sm font-bold' : 'text-slate-400 hover:bg-slate-50'}`}>
            <ShoppingCart size={20} /> {!isSidebarCollapsed && <span>상품별 분석</span>}
          </button>
        </nav>

        <div className="p-4 space-y-3 border-t border-slate-50">
          <div className="relative bg-slate-50 p-5 rounded-[24px] border border-slate-100 flex flex-col items-center gap-3 hover:bg-emerald-50 transition-all cursor-pointer group shadow-sm overflow-hidden">
            <input type="file" multiple accept=".xlsx" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" title="엑셀 파일 추가" disabled={isUploading || hasConnectionError} />
            <div className={`p-2.5 rounded-xl shadow-md transition-transform ${isUploading ? 'bg-slate-200 animate-pulse' : 'bg-white group-hover:scale-110'}`}>
              <Upload size={22} className={isUploading ? 'text-slate-400' : 'text-emerald-600'} />
            </div>
            {!isSidebarCollapsed && <span className="text-xs font-black text-slate-600 text-center">{isUploading ? '서버 전송 중...' : '엑셀 데이터 전송'}</span>}
          </div>
          {!isSidebarCollapsed && (
            <div className={`px-3 py-3 rounded-xl flex items-center gap-3 shadow-inner text-left ${hasConnectionError ? 'bg-rose-50 border border-rose-100' : 'bg-emerald-50 border border-emerald-100'}`}>
               <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${hasConnectionError ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                 {hasConnectionError ? <AlertCircle size={14} /> : <Database size={14} />}
               </div>
               <div className="min-w-0">
                  <p className={`text-[9px] font-black uppercase tracking-widest leading-none mb-1 ${hasConnectionError ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {hasConnectionError ? 'Connection Offline' : 'Backend Live'}
                  </p>
                  <p className={`text-[10px] font-bold truncate ${hasConnectionError ? 'text-rose-800' : 'text-emerald-800'}`}>
                    {hasConnectionError ? '서버 연결 확인 필요' : 'DB 서버 연동 중'}
                  </p>
               </div>
            </div>
          )}
          {processedData.length > 0 && !isSidebarCollapsed && (
            <button onClick={clearData} className="w-full flex items-center justify-center gap-2 p-3 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all underline underline-offset-4">DB 데이터 비우기</button>
          )}
        </div>
      </aside>

      <main className={`transition-all duration-300 ${isSidebarCollapsed ? 'pl-20' : 'pl-64'}`}>
        <header className="h-20 bg-white/80 backdrop-blur-xl sticky top-0 z-20 flex items-center justify-between px-10 border-b border-slate-100">
          <div className="flex items-center gap-4 text-left">
             <h2 className="text-xl font-black text-slate-900 tracking-tight leading-none">{activeTab === 'dashboard' ? '서버 분석 리포트' : '상품 성과 리스트'}</h2>
             <div className="flex items-center gap-2">
               <div className={`h-2 w-2 rounded-full ${isFetching || isUploading ? 'bg-amber-400 animate-pulse' : hasConnectionError ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
               <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded font-black uppercase tracking-widest">Real-time Backend</span>
             </div>
          </div>
          <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="p-2.5 hover:bg-slate-50 rounded-xl transition-all text-slate-400 active:scale-90"><Menu size={22} /></button>
        </header>

        <div className="p-10 max-w-[1500px] mx-auto space-y-10">
          {isFetching && processedData.length === 0 ? (
            <div className="h-[60vh] flex flex-col items-center justify-center">
              <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="font-black text-slate-400 tracking-widest uppercase text-xs mt-4">서버에서 분석 데이터를 불러오는 중...</p>
            </div>
          ) : hasConnectionError ? (
            <div className="h-[70vh] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-rose-200 rounded-[56px] bg-white shadow-2xl p-10">
              <div className="bg-rose-50 p-8 rounded-full mb-8 text-rose-500"><AlertCircle size={64} /></div>
              <h3 className="text-2xl font-black text-slate-900 mb-2 italic">서버 연결 오류</h3>
              <p className="text-slate-500 font-medium text-center mb-6">
                현재 브라우저가 서버(<code>{SERVER_URL}</code>)에 접속할 수 없습니다.<br/>
                깃허브의 <code>App.jsx</code> 파일 상단에서 <code>SERVER_URL</code>을 Render 주소로 업데이트 하셨나요?
              </p>
              <button onClick={fetchDashboardData} className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black flex items-center gap-2 hover:scale-105 transition-all shadow-xl">
                <RefreshCw size={18} /> 연결 재시도
              </button>
            </div>
          ) : processedData.length === 0 ? (
            <div className="h-[70vh] flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-200 rounded-[56px] bg-white shadow-2xl">
              <div className="bg-slate-50 p-8 rounded-full mb-8 text-indigo-200"><Database size={64} /></div>
              <h3 className="text-2xl font-black text-slate-900 mb-2 italic text-center">데이터베이스가 비어있습니다.</h3>
              <p className="text-slate-400 font-medium text-center">엑셀 파일을 업로드하면 서버가 실시간으로 분석하여 DB에 저장합니다.</p>
            </div>
          ) : (
            <>
              {/* 요약 지표 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                  { label: '누적 매출액', val: `₩${summary.revenue.toLocaleString()}`, icon: TrendingUp },
                  { label: '누적 유입수', val: `${summary.views.toLocaleString()}회`, icon: Eye },
                  { label: '일평균 유입', val: `${summary.dailyAvgViews.toFixed(0)}회`, icon: MousePointer2 },
                  { label: '평균 결제 전환율', val: `${summary.conversionRate.toFixed(2)}%`, icon: CheckCircle2 }
                ].map((s, i) => (
                  <div key={i} className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl shadow-slate-200/40 hover:translate-y-[-4px] transition-all group text-left">
                    <div className="flex justify-between items-start mb-6">
                      <div className="p-4 rounded-3xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors"><s.icon size={24} /></div>
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Report</span>
                    </div>
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
                    <h4 className="text-3xl font-black text-slate-900 tracking-tighter">{s.val}</h4>
                  </div>
                ))}
              </div>

              {activeTab === 'dashboard' ? (
                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-xl text-left">
                      <h3 className="font-black text-lg mb-8 flex items-center gap-3"><div className="w-1.5 h-6 bg-emerald-600 rounded-full"></div> 월간 매출 성장 추이</h3>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyTrend}>
                            <CartesianGrid strokeDasharray="0" vertical={false} stroke="#F1F5F9" />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94A3B8', fontWeight: 800}} dy={10} />
                            <YAxis hide />
                            <Tooltip cursor={{fill: '#F8FAFC', radius: 12}} contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} />
                            <Bar name="매출액" dataKey="매출" fill="#10B981" radius={[12, 12, 0, 0]} barSize={32} />
                            <Bar name="주문량" dataKey="판매량" fill="#CBD5E1" radius={[12, 12, 0, 0]} barSize={32} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="bg-white p-10 rounded-[48px] border border-emerald-100 shadow-xl shadow-emerald-50/50 text-left">
                      <h3 className="font-black text-lg mb-8 flex items-center gap-3 text-emerald-700"><div className="w-1.5 h-6 bg-emerald-500 rounded-full"></div> 월간 조회수(유입) 변화</h3>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyTrend}>
                            <CartesianGrid strokeDasharray="0" vertical={false} stroke="#F1F5F9" />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94A3B8', fontWeight: 800}} dy={10} />
                            <YAxis hide />
                            <Tooltip cursor={{fill: '#ECFDF5', radius: 12}} contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} />
                            <Bar name="조회수" dataKey="조회수" fill="#34D399" radius={[12, 12, 0, 0]} barSize={50} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-xl shadow-slate-200/30 text-left">
                    <h3 className="font-black text-lg flex items-center gap-3 text-emerald-500 mb-10"><div className="w-1.5 h-6 bg-emerald-400 rounded-full"></div> 일별 유입 시계열 흐름</h3>
                    <div className="h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={dailyTrend}>
                          <defs><linearGradient id="colorViewsMain" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/><stop offset="95%" stopColor="#10B981" stopOpacity={0}/></linearGradient></defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis dataKey="date" hide /><YAxis hide /><Tooltip contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)'}} />
                          <Area name="일일 조회수" type="monotone" dataKey="조회수" stroke="#10B981" strokeWidth={5} fillOpacity={1} fill="url(#colorViewsMain)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-[48px] border border-slate-100 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 flex flex-col">
                  <div className="p-8 bg-slate-50/40 flex flex-col md:flex-row gap-6 border-b border-slate-50">
                    <div className="relative flex-1 group">
                      <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 transition-colors" size={20} />
                      <input type="text" placeholder="상품명 또는 ID 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-16 pr-8 py-5 bg-white border border-slate-200 rounded-[28px] focus:outline-none focus:ring-4 focus:ring-emerald-500/5 transition-all font-black shadow-sm" />
                    </div>
                    <button onClick={() => setShowOnlyNameChanged(!showOnlyNameChanged)} className={`px-8 py-5 rounded-[28px] font-black text-sm transition-all whitespace-nowrap shadow-lg flex items-center gap-2 ${showOnlyNameChanged ? 'bg-emerald-600 text-white shadow-emerald-200' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
                      <History size={18} /> 이름 변경 상품만 보기
                    </button>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/20">
                          <th className="px-10 py-6">상품 정보</th>
                          {[{ label: '조회수', key: '상품상세조회수' }, { label: '주문량', key: '결제상품수량' }, { label: '매출액', key: '결제금액' }, { label: '전환율', key: '상세조회대비결제율' }].map(col => (
                            <th key={col.key} className="px-6 py-6 cursor-pointer hover:text-emerald-600 group transition-colors" onClick={() => handleSort(col.key)}>
                              <div className="flex items-center gap-1.5">{col.label}<ArrowUpDown size={12} className={sortConfig.key === col.key ? 'text-emerald-600' : 'text-slate-200 group-hover:text-slate-400'} /></div>
                            </th>
                          ))}
                          <th className="px-10 py-6 text-center">상세</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-left">
                        {sortedData.slice(0, visibleCount).map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 cursor-pointer group transition-colors" onClick={() => setSelectedProduct(item)}>
                            <td className="px-10 py-8 min-w-[350px]">
                              <div className="font-black text-slate-900 group-hover:text-emerald-600 transition-colors flex items-start gap-2 whitespace-normal break-all max-w-[450px] leading-relaxed">
                                {String(item.lastName || '이름 없음')} {Number(item.nameCount) > 1 && <span className="bg-amber-100 text-amber-700 text-[9px] px-2 py-0.5 rounded font-black mt-1 uppercase shrink-0">Modified</span>}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-2 font-black tracking-widest uppercase">ID: {String(item.상품ID || '')}</div>
                            </td>
                            <td className="px-6 py-8 font-black text-slate-700">{(Number(item.상품상세조회수) || 0).toLocaleString()}</td>
                            <td className="px-6 py-8 font-black text-slate-700">{(Number(item.결제상품수량) || 0).toLocaleString()}</td>
                            <td className="px-6 py-8 font-black text-slate-900 italic">₩{(Number(item.결제금액) || 0).toLocaleString()}</td>
                            <td className="px-6 py-8"><span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-lg text-xs font-black">{(Number(item.상세조회대비결제율) * 100).toFixed(2)}%</span></td>
                            <td className="px-10 py-8 text-center"><div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-300 group-hover:bg-emerald-600 group-hover:text-white transition-all mx-auto"><ChevronRight size={18} /></div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {visibleCount < sortedData.length && (
                    <div className="p-6 bg-slate-50/30 flex justify-center border-t border-slate-50">
                      <button onClick={() => setVisibleCount(v => v + 50)} className="px-8 py-3 bg-white border border-slate-200 text-slate-600 rounded-full font-bold text-sm hover:bg-slate-50 hover:text-emerald-600 transition-colors flex items-center gap-2 shadow-sm">
                        데이터 더 보기 <ChevronDown size={16} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* 상품 상세 분석 모달 */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-2xl z-50 flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-7xl max-h-[94vh] rounded-[64px] shadow-2xl border-4 border-white flex flex-col overflow-hidden animate-in zoom-in-95 duration-500">
            <div className="px-12 py-12 flex items-center justify-between border-b border-slate-50 text-left">
              <div className="flex items-center gap-10">
                <div className="bg-emerald-600 p-6 rounded-[32px] text-white shadow-2xl shrink-0"><Eye size={36} /></div>
                <div className="max-w-[800px]">
                  <h3 className="text-3xl font-black text-slate-900 leading-tight whitespace-normal break-words tracking-tighter italic">{String(selectedProduct.lastName || '')}</h3>
                  <p className="text-xs text-slate-400 font-black mt-2 tracking-[0.3em] uppercase opacity-60 italic">PRODUCT IDENTITY: {String(selectedProduct.상품ID || '')}</p>
                </div>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="w-16 h-16 bg-slate-50 hover:bg-white hover:shadow-2xl rounded-full flex items-center justify-center transition-all text-slate-400 border border-transparent hover:border-slate-100 hover:rotate-90 duration-500"><X size={28} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-12 py-12 space-y-16">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                  { label: '누적 유입수', val: `${(Number(selectedProduct.상품상세조회수) || 0).toLocaleString()}회` },
                  { label: '누적 매출액', val: `₩${(Number(selectedProduct.결제금액) || 0).toLocaleString()}` },
                  { label: '누적 주문량', val: `${(Number(selectedProduct.결제상품수량) || 0).toLocaleString()}건` },
                  { label: '평균 전환율', val: `${(Number(selectedProduct.상세조회대비결제율) * 100).toFixed(2)}%` }
                ].map((stat, i) => (
                  <div key={i} className="p-8 rounded-[40px] border shadow-sm bg-slate-50/30 border-slate-50 text-left">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{stat.label}</p>
                    <p className="text-3xl font-black text-slate-900 tracking-tighter">{stat.val}</p>
                  </div>
                ))}
              </div>
              
              {Number(selectedProduct.nameCount) > 1 && Array.isArray(selectedProduct.performanceByName) && (
                <div className="space-y-8 text-left">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shadow-sm"><History size={20} /></div>
                    <h4 className="text-xl font-black text-slate-900 tracking-tight italic">명칭 변경 이력 및 성과 비교</h4>
                  </div>
                  <div className="bg-white rounded-[40px] border border-slate-100 overflow-hidden shadow-2xl">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50/60 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          <th className="px-10 py-6">사용된 상품명</th>
                          <th className="px-4 py-6 text-center">기간</th>
                          <th className="px-4 py-6 text-right">매출액</th>
                          <th className="px-4 py-6 text-right italic text-emerald-600">일평균 매출</th>
                          <th className="px-10 py-6 text-right">전환율</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {selectedProduct.performanceByName.map((p, i) => (
                          <tr key={i} className="hover:bg-slate-50/30 transition-colors font-black">
                            <td className="px-10 py-6 font-bold text-slate-800 italic">{String(p.name || '')}</td>
                            <td className="px-4 py-6 text-center text-slate-400 text-[11px]">
                              {String(p.periodStart || '').replace(/-/g,'.')} - {String(p.periodEnd || '').replace(/-/g,'.')}
                            </td>
                            <td className="px-4 py-6 text-right">₩{(Number(p.totalRevenue) || 0).toLocaleString()}</td>
                            <td className="px-4 py-6 text-right text-emerald-600">₩{Math.round(Number(p.dailyAvgRevenue) || 0).toLocaleString()}</td>
                            <td className="px-4 py-6 text-right">{(Number(p.cvr) || 0).toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {Array.isArray(selectedProduct.history) && selectedProduct.history.length > 0 && (
                <div className="h-80 bg-white p-10 rounded-[56px] border border-slate-100 shadow-2xl text-left">
                  <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 px-4">기간별 유입수 변화 그래프</h4>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={selectedProduct.history}>
                      <defs><linearGradient id="colorProdViews" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.15}/><stop offset="95%" stopColor="#10B981" stopOpacity={0}/></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis dataKey="date" hide /><YAxis hide /><Tooltip contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} /><Area name="조회수" type="monotone" dataKey="조회수" stroke="#10B981" strokeWidth={5} fillOpacity={1} fill="url(#colorProdViews)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="p-12 bg-white border-t border-slate-50 flex justify-center"><button onClick={() => setSelectedProduct(null)} className="px-32 py-6 bg-slate-900 text-white rounded-[32px] font-black text-lg hover:scale-105 transition-all shadow-xl shadow-slate-200">데이터 창 닫기</button></div>
          </div>
        </div>
      )}

      {/* 알림 토스트 */}
      {statusMessage && (
        <div className={`fixed bottom-10 right-10 px-8 py-5 rounded-[28px] shadow-2xl text-white font-black flex items-center gap-4 animate-in slide-in-from-bottom-8 z-[200] ${statusMessage.type === 'error' ? 'bg-rose-500' : statusMessage.type === 'info' ? 'bg-indigo-600' : 'bg-slate-900'}`}>
          {statusMessage.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span className="tracking-tight leading-none">{String(statusMessage.text)}</span>
          <button onClick={() => setStatusMessage(null)} className="ml-4 opacity-50 hover:opacity-100"><X size={18} /></button>
        </div>
      )}
    </div>
  );
};

export default App;

