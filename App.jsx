import React, { useState, useMemo, useEffect } from 'react';
import { 
  Upload, Download, BarChart3, TrendingUp, ShoppingCart, 
  Eye, Search, ArrowUpDown, CheckCircle2, AlertCircle, 
  FileSpreadsheet, Calendar, ChevronRight, ChevronLeft, X, LayoutDashboard, 
  History, Info, ArrowUpRight, ArrowDownRight, Minus, Filter, Sparkles, Menu, MousePointer2
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, ComposedChart, Line, LineChart
} from 'recharts';

// 외부 라이브러리 (SheetJS) 로드
const EXCEL_LIB_URL = "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";

const App = () => {
  const [files, setFiles] = useState([]);
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
  const [globalMaxDate, setGlobalMaxDate] = useState(''); // 전체 데이터 중 가장 최신 날짜

  useEffect(() => {
    const script = document.createElement("script");
    script.src = EXCEL_LIB_URL;
    script.onload = () => setIsLibLoaded(true);
    document.head.appendChild(script);
  }, []);

  // 날짜 추출 로직 개선: 파일명 내 모든 날짜 중 가장 최신 것을 선택
  const extractDate = (fileName) => {
    const matches = fileName.match(/\d{4}-\d{1,2}-\d{1,2}/g);
    if (!matches) return '알 수 없는 날짜';
    
    // 날짜 형식 표준화 및 최신 날짜 반환
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
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = window.XLSX.utils.sheet_to_json(worksheet);
          resolve(json);
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
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
        
        // 전체 데이터 중 가장 최신 날짜 추적
        if (dateStr !== '알 수 없는 날짜' && dateStr > currentMaxDate) {
          currentMaxDate = dateStr;
        }

        const monthStr = dateStr !== '알 수 없는 날짜' ? dateStr.substring(0, 7) : '알 수 없는 월';
        const data = await parseExcel(file);

        if (!dailyMap.has(dateStr)) {
          dailyMap.set(dateStr, { date: dateStr, 매출: 0, 조회수: 0, 판매량: 0 });
        }
        if (!monthlyMap.has(monthStr)) {
          monthlyMap.set(monthStr, { month: monthStr, 매출: 0, 조회수: 0, 판매량: 0 });
        }

        data.forEach(item => {
          const pid = String(item['상품ID']);
          if (!pid || pid === "undefined" || pid === "null") return;

          const currentName = item['상품명'] || '이름 없음';
          const revenue = Number(item['결제금액']) || 0;
          const views = Number(item['상품상세조회수']) || 0;
          const sales = Number(item['결제상품수량']) || 0;

          if (!productMap.has(pid)) {
            productMap.set(pid, { 
              ...item, 
              상품ID: pid,
              결제금액: revenue, 
              상품상세조회수: views, 
              결제상품수량: sales, 
              nameHistory: [{ name: currentName, start: dateStr, end: dateStr }],
              lastName: currentName,
              nameCount: 1
            });
          } else {
            const p = productMap.get(pid);
            p.결제금액 += revenue;
            p.상품상세조회수 += views;
            p.결제상품수량 += sales;
            
            let nameRecord = p.nameHistory.find(nh => nh.name === currentName);
            if (!nameRecord) {
              p.nameHistory.push({ name: currentName, start: dateStr, end: dateStr });
              p.nameCount = p.nameHistory.length;
              p.lastName = currentName;
            } else {
              if (dateStr < nameRecord.start) nameRecord.start = dateStr;
              if (dateStr > nameRecord.end) nameRecord.end = dateStr;
            }
          }

          dailyMap.get(dateStr).매출 += revenue;
          dailyMap.get(dateStr).조회수 += views;
          dailyMap.get(dateStr).판매량 += sales;

          monthlyMap.get(monthStr).매출 += revenue;
          monthlyMap.get(monthStr).조회수 += views;
          monthlyMap.get(monthStr).판매량 += sales;

          if (!productDailyHistory.has(pid)) productDailyHistory.set(pid, []);
          productDailyHistory.get(pid).push({ 
            date: dateStr, 
            매출: revenue, 
            조회수: views, 
            판매량: sales, 
            nameUsed: currentName 
          });
        });
      }

      setGlobalMaxDate(currentMaxDate);

      const finalProducts = Array.from(productMap.values()).map(p => {
        // history 데이터가 없는 경우를 대비한 방어 코드
        const rawHistory = productDailyHistory.get(p.상품ID) || [];
        const history = [...rawHistory].sort((a, b) => a.date.localeCompare(b.date));
        
        const performanceByName = p.nameHistory.map(nh => {
          const nameData = history.filter(h => h.nameUsed === nh.name);
          const tRev = nameData.reduce((s, h) => s + h.매출, 0);
          const tSales = nameData.reduce((s, h) => s + h.판매량, 0);
          const tViews = nameData.reduce((s, h) => s + h.조회수, 0);
          
          // 일 수 계산: (종료일 - 시작일 + 1) 달력 차이 방식
          const startDate = new Date(nh.start);
          const endDate = new Date(nh.end);
          const diffTime = Math.abs(endDate - startDate);
          const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

          return {
            name: nh.name,
            totalRevenue: tRev,
            totalSales: tSales,
            totalViews: tViews,
            dailyAvgViews: days > 0 ? tViews / days : 0,
            cvr: tViews > 0 ? (tSales / tViews) * 100 : 0,
            days: days,
            periodStart: nh.start,
            periodEnd: nh.end
          };
        }).sort((a, b) => a.periodStart.localeCompare(b.periodStart));

        return {
          ...p,
          상세조회대비결제율: p.상품상세조회수 > 0 ? p.결제상품수량 / p.상품상세조회수 : 0,
          history,
          performanceByName,
          nameCount: p.nameHistory.length
        };
      });

      setProcessedData(finalProducts);
      setDailyTrend(Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)));
      setMonthlyTrend(Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month)));
      setStatusMessage({ type: 'success', text: `데이터 처리가 성공적으로 완료되었습니다.` });
    } catch (err) {
      console.error(err);
      setStatusMessage({ type: 'error', text: '데이터 처리 중 오류가 발생했습니다.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const momStats = useMemo(() => {
    if (monthlyTrend.length < 1) return null;
    const latest = monthlyTrend[monthlyTrend.length - 1];
    const previous = monthlyTrend.length > 1 ? monthlyTrend[monthlyTrend.length - 2] : null;
    const calcChange = (cur, prev) => {
      if (!prev || prev === 0) return null;
      return ((cur - prev) / prev) * 100;
    };
    return {
      revenueChange: previous ? calcChange(latest.매출, previous.매출) : null,
      salesChange: previous ? calcChange(latest.판매량, previous.판매량) : null,
      viewsChange: previous ? calcChange(latest.조회수, previous.조회수) : null,
    };
  }, [monthlyTrend]);

  const sortedData = useMemo(() => {
    let filtered = processedData.filter(p => {
      const matchesSearch = String(p['상품명'] || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            String(p['상품ID'] || '').includes(searchTerm);
      const matchesNameChanged = showOnlyNameChanged ? p.nameCount > 1 : true;
      return matchesSearch && matchesNameChanged;
    });

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        const aVal = a[sortConfig.key] || 0;
        const bVal = b[sortConfig.key] || 0;
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }
    return filtered;
  }, [processedData, sortConfig, searchTerm, showOnlyNameChanged]);

  const summary = useMemo(() => {
    const totalRevenue = processedData.reduce((acc, curr) => acc + curr.결제금액, 0);
    const totalSales = processedData.reduce((acc, curr) => acc + curr.결제상품수량, 0);
    const totalViews = processedData.reduce((acc, curr) => acc + curr.상품상세조회수, 0);
    const totalDays = dailyTrend.length;
    
    return {
      revenue: totalRevenue,
      sales: totalSales,
      views: totalViews,
      dailyAvgViews: totalDays > 0 ? totalViews / totalDays : 0,
      conversionRate: totalViews > 0 ? (totalSales / totalViews) * 100 : 0
    };
  }, [processedData, dailyTrend]);

  const ChangeIndicator = ({ value, label }) => {
    if (value === null) return <span className="text-[11px] text-slate-300 font-medium tracking-tight">비교 불가</span>;
    const isPositive = value > 0;
    const isZero = value === 0;
    return (
      <div className={`flex items-center gap-0.5 ${isPositive ? 'text-indigo-600' : isZero ? 'text-slate-400' : 'text-rose-500'} font-bold text-[12px]`}>
        {isPositive ? <ArrowUpRight size={14} /> : isZero ? <Minus size={14} /> : <ArrowDownRight size={14} />}
        {Math.abs(value).toFixed(1)}% {label}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#ffffff] text-[#1e293b] font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-x-hidden">
      {/* 사이드바 네비게이션 */}
      <aside className={`fixed left-0 top-0 h-full bg-white border-r border-slate-100 z-30 flex flex-col transition-all duration-500 ease-in-out ${isSidebarCollapsed ? 'w-24' : 'w-72'}`}>
        <div className="p-8 flex items-center justify-between overflow-hidden">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-xl shadow-indigo-100 shrink-0">
              <Sparkles size={24} className="text-white" />
            </div>
            {!isSidebarCollapsed && (
              <div className="animate-in fade-in duration-500">
                <h1 className="font-bold text-xl tracking-tighter text-slate-900 whitespace-nowrap">판매<span className="text-indigo-600">분석</span></h1>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-0.5">2026.02 버전</p>
              </div>
            )}
          </div>
        </div>

        {/* 사이드바 접기 버튼 */}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-4 top-10 bg-white border border-slate-100 p-1.5 rounded-full shadow-lg text-slate-400 hover:text-indigo-600 hover:border-indigo-100 transition-all z-40"
        >
          {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        
        <nav className="flex-1 px-4 space-y-1.5 mt-4 overflow-hidden">
          {[
            { id: 'dashboard', label: '종합 요약', icon: LayoutDashboard },
            { id: 'products', label: '상품별 분석', icon: ShoppingCart },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-[20px] transition-all duration-300 group ${
                activeTab === item.id 
                  ? 'bg-slate-50 text-indigo-600' 
                  : 'text-slate-400 hover:bg-slate-50/50 hover:text-slate-600'
              }`}
            >
              <item.icon size={20} className={`${activeTab === item.id ? 'scale-110' : 'opacity-70'} transition-transform shrink-0`} />
              {!isSidebarCollapsed && <span className="font-bold text-[15px] tracking-tight whitespace-nowrap animate-in fade-in duration-500">{item.label}</span>}
              {!isSidebarCollapsed && activeTab === item.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-600"></div>}
            </button>
          ))}
        </nav>

        <div className="p-6">
          <div className="relative group bg-slate-50 hover:bg-white rounded-[24px] p-5 border border-transparent hover:border-slate-100 hover:shadow-2xl cursor-pointer transition-all duration-500 overflow-hidden">
            <input 
              type="file" multiple accept=".xlsx" 
              onChange={(e) => {
                const newFiles = Array.from(e.target.files);
                if (newFiles.length) {
                  setFiles(newFiles);
                  processFiles(newFiles);
                }
              }}
              className="absolute inset-0 opacity-0 cursor-pointer z-10" 
            />
            <div className="flex flex-col items-center gap-3">
              <div className="bg-white p-3 rounded-2xl shadow-sm shrink-0">
                <Upload size={20} className="text-indigo-600" />
              </div>
              {!isSidebarCollapsed && <span className="text-[12px] font-bold text-slate-600 whitespace-nowrap animate-in fade-in duration-500">데이터 업로드</span>}
            </div>
          </div>
        </div>
      </aside>

      {/* 메인 패널 */}
      <main className={`min-h-screen transition-all duration-500 ease-in-out ${isSidebarCollapsed ? 'pl-24' : 'pl-72'}`}>
        <header className="h-24 bg-white/80 backdrop-blur-2xl sticky top-0 z-20 flex items-center justify-between px-10 border-b border-slate-50">
          <div>
            <h2 className="text-[22px] font-bold text-slate-900 tracking-tight">
              {activeTab === 'dashboard' ? '실시간 종합 요약' : '상품별 상세 분석'}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">스마트 데이터 통합기</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             {processedData.length > 0 && (
               <div className="bg-slate-50 px-5 py-3 rounded-2xl border border-slate-100 flex items-center gap-3 shadow-sm">
                 <Calendar size={16} className="text-indigo-500" />
                 <span className="text-sm font-bold text-slate-700 tracking-tighter">
                   {dailyTrend[0]?.date.replace(/-/g, '.')} — {dailyTrend[dailyTrend.length-1]?.date.replace(/-/g, '.')}
                 </span>
               </div>
             )}
          </div>
        </header>

        <div className="p-10 max-w-[1400px] mx-auto space-y-12">
          {processedData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center bg-white rounded-[48px] border border-slate-100 shadow-2xl shadow-slate-100/50">
              <div className="bg-slate-50 p-16 rounded-full mb-8 animate-pulse">
                <FileSpreadsheet size={80} className="text-slate-200" />
              </div>
              <h2 className="text-[32px] font-bold text-slate-900 tracking-tight">분석 준비 완료</h2>
              <p className="text-slate-400 mt-4 max-w-sm text-lg font-medium leading-relaxed">
                엑셀 파일을 업로드해 주세요. <br />
                2026년형 스마트 데이터 분석을 시작합니다.
              </p>
            </div>
          ) : (
            <>
              {/* 종합 요약 카드 섹션 */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
                {[
                  { label: '누적 매출액', val: `₩${summary.revenue.toLocaleString()}`, icon: TrendingUp, color: 'indigo', change: momStats?.revenueChange },
                  { label: '누적 판매량', val: `${summary.sales.toLocaleString()}`, unit: '건', icon: ShoppingCart, color: 'emerald', change: momStats?.salesChange },
                  { label: '일평균 유입수', val: `${summary.dailyAvgViews.toFixed(0)}`, unit: '회', icon: MousePointer2, color: 'blue', desc: '하루 평균 조회수' },
                  { label: '평균 결제 전환율', val: `${summary.conversionRate.toFixed(2)}`, unit: '%', icon: CheckCircle2, color: 'rose', desc: '조회수 대비 결제 비중' }
                ].map((item, i) => (
                  <div key={i} className="bg-white p-10 rounded-[40px] border border-slate-50 shadow-2xl shadow-slate-200/40 group hover:scale-[1.02] transition-transform duration-500">
                    <div className="flex items-center justify-between mb-6">
                      <div className={`p-4 rounded-3xl bg-${item.color}-50 text-${item.color}-600`}>
                        <item.icon size={28} />
                      </div>
                      <div className="text-right">
                         <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{item.label}</p>
                         <h4 className="text-[34px] font-bold text-slate-900 tracking-tighter mt-1">
                           {item.val}<span className="text-lg font-medium text-slate-400 ml-1">{item.unit || ''}</span>
                         </h4>
                      </div>
                    </div>
                    <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                      {item.change !== null ? (
                        <>
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">전월 대비 성장률</span>
                          <ChangeIndicator value={item.change} label="성장" />
                        </>
                      ) : (
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{item.desc}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {activeTab === 'dashboard' && (
                <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
                  <div className="bg-white p-10 rounded-[48px] border border-slate-50 shadow-2xl shadow-slate-200/30 overflow-hidden">
                    <div className="flex items-center justify-between mb-10">
                      <h3 className="text-xl font-bold text-slate-900 flex items-center gap-3 tracking-tight">
                        <div className="w-2 h-8 bg-indigo-600 rounded-full"></div>
                        월간 성장 추이
                      </h3>
                    </div>
                    <div className="h-[350px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyTrend} barGap={12}>
                          <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f8fafc" />
                          <XAxis dataKey="month" tick={{fontSize: 13, fontWeight: 600, fill: '#94a3b8'}} axisLine={false} tickLine={false} dy={15} />
                          <YAxis hide />
                          <Tooltip 
                            cursor={{fill: '#f1f5f9', radius: 12}}
                            contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.1)', padding: '20px'}} 
                          />
                          <Bar name="매출액" dataKey="매출" fill="#4f46e5" radius={[12, 12, 12, 12]} barSize={40} />
                          <Bar name="판매량" dataKey="판매량" fill="#10b981" radius={[12, 12, 12, 12]} barSize={40} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    <div className="bg-white p-10 rounded-[48px] border border-slate-50 shadow-2xl shadow-slate-200/30">
                      <h3 className="text-xl font-bold text-slate-900 mb-10 tracking-tight flex items-center gap-3">
                         <div className="w-2 h-8 bg-emerald-500 rounded-full"></div>
                         일별 매출 흐름
                      </h3>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={dailyTrend}>
                            <defs>
                              <linearGradient id="colorMain" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/>
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="date" hide />
                            <Tooltip contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} />
                            <Area type="monotone" dataKey="매출" stroke="#6366f1" strokeWidth={4} fill="url(#colorMain)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="bg-white p-10 rounded-[48px] border border-slate-50 shadow-2xl shadow-slate-200/30">
                      <h3 className="text-xl font-bold text-slate-900 mb-10 tracking-tight flex items-center gap-3">
                        <div className="w-2 h-8 bg-blue-500 rounded-full"></div>
                        일별 조회수 추이
                      </h3>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={dailyTrend}>
                            <defs>
                              <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="date" hide />
                            <Tooltip contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} />
                            <Area type="monotone" dataKey="조회수" stroke="#3b82f6" strokeWidth={4} fill="url(#colorViews)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'products' && (
                <div className="bg-white rounded-[48px] border border-slate-50 shadow-2xl shadow-slate-200/40 overflow-hidden animate-in fade-in zoom-in-95 duration-700">
                  <div className="p-10 flex flex-col xl:flex-row items-center justify-between gap-8 bg-slate-50/30">
                    <div className="flex flex-col sm:flex-row items-center gap-6 w-full xl:w-auto">
                      <div className="relative w-full sm:w-[450px] group">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 transition-colors group-focus-within:text-indigo-500" size={20} />
                        <input 
                          type="text" 
                          placeholder="상품명 또는 상품번호 검색..." 
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-16 pr-8 py-5 bg-white border border-slate-100 rounded-[28px] text-[15px] focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all font-semibold shadow-sm"
                        />
                      </div>
                      
                      <button 
                        onClick={() => setShowOnlyNameChanged(!showOnlyNameChanged)}
                        className={`flex items-center gap-3 px-8 py-5 rounded-[28px] text-[15px] font-bold transition-all border ${
                          showOnlyNameChanged 
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl shadow-indigo-200' 
                            : 'bg-white text-slate-500 border-slate-100 hover:bg-slate-50'
                        }`}
                      >
                        <History size={18} />
                        명칭 변경 상품만 보기
                      </button>
                    </div>

                    <div className="flex items-center gap-3 bg-white px-6 py-4 rounded-[24px] border border-slate-100 shadow-sm shrink-0">
                      <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></div>
                      <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">
                        총 {sortedData.length}건의 결과
                      </p>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/20">
                          <th className="px-10 py-6 text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em]">상품 정보</th>
                          {['상품상세조회수', '결제상품수량', '결제금액', '상세조회대비결제율'].map(key => (
                            <th 
                              key={key}
                              onClick={() => setSortConfig({key, direction: sortConfig.key === key && sortConfig.direction === 'desc' ? 'asc' : 'desc'})}
                              className="px-8 py-6 text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] cursor-pointer hover:text-indigo-600 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                {key === '상품상세조회수' ? '조회수' : key === '결제상품수량' ? '주문량' : key === '결제금액' ? '매출액' : '전환율'}
                                <ArrowUpDown size={14} className={sortConfig.key === key ? 'text-indigo-600' : 'text-slate-200'} />
                              </div>
                            </th>
                          ))}
                          <th className="px-10 py-6 text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] text-center">상세</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {sortedData.map((item, idx) => (
                          <tr key={idx} className="group hover:bg-slate-50/50 transition-all duration-300 cursor-pointer" onClick={() => setSelectedProduct(item)}>
                            <td className="px-10 py-8 min-w-[350px]">
                              <div className="flex flex-col gap-1.5 overflow-hidden">
                                <div className="flex items-center gap-3 overflow-hidden">
                                  <span className="text-[16px] font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate block">{item.lastName}</span>
                                  {item.nameCount > 1 && (
                                    <span className="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2.5 py-1 rounded-full border border-indigo-100 uppercase shrink-0 whitespace-nowrap">명칭변경</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                   <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap">번호: {item.상품ID}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-8 text-[15px] font-bold text-slate-600">{item.상품상세조회수.toLocaleString()}</td>
                            <td className="px-8 py-8 text-[15px] font-bold text-slate-600">{item.결제상품수량.toLocaleString()}</td>
                            <td className="px-8 py-8 text-[16px] font-black text-slate-900 whitespace-nowrap">₩{item.결제금액.toLocaleString()}</td>
                            <td className="px-8 py-8">
                               <span className="text-[13px] font-black text-slate-800">{(item.상세조회대비결제율 * 100).toFixed(2)}%</span>
                            </td>
                            <td className="px-10 py-8 text-center">
                              <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-300 group-hover:bg-indigo-600 group-hover:text-white group-hover:shadow-2xl transition-all duration-500 transform group-hover:translate-x-1 mx-auto">
                                <ChevronRight size={20} />
                              </div>
                            </td>
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

      {/* 분석 상세 모달 */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-3xl z-50 flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-[64px] shadow-2xl border border-white flex flex-col overflow-hidden animate-in zoom-in-95 duration-700">
            {/* 모달 헤더 */}
            <div className="px-12 py-12 flex items-center justify-between">
              <div className="flex items-center gap-8 overflow-hidden">
                <div className="bg-indigo-600 p-6 rounded-[32px] shadow-2xl shadow-indigo-200 shrink-0">
                  <ShoppingCart className="text-white" size={36} />
                </div>
                <div className="overflow-hidden">
                  <div className="flex items-center gap-4 overflow-hidden">
                    <h3 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none truncate max-w-[500px]">{selectedProduct.lastName}</h3>
                    {selectedProduct.nameCount > 1 && (
                      <div className="bg-emerald-50 text-emerald-600 text-[11px] font-bold px-3 py-1.5 rounded-full border border-emerald-100 shrink-0 whitespace-nowrap">명칭 변경 감지</div>
                    )}
                  </div>
                  <p className="text-[13px] text-slate-400 font-bold mt-2 tracking-widest uppercase">상품 고유 번호: {selectedProduct.상품ID}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedProduct(null)} 
                className="w-16 h-16 bg-slate-50 hover:bg-white hover:shadow-2xl rounded-full flex items-center justify-center transition-all duration-300 text-slate-400 group border border-transparent hover:border-slate-100 shrink-0"
              >
                <X size={28} className="group-hover:rotate-90 transition-transform duration-500" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-12 pb-12 space-y-16">
              {/* 통계 요약 카드 */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                  { label: '누적 매출액', val: `₩${selectedProduct.결제금액.toLocaleString()}` },
                  { label: '누적 주문량', val: `${selectedProduct.결제상품수량}건` },
                  { label: '누적 조회수', val: `${selectedProduct.상품상세조회수}회` },
                  { label: '평균 전환율', val: `${(selectedProduct.상세조회대비결제율 * 100).toFixed(2)}%` }
                ].map((stat, i) => (
                  <div key={i} className="bg-slate-50/50 p-8 rounded-[40px] border border-slate-50">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">{stat.label}</p>
                    <p className="text-[26px] font-bold text-slate-900 tracking-tighter">{stat.val}</p>
                  </div>
                ))}
              </div>

              {/* 명칭 변경 분석 */}
              {selectedProduct.nameCount > 1 && (
                <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-1000">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600"><History size={20} /></div>
                    <h4 className="text-xl font-bold text-slate-900 tracking-tight">상품명 변경에 따른 성과 비교</h4>
                  </div>
                  <div className="bg-white rounded-[40px] border border-slate-100 overflow-hidden shadow-2xl shadow-slate-100/50">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50/50">
                          <th className="px-10 py-6 text-[11px] font-bold text-slate-400 uppercase tracking-widest">사용된 상품명</th>
                          <th className="px-6 py-6 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-center">사용 기간</th>
                          <th className="px-6 py-6 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-center">일수 (달력기준)</th>
                          <th className="px-6 py-6 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">일평균 유입</th>
                          <th className="px-6 py-6 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">매출액</th>
                          <th className="px-10 py-6 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">전환율</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {selectedProduct.performanceByName.map((p, i) => (
                          <tr key={i} className="hover:bg-slate-50/30 transition-colors">
                            <td className="px-10 py-6 min-w-[200px]">
                              <span className="text-[15px] font-semibold text-slate-800 italic block">"{p.name}"</span>
                            </td>
                            <td className="px-6 py-6 text-center whitespace-nowrap">
                              <span className="text-[12px] font-bold text-slate-400 block tracking-tight">
                                {p.periodStart.replace(/-/g, '.')} —
                              </span>
                              {/* 마지막일이 전체 데이터의 최신일과 같다면 '사용중' 표시 */}
                              <span className={`text-[12px] font-bold block tracking-tight ${p.periodEnd === globalMaxDate ? 'text-indigo-600' : 'text-slate-400'}`}>
                                {p.periodEnd === globalMaxDate ? '사용중' : p.periodEnd.replace(/-/g, '.')}
                              </span>
                            </td>
                            <td className="px-6 py-6 text-center text-sm font-bold text-slate-500">{p.days}일</td>
                            <td className="px-6 py-6 text-right font-black text-indigo-600">{p.dailyAvgViews.toFixed(1)}회</td>
                            <td className="px-6 py-6 text-right font-black text-slate-900 whitespace-nowrap">₩{p.totalRevenue.toLocaleString()}</td>
                            <td className="px-10 py-6 text-right">
                               <span className="text-[15px] font-black text-emerald-600">{p.cvr.toFixed(2)}%</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 추이 차트 */}
              <div className="space-y-8 pb-10">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600"><TrendingUp size={20} /></div>
                    <h4 className="text-xl font-bold text-slate-900 tracking-tight">일별 매출 타임라인</h4>
                </div>
                <div className="h-80 bg-white p-10 rounded-[48px] border border-slate-100 shadow-2xl shadow-slate-100/30">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={selectedProduct.history}>
                      <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{fontSize: 11, fontWeight: 700, fill: '#cbd5e1'}} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} />
                      <Line name="매출액" type="monotone" dataKey="매출" stroke="#4f46e5" strokeWidth={6} dot={{r: 6, fill: '#4f46e5', strokeWidth: 4, stroke: '#fff'}} activeDot={{r: 10, strokeWidth: 0}} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            
            <div className="p-12 bg-white border-t border-slate-50 flex justify-center">
              <button 
                onClick={() => setSelectedProduct(null)} 
                className="px-24 py-6 bg-slate-900 text-white rounded-[32px] font-bold text-lg hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-slate-300"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 분석 중 로딩 스피너 */}
      {isProcessing && (
        <div className="fixed inset-0 bg-white/90 backdrop-blur-2xl z-[100] flex flex-col items-center justify-center animate-in fade-in duration-500">
          <div className="relative w-32 h-32 mb-10">
            <div className="absolute inset-0 border-[10px] border-slate-50 rounded-full"></div>
            <div className="absolute inset-0 border-[10px] border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tighter uppercase italic">분석 중...</h2>
          <p className="text-slate-400 mt-4 font-bold tracking-[0.3em] uppercase text-[11px]">스마트 분석 엔진 가동 중</p>
        </div>
      )}
    </div>
  );
};

export default App;