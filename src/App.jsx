import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Upload, Download, BarChart3, TrendingUp, ShoppingCart, 
  Eye, Search, ArrowUpDown, CheckCircle2, AlertCircle, 
  FileSpreadsheet, Calendar, ChevronRight, ChevronLeft, X, LayoutDashboard, 
  History, Info, ArrowUpRight, ArrowDownRight, Minus, Filter, Sparkles, Menu, MousePointer2, Save, Cloud, RefreshCw, DollarSign, Users
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, ComposedChart, Line, LineChart
} from 'recharts';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, writeBatch, onSnapshot, deleteDoc } from 'firebase/firestore';

// 외부 라이브러리 (데이터 파싱 및 초고효율 압축)
const EXCEL_LIB_URL = "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";
const COMPRESS_LIB_URL = "https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.5.0/lz-string.min.js";

/**
 * Firebase 설정
 */
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "AIzaSyACry7jGKyGz5sEQuEXxUINRwlC585892g",
      authDomain: "sales-dashboard-7e937.firebaseapp.com",
      projectId: "sales-dashboard-7e937",
      storageBucket: "sales-dashboard-7e937.firebasestorage.app",
      messagingSenderId: "738450479038",
      appId: "1:738450479038:web:c1d9fa9b8a9f0da386cbef",
    };

const appId = typeof __app_id !== 'undefined' ? __app_id : 'sales-dashboard-app';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const App = () => {
  // --- 데이터 상태 ---
  const [processedData, setProcessedData] = useState([]);
  const [dailyTrend, setDailyTrend] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [globalMaxDate, setGlobalMaxDate] = useState('');
  
  // --- UI 및 진행 상태 ---
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyNameChanged, setShowOnlyNameChanged] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: '상품상세조회수', direction: 'desc' });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  
  // --- 인프라 상태 ---
  const [user, setUser] = useState(null);
  const [isLibLoaded, setIsLibLoaded] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // 실시간 구독 충돌 방지를 위한 Ref
  const isProcessingRef = useRef(false);
  const isSyncingRef = useRef(false);

  const setProcessingState = (val) => { setIsProcessing(val); isProcessingRef.current = val; };
  const setSyncingState = (val) => { setIsSyncing(val); isSyncingRef.current = val; };

  // 1. 외부 라이브러리 안전 로드
  useEffect(() => {
    const loadScripts = async () => {
      const scripts = [EXCEL_LIB_URL, COMPRESS_LIB_URL];
      for (const src of scripts) {
        if (!document.querySelector(`script[src="${src}"]`)) {
          await new Promise(resolve => {
            const script = document.createElement("script");
            script.src = src;
            script.onload = resolve;
            document.head.appendChild(script);
          });
        }
      }
      setIsLibLoaded(true);
    };
    loadScripts();
  }, []);

  // 2. 인증 관리 (익명 로그인 보장)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) { 
        console.error("인증 오류:", error); 
        setStatusMessage({ type: 'error', text: '인증 실패: 콘솔에서 Anonymous 로그인을 활성화해주세요.' });
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setIsInitialLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 3. 진정한 '공용 데이터베이스' 실시간 동기화 (로컬 캐시 배제)
  useEffect(() => {
    if (!user) return;
    
    // 모두가 공유하는 유일한 메타데이터 경로
    const metaRef = doc(db, 'artifacts', appId, 'public', 'data', 'shared_reports', 'metadata');
    
    const unsubscribe = onSnapshot(metaRef, async (metaSnap) => {
      // 내가 데이터를 올리고 있거나 파싱 중일 때는 화면 덮어쓰기 방지
      if (isProcessingRef.current || isSyncingRef.current) return;
      
      if (metaSnap.exists() && window.LZString) {
        setIsInitialLoading(true);
        try {
          const meta = metaSnap.data();
          const chunkCount = meta.chunkCount || 0;
          
          let chunkPromises = [];
          for (let i = 0; i < chunkCount; i++) {
            chunkPromises.push(getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shared_payloads', `chunk_${i}`)));
          }
          
          const snaps = await Promise.all(chunkPromises);
          const fullPayload = snaps.map(s => s.exists() ? s.data().data : "").join("");
          
          const decompressed = window.LZString.decompressFromUTF16(fullPayload);
          if (decompressed) {
            const parsed = JSON.parse(decompressed);
            setProcessedData(parsed.processedData || []);
            setDailyTrend(parsed.dailyTrend || []);
            setMonthlyTrend(parsed.monthlyTrend || []);
            setGlobalMaxDate(parsed.globalMaxDate || '');
            
            // 데이터가 비어있지 않을 때만 성공 알림
            if (parsed.processedData?.length > 0) {
              setStatusMessage({ type: 'success', text: '팀 워크스페이스의 최신 데이터를 불러왔습니다.' });
            }
          }
        } catch(e) {
          console.error("Cloud fetch error:", e);
          setStatusMessage({ type: 'error', text: '데이터 동기화에 실패했습니다.' });
        } finally {
          setIsInitialLoading(false);
        }
      } else if (!metaSnap.exists()) {
        // 공용 DB가 지워졌을 경우 화면 즉시 클리어
        setProcessedData([]);
        setIsInitialLoading(false);
      }
    }, (error) => {
      console.error("Snapshot error:", error);
      setIsInitialLoading(false);
    });

    return () => unsubscribe();
  }, [user, db]);

  // --- 공용 클라우드 분할 저장 로직 (1MB 돌파의 핵심) ---
  const performCloudSync = async (dataObj) => {
    if (!user || !db || !window.LZString) return;
    
    setSyncingState(true);
    setStatusMessage({ type: 'info', text: '데이터를 분할하여 팀원들에게 배포하고 있습니다...' });
    
    try {
      const payloadString = JSON.stringify(dataObj);
      const compressedPayload = window.LZString.compressToUTF16(payloadString);
      
      // [핵심 변경] Firestore 1MB 제한을 확실하게 피하기 위해 약 500KB(25만자) 단위로 더 잘게 쪼갬
      const chunkSize = 250000; 
      const chunks = [];
      for (let i = 0; i < compressedPayload.length; i += chunkSize) {
        chunks.push(compressedPayload.substring(i, i + chunkSize));
      }

      // 1. 공용 공간에 순차적으로 조각 저장 (네트워크 안정성 확보)
      for (let i = 0; i < chunks.length; i++) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shared_payloads', `chunk_${i}`), { data: chunks[i] });
      }

      // 2. 메타데이터 최종 업데이트 (이 순간 다른 팀원들의 화면이 일제히 업데이트 됨)
      const metaRef = doc(db, 'artifacts', appId, 'public', 'data', 'shared_reports', 'metadata');
      await setDoc(metaRef, {
        chunkCount: chunks.length,
        updatedAt: new Date().toISOString(),
        originalSize: payloadString.length,
        authorId: user.uid
      });
      
      setStatusMessage({ type: 'success', text: '모든 사람의 대시보드에 최신 데이터가 반영되었습니다!' });
    } catch (err) { 
      console.error("Sync error:", err);
      setStatusMessage({ type: 'error', text: '클라우드 저장 실패: 용량이 너무 크거나 인터넷 연결이 불안정합니다.' });
    } finally { 
      setSyncingState(false); 
    }
  };

  // --- 엑셀 가공 로직 (누적 병합) ---
  const extractDate = (fileName) => {
    const matches = fileName.match(/\d{4}-\d{1,2}-\d{1,2}/g);
    if (!matches) return '알 수 없는 날짜';
    return matches.map(m => {
      const parts = m.split('-');
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }).sort().pop();
  };

  const parseExcel = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = window.XLSX.read(data, { type: 'array' });
          resolve(window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]));
        } catch (err) { reject(err); }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const processFiles = async (targetFiles) => {
    if (!isLibLoaded) return;
    setProcessingState(true);
    
    const productMap = new Map();
    const dailyMap = new Map();
    const monthlyMap = new Map();
    const productDailyHistory = new Map();
    let currentMaxDate = globalMaxDate;

    // 공용 DB에 있던 기존 데이터를 바탕으로 맵 생성 (누적)
    processedData.forEach(p => {
      productMap.set(p.상품ID, { ...p });
      productDailyHistory.set(p.상품ID, [...(p.history || [])]);
    });
    dailyTrend.forEach(d => dailyMap.set(d.date, { ...d }));
    monthlyTrend.forEach(m => monthlyMap.set(m.month, { ...m }));

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
            if (!nr) { 
              p.nameHistory.push({ name: currentName, start: dateStr, end: dateStr }); 
              p.nameCount = p.nameHistory.length; p.lastName = currentName; 
            } else {
              if (dateStr < nr.start) nr.start = dateStr;
              if (dateStr > nr.end) nr.end = dateStr;
            }
          }
          
          dailyMap.get(dateStr).매출 += revenue; dailyMap.get(dateStr).조회수 += views; dailyMap.get(dateStr).판매량 += sales;
          monthlyMap.get(monthStr).매출 += revenue; monthlyMap.get(monthStr).조회수 += views; monthlyMap.get(monthStr).판매량 += sales;
          
          if (!productDailyHistory.has(pid)) productDailyHistory.set(pid, []);
          const pHist = productDailyHistory.get(pid);
          const existingDay = pHist.find(h => h.date === dateStr);
          if (existingDay) { existingDay.매출 += revenue; existingDay.조회수 += views; existingDay.판매량 += sales; }
          else { pHist.push({ date: dateStr, 매출: revenue, 조회수: views, 판매량: sales, nameUsed: currentName }); }
        });
      }

      const finalDailyTrend = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      const finalMonthlyTrend = Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));
      const finalProducts = Array.from(productMap.values()).map(p => {
        const history = (productDailyHistory.get(p.상품ID) || []).sort((a, b) => a.date.localeCompare(b.date));
        const performanceByName = p.nameHistory.map(nh => {
          const nameData = history.filter(h => h.nameUsed === nh.name);
          const tRev = nameData.reduce((s, h) => s + h.매출, 0);
          const tSales = nameData.reduce((s, h) => s + h.판매량, 0);
          const tViews = nameData.reduce((s, h) => s + h.조회수, 0);
          const days = Math.ceil(Math.abs(new Date(nh.end) - new Date(nh.start)) / (1000 * 60 * 60 * 24)) + 1;
          return { 
            name: nh.name, totalRevenue: tRev, totalSales: tSales, totalViews: tViews, 
            dailyAvgViews: tViews / days, dailyAvgRevenue: tRev / days,
            cvr: tViews > 0 ? (tSales / tViews) * 100 : 0, days, periodStart: nh.start, periodEnd: nh.end 
          };
        }).sort((a, b) => a.periodStart.localeCompare(b.periodStart));
        return { ...p, 상세조회대비결제율: p.상품상세조회수 > 0 ? p.결제상품수량 / p.상품상세조회수 : 0, history, performanceByName };
      });

      // UI 업데이트 후 파일 읽기 종료
      setProcessedData(finalProducts);
      setDailyTrend(finalDailyTrend);
      setMonthlyTrend(finalMonthlyTrend);
      setGlobalMaxDate(currentMaxDate);
      setProcessingState(false);

      // 브라우저 백그라운드에서 동기화 수행
      performCloudSync({ processedData: finalProducts, dailyTrend: finalDailyTrend, monthlyTrend: finalMonthlyTrend, globalMaxDate: currentMaxDate });
      
    } catch (err) { 
      console.error(err);
      setProcessingState(false);
      setStatusMessage({ type: 'error', text: '데이터 가공 중 오류가 발생했습니다.' }); 
    }
  };

  // --- 집계 데이터 ---
  const summary = useMemo(() => {
    const totalRev = processedData.reduce((acc, curr) => acc + curr.결제금액, 0);
    const totalSales = processedData.reduce((acc, curr) => acc + curr.결제상품수량, 0);
    const totalViews = processedData.reduce((acc, curr) => acc + curr.상품상세조회수, 0);
    return { revenue: totalRev, sales: totalSales, views: totalViews, dailyAvgViews: dailyTrend.length > 0 ? totalViews / dailyTrend.length : 0, conversionRate: totalViews > 0 ? (totalSales / totalViews) * 100 : 0 };
  }, [processedData, dailyTrend]);

  const sortedData = useMemo(() => {
    let filtered = processedData.filter(p => (p.lastName.toLowerCase().includes(searchTerm.toLowerCase()) || p.상품ID.includes(searchTerm)) && (showOnlyNameChanged ? p.nameCount > 1 : true));
    if (sortConfig.key) {
      filtered.sort((a, b) => (sortConfig.direction === 'asc' ? (a[sortConfig.key] || 0) - (b[sortConfig.key] || 0) : (b[sortConfig.key] || 0) - (a[sortConfig.key] || 0)));
    }
    return filtered;
  }, [processedData, searchTerm, showOnlyNameChanged, sortConfig]);

  const handleSort = (key) => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));

  const clearData = async () => {
    if (window.confirm("공용 데이터베이스의 모든 데이터를 초기화하시겠습니까?\n접속한 모든 사용자의 화면에서도 실시간으로 데이터가 지워집니다.")) {
      setProcessedData([]); setDailyTrend([]); setMonthlyTrend([]); setGlobalMaxDate('');
      
      try {
        const metaRef = doc(db, 'artifacts', appId, 'public', 'data', 'shared_reports', 'metadata');
        await deleteDoc(metaRef);
        setStatusMessage({ type: 'success', text: '공용 데이터가 완전히 초기화되었습니다.' });
      } catch(e) {
        console.error("Delete error", e);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 font-sans">
      <aside className={`fixed left-0 top-0 h-full bg-white border-r border-slate-200 z-30 flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <div className="p-6 flex items-center gap-3 border-b border-slate-50">
          <div className="bg-blue-600 p-2 rounded-xl text-white shadow-xl shrink-0 transition-transform active:scale-95"><Users size={20} /></div>
          {!isSidebarCollapsed && <h1 className="font-black text-xl tracking-tighter text-slate-900">판매분석 <span className="text-blue-600 font-bold text-sm ml-1 uppercase italic">TEAM</span></h1>}
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-4 p-3.5 rounded-2xl transition-all ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-700 shadow-sm font-bold' : 'text-slate-400 hover:bg-slate-50'}`}>
            <LayoutDashboard size={20} /> {!isSidebarCollapsed && <span>공용 성장 리포트</span>}
          </button>
          <button onClick={() => setActiveTab('products')} className={`w-full flex items-center gap-4 p-3.5 rounded-2xl transition-all ${activeTab === 'products' ? 'bg-blue-50 text-blue-700 shadow-sm font-bold' : 'text-slate-400 hover:bg-slate-50'}`}>
            <ShoppingCart size={20} /> {!isSidebarCollapsed && <span>상품별 분석</span>}
          </button>
        </nav>

        <div className="p-4 space-y-3 border-t border-slate-50">
          <div className="relative bg-slate-50 p-5 rounded-[24px] border border-slate-100 flex flex-col items-center gap-3 hover:bg-blue-50 hover:border-blue-100 transition-all cursor-pointer group shadow-sm overflow-hidden">
            <input type="file" multiple accept=".xlsx" onChange={(e) => processFiles(Array.from(e.target.files))} className="absolute inset-0 opacity-0 cursor-pointer z-10" title="엑셀 파일 추가" />
            <div className="bg-white p-2.5 rounded-xl shadow-md group-hover:scale-110 transition-transform"><Upload size={22} className="text-blue-600" /></div>
            {!isSidebarCollapsed && <span className="text-xs font-black text-slate-600">공용 데이터 합치기</span>}
          </div>
          {!isSidebarCollapsed && (
            <div className="px-3 py-3 bg-blue-50/50 border border-blue-100 rounded-xl flex items-center gap-3 shadow-inner">
               <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0"><Cloud size={14} /></div>
               <div className="min-w-0">
                  <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest leading-none mb-1">Public Workspace</p>
                  <p className="text-[10px] text-blue-700 font-bold truncate">모두와 연결되어 있습니다</p>
               </div>
            </div>
          )}
          {processedData.length > 0 && !isSidebarCollapsed && (
            <button onClick={clearData} className="w-full flex items-center justify-center gap-2 p-3 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all underline underline-offset-4">모두의 데이터 지우기</button>
          )}
        </div>
      </aside>

      <main className={`transition-all duration-300 ${isSidebarCollapsed ? 'pl-20' : 'pl-64'}`}>
        <header className="h-20 bg-white/80 backdrop-blur-xl sticky top-0 z-20 flex items-center justify-between px-10 border-b border-slate-100">
          <div className="flex items-center gap-4">
             <h2 className="text-xl font-black text-slate-900 tracking-tight leading-none">{activeTab === 'dashboard' ? '모두가 보는 성장 리포트' : '상품 성과 상세'}</h2>
             <div className="flex items-center gap-2">
               <div className={`h-2 w-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`}></div>
               <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded font-black uppercase tracking-widest">Shared Board</span>
               {isSyncing && <div className="flex items-center gap-1.5 text-[10px] text-blue-500 font-black animate-pulse"><RefreshCw size={10} className="animate-spin" /> 팀 전체에 배포 중...</div>}
             </div>
          </div>
          <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="p-2.5 hover:bg-slate-50 rounded-xl transition-all text-slate-400 active:scale-90"><Menu size={22} /></button>
        </header>

        <div className="p-10 max-w-[1500px] mx-auto space-y-10">
          {isInitialLoading ? (
            <div className="h-[60vh] flex flex-col items-center justify-center">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="font-black text-slate-400 tracking-widest uppercase text-xs">공용 데이터베이스 불러오는 중...</p>
            </div>
          ) : processedData.length === 0 ? (
            <div className="h-[70vh] flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-200 rounded-[56px] bg-white shadow-2xl">
              <div className="bg-slate-50 p-8 rounded-full mb-8"><FileSpreadsheet size={64} className="text-blue-200" /></div>
              <h3 className="text-2xl font-black text-slate-900 mb-2 italic">팀 워크스페이스가 비어있습니다.</h3>
              <p className="text-slate-400 font-medium text-center">엑셀 파일을 업로드하여 팀원들과 분석 데이터를 공유하세요.<br/>한 명만 올려도 모두의 화면에 실시간으로 보입니다.</p>
            </div>
          ) : (
            <>
              {/* 핵심 요약 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                  { label: '누적 매출액', val: `₩${summary.revenue.toLocaleString()}`, color: 'indigo', icon: TrendingUp },
                  { label: '누적 유입수', val: `${summary.views.toLocaleString()}회`, color: 'blue', icon: Eye },
                  { label: '일평균 유입', val: `${summary.dailyAvgViews.toFixed(0)}회`, color: 'sky', icon: MousePointer2 },
                  { label: '평균 결제 전환율', val: `${summary.conversionRate.toFixed(2)}%`, color: 'rose', icon: CheckCircle2 }
                ].map((s, i) => (
                  <div key={i} className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl shadow-slate-200/40 hover:translate-y-[-4px] transition-all group">
                    <div className="flex justify-between items-start mb-6">
                      <div className={`p-4 rounded-3xl bg-${s.color}-50 text-${s.color}-600 group-hover:bg-blue-600 group-hover:text-white transition-colors`}><s.icon size={24} /></div>
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
                    <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-xl">
                      <h3 className="font-black text-lg mb-8 flex items-center gap-3"><div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div> 월간 매출 성장</h3>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyTrend}>
                            <CartesianGrid strokeDasharray="0" vertical={false} stroke="#F1F5F9" />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94A3B8', fontWeight: 800}} dy={10} />
                            <YAxis hide />
                            <Tooltip cursor={{fill: '#F8FAFC', radius: 12}} contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} />
                            <Bar name="매출액" dataKey="매출" fill="#4F46E5" radius={[12, 12, 0, 0]} barSize={32} />
                            <Bar name="주문량" dataKey="판매량" fill="#CBD5E1" radius={[12, 12, 0, 0]} barSize={32} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="bg-white p-10 rounded-[48px] border border-blue-100 shadow-xl shadow-blue-50/50">
                      <h3 className="font-black text-lg mb-8 flex items-center gap-3 text-blue-700"><div className="w-1.5 h-6 bg-blue-500 rounded-full"></div> 월간 조회수 성장</h3>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyTrend}>
                            <CartesianGrid strokeDasharray="0" vertical={false} stroke="#F1F5F9" />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94A3B8', fontWeight: 800}} dy={10} />
                            <YAxis hide />
                            <Tooltip cursor={{fill: '#EFF6FF', radius: 12}} contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} />
                            <Bar name="조회수" dataKey="조회수" fill="#3B82F6" radius={[12, 12, 0, 0]} barSize={50} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-xl shadow-slate-200/30">
                    <h3 className="font-black text-lg flex items-center gap-3 text-blue-500 mb-10"><div className="w-1.5 h-6 bg-blue-400 rounded-full"></div> 일별 유입(조회수) 시계열 흐름</h3>
                    <div className="h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={dailyTrend}>
                          <defs><linearGradient id="colorViewsMain" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2}/><stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/></linearGradient></defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis dataKey="date" hide /><YAxis hide /><Tooltip contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)'}} />
                          <Area name="일일 조회수" type="monotone" dataKey="조회수" stroke="#3B82F6" strokeWidth={5} fillOpacity={1} fill="url(#colorViewsMain)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-[48px] border border-slate-100 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500">
                  <div className="p-8 bg-slate-50/40 flex flex-col md:flex-row gap-6 border-b border-slate-50">
                    <div className="relative flex-1 group">
                      <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 transition-colors" size={20} />
                      <input type="text" placeholder="검색: 상품명 또는 ID..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-16 pr-8 py-5 bg-white border border-slate-200 rounded-[28px] focus:outline-none focus:ring-4 focus:ring-blue-500/5 transition-all font-black shadow-sm" />
                    </div>
                    <button onClick={() => setShowOnlyNameChanged(!showOnlyNameChanged)} className={`px-8 py-5 rounded-[28px] font-black text-sm transition-all whitespace-nowrap shadow-lg flex items-center gap-2 ${showOnlyNameChanged ? 'bg-blue-600 text-white shadow-blue-200' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
                      <History size={18} /> 명칭 변경 상품만 보기
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/20">
                          <th className="px-10 py-6">상품 정보 (줄바꿈 허용)</th>
                          {[{ label: '조회수', key: '상품상세조회수' }, { label: '주문량', key: '결제상품수량' }, { label: '매출액', key: '결제금액' }, { label: '전환율', key: '상세조회대비결제율' }].map(col => (
                            <th key={col.key} className="px-6 py-6 cursor-pointer hover:text-blue-600 group transition-colors" onClick={() => handleSort(col.key)}>
                              <div className="flex items-center gap-1.5">{col.label}<ArrowUpDown size={12} className={sortConfig.key === col.key ? 'text-blue-600' : 'text-slate-200 group-hover:text-slate-400'} /></div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {sortedData.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 cursor-pointer group transition-colors" onClick={() => setSelectedProduct(item)}>
                            <td className="px-10 py-8 min-w-[350px]">
                              <div className="font-black text-slate-900 group-hover:text-blue-600 transition-colors flex items-start gap-2 whitespace-normal break-all max-w-[450px] leading-relaxed">
                                {item.lastName} {item.nameCount > 1 && <span className="bg-amber-100 text-amber-700 text-[9px] px-2 py-0.5 rounded font-black mt-1 uppercase shrink-0">Modified</span>}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-2 font-black tracking-widest">CODE: {item.상품ID}</div>
                            </td>
                            <td className="px-6 py-8 font-black text-slate-700">{item.상품상세조회수.toLocaleString()}</td>
                            <td className="px-6 py-8 font-black text-slate-700">{item.결제상품수량.toLocaleString()}</td>
                            <td className="px-6 py-8 font-black text-slate-900 whitespace-nowrap italic">₩{item.결제금액.toLocaleString()}</td>
                            <td className="px-6 py-8"><span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-lg text-xs font-black">{(item.상세조회대비결제율 * 100).toFixed(2)}%</span></td>
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

      {/* 상품별 상세 모달 */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-2xl z-50 flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-7xl max-h-[94vh] rounded-[64px] shadow-2xl border-4 border-white flex flex-col overflow-hidden animate-in zoom-in-95 duration-500">
            <div className="px-12 py-12 flex items-center justify-between border-b border-slate-50">
              <div className="flex items-center gap-10">
                <div className="bg-blue-600 p-6 rounded-[32px] text-white shadow-2xl shrink-0"><Eye size={36} /></div>
                <div className="max-w-[800px]">
                  <h3 className="text-3xl font-black text-slate-900 leading-tight whitespace-normal break-words tracking-tighter italic">{selectedProduct.lastName}</h3>
                  <p className="text-xs text-slate-400 font-black mt-2 tracking-[0.3em] uppercase opacity-60 italic">Product Identity: {selectedProduct.상품ID}</p>
                </div>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="w-16 h-16 bg-slate-50 hover:bg-white hover:shadow-2xl rounded-full flex items-center justify-center transition-all text-slate-400 border border-transparent hover:border-slate-100 hover:rotate-90 duration-500"><X size={28} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-12 py-12 space-y-16">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
                {[{ label: '누적 유입수', val: `${selectedProduct.상품상세조회수.toLocaleString()}회`, color: 'blue' }, { label: '누적 매출액', val: `₩${selectedProduct.결제금액.toLocaleString()}`, color: 'indigo' }, { label: '누적 주문량', val: `${selectedProduct.결제상품수량.toLocaleString()}건`, color: 'slate' }, { label: '평균 전환율', val: `${(selectedProduct.상세조회대비결제율 * 100).toFixed(2)}%`, color: 'emerald' }].map((stat, i) => (
                  <div key={i} className={`p-8 rounded-[40px] border shadow-sm ${i === 0 ? 'bg-blue-50/50 border-blue-100' : 'bg-slate-50/30 border-slate-50'}`}>
                    <p className={`text-[10px] font-black ${i === 0 ? 'text-blue-500' : 'text-slate-400'} uppercase tracking-[0.2em] mb-2`}>{stat.label}</p>
                    <p className="text-3xl font-black text-slate-900 tracking-tighter">{stat.val}</p>
                  </div>
                ))}
              </div>
              {selectedProduct.nameCount > 1 && (
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-sm"><History size={20} /></div>
                    <h4 className="text-xl font-black text-slate-900 tracking-tight italic">명칭 변경 이력 분석 (Name Variant Comparison)</h4>
                  </div>
                  <div className="bg-white rounded-[40px] border border-slate-100 overflow-hidden shadow-2xl">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50/60 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          <th className="px-10 py-6">상품명</th>
                          <th className="px-4 py-6 text-center">기간</th>
                          <th className="px-4 py-6 text-right">조회수</th>
                          <th className="px-4 py-6 text-right">매출액</th>
                          <th className="px-4 py-6 text-right italic">일평균 매출</th>
                          <th className="px-4 py-6 text-right">일평균 유입</th>
                          <th className="px-10 py-6 text-right">전환율</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {selectedProduct.performanceByName.map((p, i) => (
                          <tr key={i} className="hover:bg-slate-50/30 transition-colors font-black">
                            <td className="px-10 py-6 font-bold text-slate-800 italic whitespace-normal break-words max-w-[300px]">"{p.name}"</td>
                            <td className="px-4 py-6 text-center text-slate-400 text-[11px]">{p.periodStart.replace(/-/g,'.')} - {p.periodEnd === globalMaxDate ? '현재' : p.periodEnd.replace(/-/g,'.')} ({p.days}일)</td>
                            <td className="px-4 py-6 text-right">{p.totalViews.toLocaleString()}회</td>
                            <td className="px-4 py-6 text-right">₩{p.totalRevenue.toLocaleString()}</td>
                            <td className="px-4 py-6 text-right text-indigo-600">₩{Math.round(p.dailyAvgRevenue).toLocaleString()}</td>
                            <td className="px-4 py-6 text-right text-sky-600">{p.dailyAvgViews.toFixed(1)}회</td>
                            <td className="px-10 py-6 text-right text-emerald-600">{p.cvr.toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="h-80 bg-white p-10 rounded-[56px] border border-slate-100 shadow-2xl">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={selectedProduct.history}>
                    <defs><linearGradient id="colorProdViews" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15}/><stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis dataKey="date" hide /><YAxis hide /><Tooltip contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} /><Area name="조회수" type="monotone" dataKey="조회수" stroke="#3B82F6" strokeWidth={5} fillOpacity={1} fill="url(#colorProdViews)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="p-12 bg-white border-t border-slate-50 flex justify-center"><button onClick={() => setSelectedProduct(null)} className="px-32 py-6 bg-slate-900 text-white rounded-[32px] font-black text-lg hover:scale-105 transition-all shadow-xl shadow-slate-200">데이터 창 닫기</button></div>
          </div>
        </div>
      )}

      {/* 알림 토스트 */}
      {statusMessage && (
        <div className={`fixed bottom-10 right-10 px-8 py-5 rounded-[28px] shadow-2xl text-white font-black flex items-center gap-4 animate-in slide-in-from-bottom-8 z-[200] ${statusMessage.type === 'error' ? 'bg-rose-500' : 'bg-slate-900'}`}>
          {statusMessage.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span className="tracking-tight leading-none">{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="ml-4 opacity-50"><X size={18} /></button>
        </div>
      )}

      {/* 빠르고 깔끔한 상태 표시 스피너 */}
      {isProcessing && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 px-8 py-5 bg-white/90 backdrop-blur-2xl rounded-[28px] shadow-2xl border border-slate-100 flex items-center gap-4 z-[100] animate-in slide-in-from-bottom-8">
          <div className="w-5 h-5 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="font-black text-slate-900 tracking-tighter italic">스마트 데이터 병합 중...</span>
        </div>
      )}
    </div>
  );
};

export default App;
