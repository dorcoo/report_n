import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Upload, Download, BarChart3, TrendingUp, ShoppingCart, 
  Eye, Search, ArrowUpDown, CheckCircle2, AlertCircle, 
  FileSpreadsheet, Calendar, ChevronRight, ChevronLeft, X, LayoutDashboard, 
  History, Info, ArrowUpRight, ArrowDownRight, Minus, Filter, Sparkles, Menu, MousePointer2, Save, Cloud
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, ComposedChart, Line, LineChart
} from 'recharts';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection } from 'firebase/firestore';

// 외부 라이브러리 (SheetJS) 로드
const EXCEL_LIB_URL = "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";

/**
 * [중요] Firebase 설정값
 */
const firebaseConfig = {
  apiKey: "AIzaSyACry7jGKyGz5sEQuEXxUINRwlC585892g",
  authDomain: "sales-dashboard-7e937.firebaseapp.com",
  projectId: "sales-dashboard-7e937",
  storageBucket: "sales-dashboard-7e937.firebasestorage.app",
  messagingSenderId: "738450479038",
  appId: "1:738450479038:web:c1d9fa9b8a9f0da386cbef",
  measurementId: "G-9064EQMDNB"
};

// 전역 변수 설정
const appId = typeof __app_id !== 'undefined' ? __app_id : 'sales-dashboard-app';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const App = () => {
  const [processedData, setProcessedData] = useState([]);
  const [dailyTrend, setDailyTrend] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyNameChanged, setShowOnlyNameChanged] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: '결제금액', direction: 'desc' });
  const [statusMessage, setStatusMessage] = useState(null);
  const [isLibLoaded, setIsLibLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [globalMaxDate, setGlobalMaxDate] = useState('');
  const [user, setUser] = useState(null);

  // 1. 초기 마운트 시 로컬 스토리지에서 데이터 불러오기
  useEffect(() => {
    const savedLocal = localStorage.getItem('sales_dashboard_local_data');
    if (savedLocal) {
      try {
        const parsed = JSON.parse(savedLocal);
        setProcessedData(parsed.processedData || []);
        setDailyTrend(parsed.dailyTrend || []);
        setMonthlyTrend(parsed.monthlyTrend || []);
        setGlobalMaxDate(parsed.globalMaxDate || '');
      } catch (e) {
        console.error("Local load error:", e);
      }
    }

    if (window.XLSX) { setIsLibLoaded(true); return; }
    const script = document.createElement("script");
    script.src = EXCEL_LIB_URL;
    script.onload = () => setIsLibLoaded(true);
    document.head.appendChild(script);
  }, []);

  // 2. 데이터 자동 저장 최적화 (Debouncing 적용)
  useEffect(() => {
    if (processedData.length === 0) return;

    const debounceTimer = setTimeout(() => {
      try {
        const dataToSave = {
          processedData,
          dailyTrend,
          monthlyTrend,
          globalMaxDate,
          lastUpdated: new Date().toISOString()
        };
        localStorage.setItem('sales_dashboard_local_data', JSON.stringify(dataToSave));
      } catch (e) {
        console.error("자동 저장 실패:", e);
      }
    }, 1000);

    return () => clearTimeout(debounceTimer);
  }, [processedData, dailyTrend, monthlyTrend, globalMaxDate]);

  // Firebase 인증
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 로그인 상태 확인 후 클라우드 데이터 불러오기
  useEffect(() => {
    if (!user) return;
    
    const loadFromCloud = async () => {
      try {
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'reports', 'latest');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const savedData = docSnap.data();
          const cloudData = JSON.parse(savedData.processedData || '[]');
          
          if (cloudData.length > 0 && processedData.length === 0) {
            setProcessedData(cloudData);
            setDailyTrend(JSON.parse(savedData.dailyTrend || '[]'));
            setMonthlyTrend(JSON.parse(savedData.monthlyTrend || '[]'));
            setGlobalMaxDate(savedData.globalMaxDate || '');
            setStatusMessage({ type: 'success', text: '클라우드 데이터를 동기화했습니다.' });
          }
        }
      } catch (e) {
        console.error("Data loading failed:", e);
      }
    };
    
    loadFromCloud();
  }, [user]);

  // 클라우드 저장 함수
  const saveToCloud = async () => {
    if (!user || !db) {
      setStatusMessage({ type: 'error', text: '인증되지 않은 사용자입니다.' });
      return;
    }
    
    setIsProcessing(true);
    setStatusMessage({ type: 'info', text: '클라우드 저장 중...' });

    try {
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'reports', 'latest');
      
      const payload = {
        processedData: JSON.stringify(processedData),
        dailyTrend: JSON.stringify(dailyTrend),
        monthlyTrend: JSON.stringify(monthlyTrend),
        globalMaxDate: globalMaxDate,
        updatedAt: new Date().toISOString()
      };

      await setDoc(docRef, payload);
      setStatusMessage({ type: 'success', text: '클라우드 영구 보관 완료!' });
    } catch (err) {
      console.error(err);
      setStatusMessage({ type: 'error', text: '저장 실패: 데이터 용량이 너무 크거나 네트워크 오류입니다.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // 엑셀 분석 로직
  const extractDate = (fileName) => {
    const matches = fileName.match(/\d{4}-\d{1,2}-\d{1,2}/g);
    if (!matches) return '알 수 없는 날짜';
    const normalized = matches.map(m => {
      const parts = m.split('-');
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    });
    return normalized.sort().pop();
  };

  const parseExcel = async (file) => {
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

  const processFiles = async (targetFiles) => {
    if (!isLibLoaded) return;
    setIsProcessing(true);
    
    const productMap = new Map();
    const dailyMap = new Map();
    const monthlyMap = new Map();
    const productDailyHistory = new Map();
    let currentMaxDate = '';

    try {
      for (const file of targetFiles) {
        const dateStr = extractDate(file.name);
        if (dateStr !== '알 수 없는 날짜' && dateStr > currentMaxDate) currentMaxDate = dateStr;
        const monthStr = dateStr !== '알 수 없는 날짜' ? dateStr.substring(0, 7) : '알 수 없는 월';
        const data = await parseExcel(file);

        if (!dailyMap.has(dateStr)) dailyMap.set(dateStr, { date: dateStr, 매출: 0, 조회수: 0, 판매량: 0 });
        if (!monthlyMap.has(monthStr)) monthlyMap.set(monthStr, { month: monthStr, 매출: 0, 조회수: 0, 판매량: 0 });

        data.forEach(item => {
          const pid = String(item['상품ID']);
          if (!pid || pid === "undefined") return;
          const currentName = item['상품명'] || '이름 없음';
          const revenue = Number(item['결제금액']) || 0;
          const views = Number(item['상품상세조회수']) || 0;
          const sales = Number(item['결제상품수량']) || 0;

          if (!productMap.has(pid)) {
            productMap.set(pid, { ...item, 상품ID: pid, 결제금액: revenue, 상품상세조회수: views, 결제상품수량: sales, nameHistory: [{ name: currentName, start: dateStr, end: dateStr }], lastName: currentName, nameCount: 1 });
          } else {
            const p = productMap.get(pid);
            p.결제금액 += revenue; p.상품상세조회수 += views; p.결제상품수량 += sales;
            let nr = p.nameHistory.find(nh => nh.name === currentName);
            if (!nr) { p.nameHistory.push({ name: currentName, start: dateStr, end: dateStr }); p.nameCount = p.nameHistory.length; p.lastName = currentName; }
            else { if (dateStr < nr.start) nr.start = dateStr; if (dateStr > nr.end) nr.end = dateStr; }
          }
          dailyMap.get(dateStr).매출 += revenue; dailyMap.get(dateStr).조회수 += views; dailyMap.get(dateStr).판매량 += sales;
          monthlyMap.get(monthStr).매출 += revenue; monthlyMap.get(monthStr).조회수 += views; monthlyMap.get(monthStr).판매량 += sales;
          if (!productDailyHistory.has(pid)) productDailyHistory.set(pid, []);
          productDailyHistory.get(pid).push({ date: dateStr, 매출: revenue, 조회수: views, 판매량: sales, nameUsed: currentName });
        });
      }

      setGlobalMaxDate(currentMaxDate);
      const finalProducts = Array.from(productMap.values()).map(p => {
        const history = (productDailyHistory.get(p.상품ID) || []).sort((a, b) => a.date.localeCompare(b.date));
        const performanceByName = p.nameHistory.map(nh => {
          const nameData = history.filter(h => h.nameUsed === nh.name);
          const tRev = nameData.reduce((s, h) => s + h.매출, 0);
          const tSales = nameData.reduce((s, h) => s + h.판매량, 0);
          const tViews = nameData.reduce((s, h) => s + h.조회수, 0);
          const days = Math.ceil(Math.abs(new Date(nh.end) - new Date(nh.start)) / (1000 * 60 * 60 * 24)) + 1;
          return { name: nh.name, totalRevenue: tRev, totalSales: tSales, totalViews: tViews, dailyAvgViews: tViews / days, cvr: tViews > 0 ? (tSales / tViews) * 100 : 0, days, periodStart: nh.start, periodEnd: nh.end };
        }).sort((a, b) => a.periodStart.localeCompare(b.periodStart));
        return { ...p, 상세조회대비결제율: p.상품상세조회수 > 0 ? p.결제상품수량 / p.상품상세조회수 : 0, history, performanceByName };
      });

      setProcessedData(finalProducts);
      setDailyTrend(Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)));
      setMonthlyTrend(Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month)));
      setStatusMessage({ type: 'success', text: `데이터 분석 완료!` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: '파일 처리 오류' });
    } finally {
      setIsProcessing(false);
    }
  };

  const summary = useMemo(() => {
    const totalRevenue = processedData.reduce((acc, curr) => acc + curr.결제금액, 0);
    const totalSales = processedData.reduce((acc, curr) => acc + curr.결제상품수량, 0);
    const totalViews = processedData.reduce((acc, curr) => acc + curr.상품상세조회수, 0);
    return { revenue: totalRevenue, sales: totalSales, views: totalViews, dailyAvgViews: dailyTrend.length > 0 ? totalViews / dailyTrend.length : 0, conversionRate: totalViews > 0 ? (totalSales / totalViews) * 100 : 0 };
  }, [processedData, dailyTrend]);

  const sortedData = useMemo(() => {
    let filtered = processedData.filter(p => (p.lastName.includes(searchTerm) || p.상품ID.includes(searchTerm)) && (showOnlyNameChanged ? p.nameCount > 1 : true));
    return filtered.sort((a, b) => (b[sortConfig.key] || 0) - (a[sortConfig.key] || 0));
  }, [processedData, searchTerm, showOnlyNameChanged, sortConfig]);

  const clearData = () => {
    if (confirm("모든 데이터를 삭제하시겠습니까? 로컬 저장소에서도 삭제됩니다.")) {
      setProcessedData([]);
      setDailyTrend([]);
      setMonthlyTrend([]);
      setGlobalMaxDate('');
      localStorage.removeItem('sales_dashboard_local_data');
      setStatusMessage({ type: 'success', text: '데이터가 초기화되었습니다.' });
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-800 font-sans">
      <aside className={`fixed left-0 top-0 h-full bg-white border-r border-slate-100 z-30 flex flex-col transition-all ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <div className="p-6 flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl text-white"><Sparkles size={20} /></div>
          {!isSidebarCollapsed && <h1 className="font-bold text-lg">판매분석 v2</h1>}
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 p-3 rounded-xl ${activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>
            <LayoutDashboard size={20} /> {!isSidebarCollapsed && <span>대시보드</span>}
          </button>
          <button onClick={() => setActiveTab('products')} className={`w-full flex items-center gap-3 p-3 rounded-xl ${activeTab === 'products' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>
            <ShoppingCart size={20} /> {!isSidebarCollapsed && <span>상품분석</span>}
          </button>
        </nav>
        <div className="p-4 space-y-2">
          <div className="relative bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center gap-2">
            <input type="file" multiple accept=".xlsx" onChange={(e) => processFiles(Array.from(e.target.files))} className="absolute inset-0 opacity-0 cursor-pointer" />
            <Upload size={20} className="text-indigo-600" />
            {!isSidebarCollapsed && <span className="text-xs font-bold">엑셀 추가 업로드</span>}
          </div>
          {processedData.length > 0 && !isSidebarCollapsed && (
            <button onClick={clearData} className="w-full flex items-center justify-center gap-2 p-3 text-rose-500 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all">
              데이터 초기화
            </button>
          )}
        </div>
      </aside>

      <main className={`transition-all ${isSidebarCollapsed ? 'pl-20' : 'pl-64'}`}>
        <header className="h-20 bg-white/80 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between px-8 border-b border-slate-50">
          <div className="flex items-center gap-4">
             <h2 className="text-xl font-bold">{activeTab === 'dashboard' ? '종합 리포트' : '상품 상세 리스트'}</h2>
             <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full font-bold uppercase tracking-wider">조회수 중심 분석 모드</span>
          </div>
          <div className="flex gap-2">
            {processedData.length > 0 && (
              <button onClick={saveToCloud} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
                <Cloud size={16} /> 클라우드 영구보관
              </button>
            )}
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto space-y-8">
          {processedData.length === 0 ? (
            <div className="h-[60vh] flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-[40px]">
              <FileSpreadsheet size={64} className="mb-4 opacity-20" />
              <p className="font-medium text-lg text-center px-6">엑셀 파일을 업로드해 주세요. <br/> 유입 데이터 분석을 시작합니다.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                  { label: '누적 매출', val: `₩${summary.revenue.toLocaleString()}`, color: 'indigo' },
                  { label: '누적 유입수', val: `${summary.views.toLocaleString()}회`, color: 'blue' },
                  { label: '일평균 유입', val: `${summary.dailyAvgViews.toFixed(0)}회`, color: 'blue' },
                  { label: '전환율', val: `${summary.conversionRate.toFixed(2)}%`, color: 'rose' }
                ].map((s, i) => (
                  <div key={i} className={`bg-white p-6 rounded-3xl border ${i === 1 || i === 2 ? 'border-blue-100 bg-blue-50/20' : 'border-slate-100'} shadow-sm`}>
                    <p className={`text-[11px] font-bold ${i === 1 || i === 2 ? 'text-blue-500' : 'text-slate-400'} uppercase tracking-wider mb-1`}>{s.label}</p>
                    <p className={`text-2xl font-black text-slate-900`}>{s.val}</p>
                  </div>
                ))}
              </div>

              {activeTab === 'dashboard' ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
                  {/* 월간 성장 추이 그리드 */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* 월간 매출 & 판매량 */}
                    <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                      <h3 className="font-bold mb-6 flex items-center gap-2"><div className="w-1.5 h-5 bg-indigo-600 rounded-full"></div> 월간 매출 성장</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyTrend}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                            <YAxis hide />
                            <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                            <Bar name="매출" dataKey="매출" fill="#4f46e5" radius={[6, 6, 0, 0]} barSize={24} />
                            <Bar name="판매량" dataKey="판매량" fill="#cbd5e1" radius={[6, 6, 0, 0]} barSize={24} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* 월간 조회수 성장 (중요 강조) */}
                    <div className="bg-white p-8 rounded-[32px] border border-blue-100 shadow-lg shadow-blue-50/50">
                      <h3 className="font-bold mb-6 flex items-center gap-2 text-blue-600"><div className="w-1.5 h-5 bg-blue-500 rounded-full"></div> 월간 조회수 성장</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyTrend}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                            <YAxis hide />
                            <Tooltip cursor={{fill: '#eff6ff'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                            <Bar name="조회수" dataKey="조회수" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={40} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* 일별 조회수 시계열 (대형) */}
                  <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                       <h3 className="font-bold flex items-center gap-2"><div className="w-1.5 h-5 bg-blue-400 rounded-full"></div> 일별 유입(조회수) 상세 흐름</h3>
                       <div className="flex items-center gap-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400"></div> Daily Views</div>
                       </div>
                    </div>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={dailyTrend}>
                          <defs>
                            <linearGradient id="colorViewsMain" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="date" hide />
                          <YAxis hide />
                          <Tooltip contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} />
                          <Area type="monotone" dataKey="조회수" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorViewsMain)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
                  <div className="p-6 bg-slate-50/50 flex gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                      <input type="text" placeholder="상품명 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-white border border-slate-100 rounded-2xl focus:outline-none" />
                    </div>
                    <button onClick={() => setShowOnlyNameChanged(!showOnlyNameChanged)} className={`px-6 rounded-2xl font-bold text-sm transition-all ${showOnlyNameChanged ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 border border-slate-100'}`}>명칭 변경 상품</button>
                  </div>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                        <th className="p-6">상품정보</th>
                        <th className="p-6">매출액</th>
                        <th className="p-6">전환율</th>
                        <th className="p-6 text-center">상세</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {sortedData.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 cursor-pointer" onClick={() => setSelectedProduct(item)}>
                          <td className="p-6">
                            <div className="font-bold text-slate-900 flex items-center gap-2">
                              {item.lastName} {item.nameCount > 1 && <span className="bg-amber-100 text-amber-600 text-[10px] px-2 py-0.5 rounded-full">변경</span>}
                            </div>
                            <div className="text-[10px] text-slate-400">ID: {item.상품ID}</div>
                          </td>
                          <td className="p-6 font-black text-slate-700">₩{item.결제금액.toLocaleString()}</td>
                          <td className="p-6 font-bold text-emerald-600">{(item.상세조회대비결제율 * 100).toFixed(2)}%</td>
                          <td className="p-6 text-center text-slate-300"><ChevronRight size={18} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* 상품별 상세 분석 모달 */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-3xl z-50 flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-[48px] shadow-2xl border border-white flex flex-col overflow-hidden animate-in zoom-in-95 duration-500">
            <div className="px-10 py-10 flex items-center justify-between border-b border-slate-50">
              <div className="flex items-center gap-6">
                <div className="bg-blue-600 p-4 rounded-2xl text-white shrink-0">
                  <Eye size={28} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 leading-tight">{selectedProduct.lastName}</h3>
                  <p className="text-xs text-slate-400 font-bold mt-1 tracking-widest uppercase">ID: {selectedProduct.상품ID}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedProduct(null)} 
                className="w-12 h-12 bg-slate-50 hover:bg-white hover:shadow-lg rounded-full flex items-center justify-center transition-all text-slate-400 border border-transparent hover:border-slate-100"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-10 space-y-12">
              {/* 통계 카드 */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: '누적 유입수', val: `${selectedProduct.상품상세조회수}회` },
                  { label: '누적 매출액', val: `₩${selectedProduct.결제금액.toLocaleString()}` },
                  { label: '누적 주문량', val: `${selectedProduct.결제상품수량}건` },
                  { label: '평균 전환율', val: `${(selectedProduct.상세조회대비결제율 * 100).toFixed(2)}%` }
                ].map((stat, i) => (
                  <div key={i} className={`p-6 rounded-3xl border ${i === 0 ? 'bg-blue-50 border-blue-100' : 'bg-slate-50/50 border-slate-50'}`}>
                    <p className={`text-[10px] font-bold ${i === 0 ? 'text-blue-500' : 'text-slate-400'} uppercase tracking-widest mb-1`}>{stat.label}</p>
                    <p className="text-xl font-black text-slate-900 tracking-tight">{stat.val}</p>
                  </div>
                ))}
              </div>

              {/* 명칭 변경 분석 */}
              {selectedProduct.nameCount > 1 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600"><History size={16} /></div>
                    <h4 className="text-lg font-bold text-slate-900">상품명 변경에 따른 유입 성과 비교</h4>
                  </div>
                  <div className="bg-white rounded-[32px] border border-slate-100 overflow-hidden shadow-sm">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase">
                          <th className="px-8 py-4">상품명</th>
                          <th className="px-4 py-4 text-center">기간</th>
                          <th className="px-4 py-4 text-right text-blue-600">총 조회수</th>
                          <th className="px-4 py-4 text-right">매출액</th>
                          <th className="px-4 py-4 text-right">일평균 유입</th>
                          <th className="px-8 py-4 text-right">전환율</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {selectedProduct.performanceByName.map((p, i) => (
                          <tr key={i} className="hover:bg-slate-50/30">
                            <td className="px-8 py-4 font-semibold text-slate-700 italic">"{p.name}"</td>
                            <td className="px-4 py-4 text-center text-slate-400 text-[11px] font-bold">
                              {p.periodStart.slice(5)} - {p.periodEnd === globalMaxDate ? '현재' : p.periodEnd.slice(5)}
                            </td>
                            <td className="px-4 py-4 text-right font-black text-blue-600">{p.totalViews.toLocaleString()}회</td>
                            <td className="px-4 py-4 text-right font-bold text-slate-900">₩{p.totalRevenue.toLocaleString()}</td>
                            <td className="px-4 py-4 text-right font-bold text-indigo-600">{p.dailyAvgViews.toFixed(1)}회</td>
                            <td className="px-8 py-4 text-right font-black text-emerald-600">{p.cvr.toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 유입 추이 차트 */}
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600"><Eye size={16} /></div>
                    <h4 className="text-lg font-bold text-slate-900">일별 조회수 타임라인</h4>
                </div>
                <div className="h-64 bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={selectedProduct.history}>
                      <defs>
                        <linearGradient id="colorProdViews" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" hide />
                      <YAxis hide />
                      <Tooltip contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                      <Area name="조회수" type="monotone" dataKey="조회수" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorProdViews)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            
            <div className="p-8 bg-white border-t border-slate-50 flex justify-center">
              <button onClick={() => setSelectedProduct(null)} className="px-16 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:scale-105 active:scale-95 transition-all shadow-xl">닫기</button>
            </div>
          </div>
        </div>
      )}

      {statusMessage && (
        <div className={`fixed bottom-8 right-8 px-6 py-4 rounded-2xl shadow-2xl text-white font-bold flex items-center gap-3 animate-in slide-in-from-bottom-5 z-[200] ${statusMessage.type === 'error' ? 'bg-rose-500' : statusMessage.type === 'info' ? 'bg-indigo-500' : 'bg-slate-900'}`}>
          {statusMessage.text}
          <button onClick={() => setStatusMessage(null)}><X size={16} /></button>
        </div>
      )}

      {isProcessing && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-[100] flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="font-bold text-slate-600">데이터 처리 중...</p>
        </div>
      )}
    </div>
  );
};

export default App;
