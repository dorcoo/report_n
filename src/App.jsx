import React, { useState, useMemo, useEffect } from 'react';
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

  // 라이브러리 로드
  useEffect(() => {
    if (window.XLSX) { setIsLibLoaded(true); return; }
    const script = document.createElement("script");
    script.src = EXCEL_LIB_URL;
    script.onload = () => setIsLibLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Firebase 인증 (RULE 3 준수)
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
        if (error.code === 'auth/configuration-not-found') {
          setStatusMessage({ 
            type: 'error', 
            text: 'Firebase 설정 오류: 콘솔에서 [Anonymous] 인증을 활성화해야 합니다.' 
          });
        }
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 로그인 상태 확인 후 데이터 자동 불러오기 (RULE 1 & 3 준수)
  useEffect(() => {
    if (!user) return;
    
    const loadFromCloud = async () => {
      try {
        // RULE 1: /artifacts/{appId}/users/{userId}/{collectionName}
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'reports', 'latest');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const savedData = docSnap.data();
          setProcessedData(JSON.parse(savedData.processedData || '[]'));
          setDailyTrend(JSON.parse(savedData.dailyTrend || '[]'));
          setMonthlyTrend(JSON.parse(savedData.monthlyTrend || '[]'));
          setGlobalMaxDate(savedData.globalMaxDate || '');
          setStatusMessage({ type: 'success', text: '클라우드 데이터를 성공적으로 불러왔습니다.' });
        }
      } catch (e) {
        console.error("Data loading failed:", e);
      }
    };
    
    loadFromCloud();
  }, [user]);

  // 클라우드 저장 함수 (RULE 1 준수)
  const saveToCloud = async () => {
    if (!user || !db) {
      setStatusMessage({ type: 'error', text: '인증되지 않은 사용자입니다.' });
      return;
    }
    
    setIsProcessing(true);
    try {
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'reports', 'latest');
      await setDoc(docRef, {
        processedData: JSON.stringify(processedData),
        dailyTrend: JSON.stringify(dailyTrend),
        monthlyTrend: JSON.stringify(monthlyTrend),
        globalMaxDate: globalMaxDate,
        updatedAt: new Date().toISOString()
      });
      setStatusMessage({ type: 'success', text: '클라우드에 안전하게 저장되었습니다.' });
    } catch (err) {
      console.error(err);
      setStatusMessage({ type: 'error', text: '저장 실패: 데이터 용량이 너무 크거나 권한이 없습니다.' });
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
      setStatusMessage({ type: 'success', text: `분석 완료! 클라우드 저장 버튼을 눌러 데이터를 보관하세요.` });
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
        <div className="p-4">
          <div className="relative bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center gap-2">
            <input type="file" multiple accept=".xlsx" onChange={(e) => processFiles(Array.from(e.target.files))} className="absolute inset-0 opacity-0 cursor-pointer" />
            <Upload size={20} className="text-indigo-600" />
            {!isSidebarCollapsed && <span className="text-xs font-bold">엑셀 업로드</span>}
          </div>
        </div>
      </aside>

      <main className={`transition-all ${isSidebarCollapsed ? 'pl-20' : 'pl-64'}`}>
        <header className="h-20 bg-white/80 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between px-8 border-b border-slate-50">
          <h2 className="text-xl font-bold">{activeTab === 'dashboard' ? '종합 리포트' : '상품 상세 리스트'}</h2>
          <div className="flex gap-2">
            {processedData.length > 0 && (
              <button onClick={saveToCloud} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
                <Cloud size={16} /> 클라우드 저장
              </button>
            )}
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto space-y-8">
          {processedData.length === 0 ? (
            <div className="h-[60vh] flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-[40px]">
              <FileSpreadsheet size={64} className="mb-4 opacity-20" />
              <p className="font-medium text-lg text-center px-6">엑셀 파일을 업로드하거나 <br/> 저장된 데이터를 기다려주세요.</p>
              {!user && <p className="text-xs mt-4 text-indigo-400">Firebase 인증 대기 중...</p>}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                  { label: '누적 매출', val: `₩${summary.revenue.toLocaleString()}`, color: 'indigo' },
                  { label: '누적 판매', val: `${summary.sales.toLocaleString()}건`, color: 'emerald' },
                  { label: '일평균 유입', val: `${summary.dailyAvgViews.toFixed(0)}회`, color: 'blue' },
                  { label: '전환율', val: `${summary.conversionRate.toFixed(2)}%`, color: 'rose' }
                ].map((s, i) => (
                  <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">{s.label}</p>
                    <p className={`text-2xl font-black text-slate-900`}>{s.val}</p>
                  </div>
                ))}
              </div>

              {activeTab === 'dashboard' ? (
                <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                  <h3 className="font-bold mb-6 flex items-center gap-2"><div className="w-1.5 h-5 bg-indigo-600 rounded-full"></div> 월간 성장 추이</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyTrend}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                        <YAxis hide />
                        <Tooltip contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="매출" fill="#4f46e5" radius={[6, 6, 0, 0]} barSize={30} />
                      </BarChart>
                    </ResponsiveContainer>
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

      {statusMessage && (
        <div className={`fixed bottom-8 right-8 px-6 py-4 rounded-2xl shadow-2xl text-white font-bold flex items-center gap-3 animate-in slide-in-from-bottom-5 z-[200] ${statusMessage.type === 'error' ? 'bg-rose-500' : 'bg-slate-900'}`}>
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
