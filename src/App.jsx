import React, { useState, useMemo, useEffect } from 'react';
import { 
  Upload, BarChart3, TrendingUp, ShoppingCart, 
  Eye, Search, ArrowUpDown, CheckCircle2, AlertCircle, 
  ChevronRight, X, LayoutDashboard, 
  History, MousePointer2, RefreshCw, Server, Database, ChevronDown, Menu, Clock, Play
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Legend
} from 'recharts';

/**
 * [최종 확정] 서버 주소 설정
 */
const SERVER_URL = 'https://report-backend-0fwr.onrender.com';
const EXCEL_LIB_URL = "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";

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
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [isLibLoaded, setIsLibLoaded] = useState(false);

  // 1. 엑셀 라이브러리 동적 로드 (로컬 처리 및 서버 백업용)
  useEffect(() => {
    if (!document.querySelector(`script[src="${EXCEL_LIB_URL}"]`)) {
      const script = document.createElement("script");
      script.src = EXCEL_LIB_URL;
      script.onload = () => setIsLibLoaded(true);
      document.head.appendChild(script);
    } else {
      setIsLibLoaded(true);
    }
  }, []);

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
    
    const wakingUpTimer = setTimeout(() => setIsWakingUp(true), 4000);
    
    try {
      const response = await fetch(`${SERVER_URL}/api/data`);
      if (!response.ok) throw new Error('서버 응답 오류');
      
      const data = await response.json();
      
      setProcessedData(Array.isArray(data.processedData) ? data.processedData : []);
      setDailyTrend(Array.isArray(data.dailyTrend) ? data.dailyTrend : []);
      setMonthlyTrend(Array.isArray(data.monthlyTrend) ? data.monthlyTrend : []);
      setGlobalMaxDate(String(data.globalMaxDate || ''));
      setIsWakingUp(false);
    } catch (error) {
      console.error("Fetch error:", error);
      setHasConnectionError(true);
      // 서버 연결 실패 시 안내 토스트 제거 (UI에서 별도 표시)
    } finally {
      clearTimeout(wakingUpTimer);
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  /**
   * 로컬에서 파일명 날짜 추출
   */
  const extractDate = (fileName) => {
    const matches = fileName.match(/\d{4}-\d{1,2}-\d{1,2}/g);
    if (!matches) return '알 수 없는 날짜';
    return matches.map(m => {
      const parts = m.split('-');
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }).sort().pop();
  };

  /**
   * 로컬 엑셀 파싱 및 집계 (서버 연결 실패 시 캔버스에서라도 보여주기 위한 백업 로직)
   */
  const processLocally = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = window.XLSX.read(data, { type: 'array' });
          const json = window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
          resolve(json);
        } catch (err) { reject(err); }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  /**
   * 파일 업로드 및 분석 로직 (서버 전송 시도 + 로컬 업데이트 동시 실행)
   */
  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setIsUploading(true);
    setStatusMessage({ type: 'info', text: '데이터를 분석하고 서버로 전송합니다...' });

    try {
      // 1. [로컬 처리] 캔버스에서도 즉시 결과를 볼 수 있게 합니다.
      const productMap = new Map(processedData.map(p => [p.상품ID, { ...p, history: [...(p.history || [])] }]));
      const dailyMap = new Map(dailyTrend.map(d => [d.date, { ...d }]));
      const monthlyMap = new Map(monthlyTrend.map(m => [m.month, { ...m }]));
      let currentMaxDate = globalMaxDate;

      for (const file of files) {
        // 서버 전송 시도
        const formData = new FormData();
        formData.append('excelFile', file);

        let serverSuccess = false;
        try {
          const response = await fetch(`${SERVER_URL}/api/upload`, {
            method: 'POST',
            body: formData,
          });
          if (response.ok) serverSuccess = true;
        } catch (e) {
          console.warn("서버 전송 실패, 로컬 모드로 진행합니다.");
        }

        // 로컬 파싱 (캔버스 미리보기용)
        const rawData = await processLocally(file);
        const dateStr = extractDate(file.name);
        const monthStr = dateStr !== '알 수 없는 날짜' ? dateStr.substring(0, 7) : '알 수 없는 월';
        if (dateStr !== '알 수 없는 날짜' && dateStr > currentMaxDate) currentMaxDate = dateStr;

        if (!dailyMap.has(dateStr)) dailyMap.set(dateStr, { date: dateStr, 매출: 0, 조회수: 0, 판매량: 0 });
        if (!monthlyMap.has(monthStr)) monthlyMap.set(monthStr, { month: monthStr, 매출: 0, 조회수: 0, 판매량: 0 });

        rawData.forEach(item => {
          const pid = String(item['상품ID'] || item['상품번호'] || '');
          if (!pid) return;
          const name = item['상품명'] || '이름 없음';
          const revenue = Number(item['결제금액']) || 0;
          const views = Number(item['상품상세조회수']) || 0;
          const sales = Number(item['결제상품수량']) || 0;

          if (!productMap.has(pid)) {
            productMap.set(pid, { 
              상품ID: pid, lastName: name, 결제금액: revenue, 상품상세조회수: views, 결제상품수량: sales, 
              nameHistory: [{ name: name, start: dateStr, end: dateStr }], nameCount: 1, history: []
            });
          } else {
            const p = productMap.get(pid);
            p.결제금액 += revenue; p.상품상세조회수 += views; p.결제상품수량 += sales;
            if (!p.nameHistory.find(nh => nh.name === name)) {
              p.nameHistory.push({ name: name, start: dateStr, end: dateStr });
              p.nameCount = p.nameHistory.length; p.lastName = name;
            }
          }

          dailyMap.get(dateStr).매출 += revenue; dailyMap.get(dateStr).조회수 += views; dailyMap.get(dateStr).판매량 += sales;
          monthlyMap.get(monthStr).매출 += revenue; monthlyMap.get(monthStr).조회수 += views; monthlyMap.get(monthStr).판매량 += sales;
          
          productMap.get(pid).history.push({ date: dateStr, 매출: revenue, 조회수: views, 판매량: sales, nameUsed: name });
        });
      }

      // 최종 상태 업데이트
      const finalDaily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      const finalMonthly = Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));
      const finalProducts = Array.from(productMap.values()).map(p => {
        const hist = p.history.sort((a, b) => a.date.localeCompare(b.date));
        const performance = p.nameHistory.map(nh => {
          const nameData = hist.filter(h => h.nameUsed === nh.name);
          const tRev = nameData.reduce((s, h) => s + h.매출, 0);
          const tSales = nameData.reduce((s, h) => s + h.판매량, 0);
          const tViews = nameData.reduce((s, h) => s + h.조회수, 0);
          return { 
            name: nh.name, totalRevenue: tRev, totalSales: tSales, totalViews: tViews,
            dailyAvgRevenue: tRev / nameData.length || 0,
            cvr: tViews > 0 ? (tSales / tViews) * 100 : 0,
            periodStart: nh.start, periodEnd: nh.end
          };
        });
        return { ...p, 상세조회대비결제율: p.상품상세조회수 > 0 ? p.결제상품수량 / p.상품상세조회수 : 0, history: hist, performanceByName: performance };
      });

      setProcessedData(finalProducts);
      setDailyTrend(finalDaily);
      setMonthlyTrend(finalMonthly);
      setGlobalMaxDate(currentMaxDate);

      setStatusMessage({ type: 'success', text: '업로드가 완료되었습니다. (서버 연결 실패 시 로컬에 임시 표시됩니다)' });

    } catch (error) {
      console.error("Process error:", error);
      setStatusMessage({ type: 'error', text: '데이터 분석 중 오류가 발생했습니다.' });
    } finally {
      setIsUploading(false);
      event.target.value = null;
    }
  };

  // 통계 요약 연산
  const summary = useMemo(() => {
    const totalRev = processedData.reduce((acc, curr) => acc + (Number(curr.결제금액) || 0), 0);
    const totalSales = processedData.reduce((acc, curr) => acc + (Number(curr.결제상품수량) || 0), 0);
    const totalViews = processedData.reduce((acc, curr) => acc + (Number(curr.상품상세조회수) || 0), 0);
    return { 
      revenue: totalRev, sales: totalSales, views: totalViews, 
      dailyAvgViews: dailyTrend.length > 0 ? totalViews / dailyTrend.length : 0, 
      conversionRate: totalViews > 0 ? (totalSales / totalViews) * 100 : 0 
    };
  }, [processedData, dailyTrend]);

  // 목록 필터링 및 정렬
  const sortedData = useMemo(() => {
    let filtered = processedData.filter(p => 
      (String(p.lastName || '').toLowerCase().includes(searchTerm.toLowerCase()) || String(p.상품ID || '').includes(searchTerm)) && 
      (showOnlyNameChanged ? (Number(p.nameCount) > 1) : true)
    );
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

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 font-sans">
      <aside className={`fixed left-0 top-0 h-full bg-white border-r border-slate-200 z-30 flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <div className="p-6 flex items-center gap-3 border-b border-slate-50">
          <div className="bg-emerald-600 p-2 rounded-xl text-white shadow-xl shrink-0"><Server size={20} /></div>
          {!isSidebarCollapsed && <h1 className="font-black text-xl tracking-tighter text-slate-900 text-left">판매분석 <span className="text-emerald-600 font-bold text-sm ml-1 uppercase italic text-left">PRO</span></h1>}
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-4 p-3.5 rounded-2xl transition-all ${activeTab === 'dashboard' ? 'bg-emerald-50 text-emerald-700 shadow-sm font-bold' : 'text-slate-400 hover:bg-slate-50'}`}>
            <LayoutDashboard size={20} /> {!isSidebarCollapsed && <span>성장 리포트</span>}
          </button>
          <button onClick={() => setActiveTab('products')} className={`w-full flex items-center gap-4 p-3.5 rounded-2xl transition-all ${activeTab === 'products' ? 'bg-emerald-50 text-emerald-700 shadow-sm font-bold' : 'text-slate-400 hover:bg-slate-50'}`}>
            <ShoppingCart size={20} /> {!isSidebarCollapsed && <span>상품 분석</span>}
          </button>
        </nav>

        <div className="p-4 space-y-3 border-t border-slate-50">
          <div className="relative bg-slate-50 p-5 rounded-[24px] border border-slate-100 flex flex-col items-center gap-3 hover:bg-emerald-50 transition-all cursor-pointer group shadow-sm overflow-hidden">
            <input type="file" multiple accept=".xlsx" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" title="파일 선택" disabled={isUploading} />
            <div className={`p-2.5 rounded-xl shadow-md transition-transform ${isUploading ? 'bg-slate-200 animate-pulse' : 'bg-white group-hover:scale-110'}`}>
              <Upload size={22} className={isUploading ? 'text-slate-400' : 'text-emerald-600'} />
            </div>
            {!isSidebarCollapsed && <span className="text-xs font-black text-slate-600 text-center">{isUploading ? '처리 중...' : '엑셀 데이터 업로드'}</span>}
          </div>
          
          {!isSidebarCollapsed && (
            <div className={`px-3 py-3 rounded-xl flex items-center gap-3 shadow-inner text-left ${hasConnectionError ? 'bg-rose-50 border border-rose-100' : 'bg-emerald-50 border border-emerald-100'}`}>
               <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${hasConnectionError ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                 {hasConnectionError ? <AlertCircle size={14} /> : <Database size={14} />}
               </div>
               <div className="min-w-0">
                  <p className={`text-[9px] font-black uppercase tracking-widest leading-none mb-1 ${hasConnectionError ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {hasConnectionError ? 'OFFLINE' : 'LIVE'}
                  </p>
                  <p className={`text-[10px] font-bold truncate ${hasConnectionError ? 'text-rose-800' : 'text-emerald-800'}`}>
                    {hasConnectionError ? '서버 연결 실패' : 'DB 서버 연동 중'}
                  </p>
               </div>
            </div>
          )}
        </div>
      </aside>

      <main className={`transition-all duration-300 ${isSidebarCollapsed ? 'pl-20' : 'pl-64'}`}>
        <header className="h-20 bg-white/80 backdrop-blur-xl sticky top-0 z-20 flex items-center justify-between px-10 border-b border-slate-100">
          <div className="flex items-center gap-4 text-left">
             <h2 className="text-xl font-black text-slate-900 tracking-tight leading-none">{activeTab === 'dashboard' ? '서버 리포트' : '상품 성과 리스트'}</h2>
             <div className="flex items-center gap-2">
               <div className={`h-2 w-2 rounded-full ${isFetching || isUploading ? 'bg-amber-400 animate-pulse' : hasConnectionError ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
               <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded font-black uppercase tracking-widest">Real-time PRO</span>
             </div>
          </div>
          <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="p-2.5 hover:bg-slate-50 rounded-xl transition-all text-slate-400 active:scale-90"><Menu size={22} /></button>
        </header>

        <div className="p-10 max-w-[1500px] mx-auto space-y-10">
          {isFetching && processedData.length === 0 ? (
            <div className="h-[60vh] flex flex-col items-center justify-center">
              <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="font-black text-slate-400 tracking-widest uppercase text-xs mt-4">
                {isWakingUp ? '서버가 깨어나는 중입니다 (최대 1분)...' : '데이터를 불러오고 있습니다...'}
              </p>
            </div>
          ) : (processedData.length === 0 && !hasConnectionError) ? (
            <div className="h-[70vh] flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-200 rounded-[56px] bg-white shadow-2xl">
              <div className="bg-slate-50 p-8 rounded-full mb-8 text-indigo-200"><Database size={64} /></div>
              <h3 className="text-2xl font-black text-slate-900 mb-2 italic text-center">데이터베이스가 비어있습니다.</h3>
              <p className="text-slate-400 font-medium">엑셀 파일을 업로드하면 분석이 시작됩니다.</p>
            </div>
          ) : (
            <>
              {/* 요약 대시보드 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                  { label: '누적 매출액', val: `₩${summary.revenue.toLocaleString()}`, icon: TrendingUp },
                  { label: '누적 유입수', val: `${summary.views.toLocaleString()}회`, icon: Eye },
                  { label: '일평균 유입', val: `${summary.dailyAvgViews.toFixed(0)}회`, icon: MousePointer2 },
                  { label: '평균 결제 전환율', val: `${summary.conversionRate.toFixed(2)}%`, icon: CheckCircle2 }
                ].map((s, i) => (
                  <div key={i} className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl shadow-slate-200/40 hover:translate-y-[-4px] transition-all group text-left">
                    <div className="flex justify-between items-start mb-6 text-left">
                      <div className="p-4 rounded-3xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors text-left"><s.icon size={24} /></div>
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest text-left">PRO METRIC</span>
                    </div>
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1 text-left">{s.label}</p>
                    <h4 className="text-3xl font-black text-slate-900 tracking-tighter text-left">{s.val}</h4>
                  </div>
                ))}
              </div>

              {activeTab === 'dashboard' ? (
                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-xl text-left">
                      <h3 className="font-black text-lg mb-8 flex items-center gap-3 text-left"><div className="w-1.5 h-6 bg-emerald-600 rounded-full text-left"></div> 월간 매출 성장</h3>
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
                      <h3 className="font-black text-lg mb-8 flex items-center gap-3 text-emerald-700 text-left"><div className="w-1.5 h-6 bg-emerald-500 rounded-full text-left"></div> 월간 유입수 변화</h3>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyTrend}>
                            <CartesianGrid strokeDasharray="0" vertical={false} stroke="#F1F5F9" />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94A3B8', fontWeight: 800}} dy={10} />
                            <YAxis hide />
                            <Tooltip cursor={{fill: '#ECFDF5', radius: 12}} contentStyle={{borderRadius: '24px', border: 'none'}} />
                            <Bar name="조회수" dataKey="조회수" fill="#34D399" radius={[12, 12, 0, 0]} barSize={50} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-[48px] border border-slate-100 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 flex flex-col text-left">
                  <div className="p-8 bg-slate-50/40 flex flex-col md:flex-row gap-6 border-b border-slate-50 text-left">
                    <div className="relative flex-1 group text-left">
                      <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 transition-colors text-left" size={20} />
                      <input type="text" placeholder="상품명 또는 ID 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-16 pr-8 py-5 bg-white border border-slate-200 rounded-[28px] focus:outline-none focus:ring-4 focus:ring-emerald-500/5 transition-all font-black shadow-sm text-left" />
                    </div>
                    <button onClick={() => setShowOnlyNameChanged(!showOnlyNameChanged)} className={`px-8 py-5 rounded-[28px] font-black text-sm transition-all shadow-lg flex items-center gap-2 ${showOnlyNameChanged ? 'bg-emerald-600 text-white shadow-emerald-200' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
                      <History size={18} /> 이름 변경 상품만 보기
                    </button>
                  </div>
                  <div className="overflow-x-auto text-left">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/20 text-left">
                          <th className="px-10 py-6 text-left">상품 정보</th>
                          <th className="px-6 py-6 text-left cursor-pointer hover:text-emerald-600" onClick={() => handleSort('상품상세조회수')}>조회수</th>
                          <th className="px-6 py-6 text-left cursor-pointer hover:text-emerald-600" onClick={() => handleSort('결제상품수량')}>주문량</th>
                          <th className="px-6 py-6 text-left cursor-pointer hover:text-emerald-600" onClick={() => handleSort('결제금액')}>매출액</th>
                          <th className="px-10 py-6 text-center text-left">상세</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-left">
                        {sortedData.slice(0, visibleCount).map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 cursor-pointer text-left" onClick={() => setSelectedProduct(item)}>
                            <td className="px-10 py-8 text-left">
                              <div className="font-black text-slate-900 group-hover:text-emerald-600 transition-colors text-left leading-relaxed">
                                {item.lastName} {Number(item.nameCount) > 1 && <span className="bg-amber-100 text-amber-700 text-[9px] px-2 py-0.5 rounded font-black mt-1 uppercase text-left">MODIFIED</span>}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-2 font-black tracking-widest text-left">ID: {item.상품ID}</div>
                            </td>
                            <td className="px-6 py-8 font-black text-slate-700 text-left">{(item.상품상세조회수 || 0).toLocaleString()}</td>
                            <td className="px-6 py-8 font-black text-slate-700 text-left">{(item.결제상품수량 || 0).toLocaleString()}</td>
                            <td className="px-6 py-8 font-black text-slate-900 italic text-left">₩{(item.결제금액 || 0).toLocaleString()}</td>
                            <td className="px-10 py-8 text-center text-left"><div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-300 mx-auto text-left"><ChevronRight size={18} /></div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* 상품 상세 모달 */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-2xl z-50 flex items-center justify-center p-8 animate-in fade-in duration-300 text-left">
          <div className="bg-white w-full max-w-7xl max-h-[94vh] rounded-[64px] shadow-2xl border-4 border-white flex flex-col overflow-hidden text-left">
            <div className="px-12 py-12 flex items-center justify-between border-b border-slate-50 text-left">
              <div className="flex items-center gap-10 text-left">
                <div className="bg-emerald-600 p-6 rounded-[32px] text-white shadow-2xl text-left"><Eye size={36} /></div>
                <div className="text-left">
                  <h3 className="text-3xl font-black text-slate-900 leading-tight text-left italic">{selectedProduct.lastName}</h3>
                  <p className="text-xs text-slate-400 font-black mt-2 tracking-[0.3em] uppercase opacity-60 text-left">PID: {selectedProduct.상품ID}</p>
                </div>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="w-16 h-16 bg-slate-50 hover:bg-white hover:shadow-2xl rounded-full flex items-center justify-center text-left"><X size={28} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-12 py-12 space-y-16 text-left">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-left">
                {[{ label: '누적 유입수', val: `${(selectedProduct.상품상세조회수 || 0).toLocaleString()}회` }, { label: '누적 매출액', val: `₩${(selectedProduct.결제금액 || 0).toLocaleString()}` }, { label: '누적 주문량', val: `${(selectedProduct.결제상품수량 || 0).toLocaleString()}건` }, { label: '평균 전환율', val: `${(Number(selectedProduct.상세조회대비결제율) * 100).toFixed(2)}%` }].map((stat, i) => (
                  <div key={i} className="p-8 rounded-[40px] border shadow-sm bg-slate-50/30 border-slate-50 text-left">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 text-left">{stat.label}</p>
                    <p className="text-3xl font-black text-slate-900 tracking-tighter text-left">{stat.val}</p>
                  </div>
                ))}
              </div>
              {Array.isArray(selectedProduct.performanceByName) && (
                <div className="space-y-8 text-left">
                  <div className="flex items-center gap-4 text-left"><History size={20} className="text-emerald-600" /><h4 className="text-xl font-black text-slate-900 tracking-tight text-left italic">명칭 변경 이력 분석</h4></div>
                  <div className="bg-white rounded-[40px] border border-slate-100 overflow-hidden shadow-2xl text-left">
                    <table className="w-full text-left text-sm text-left">
                      <thead>
                        <tr className="bg-slate-50/60 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left"><th className="px-10 py-6 text-left">상품명</th><th className="px-4 py-6 text-left">사용 기간</th><th className="px-4 py-6 text-right text-left">매출액</th><th className="px-10 py-6 text-right text-left">전환율</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-left">
                        {selectedProduct.performanceByName.map((p, i) => (
                          <tr key={i} className="hover:bg-slate-50/30 transition-colors font-black text-left"><td className="px-10 py-6 font-bold text-slate-800 text-left">{p.name}</td><td className="px-4 py-6 text-slate-400 text-[11px] text-left">{p.periodStart} - {p.periodEnd}</td><td className="px-4 py-6 text-right text-left">₩{(p.totalRevenue || 0).toLocaleString()}</td><td className="px-10 py-6 text-right text-left">{(p.cvr || 0).toFixed(2)}%</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="p-12 bg-white border-t border-slate-50 flex justify-center text-left"><button onClick={() => setSelectedProduct(null)} className="px-32 py-6 bg-slate-900 text-white rounded-[32px] font-black text-lg shadow-xl text-left">창 닫기</button></div>
          </div>
        </div>
      )}

      {/* 알림 토스트 */}
      {statusMessage && (
        <div className={`fixed bottom-10 right-10 px-8 py-5 rounded-[28px] shadow-2xl text-white font-black flex items-center gap-4 animate-in slide-in-from-bottom-8 z-[200] ${statusMessage.type === 'error' ? 'bg-rose-500' : 'bg-slate-900'} text-left`}>
          {statusMessage.type === 'error' ? <AlertCircle size={20} className="text-left" /> : <CheckCircle2 size={20} className="text-left" />}
          <span className="tracking-tight leading-none text-left">{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="ml-4 opacity-50 hover:opacity-100 text-left"><X size={18} /></button>
        </div>
      )}
    </div>
  );
};

export default App;
