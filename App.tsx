
import React, { useState, useCallback } from 'react';
import { 
  Search, Download, CheckSquare, RefreshCw, Activity, 
  Zap, Cpu, Loader2, Network, Languages, 
  ChevronRight, ExternalLink, FileText, AlertCircle, Database
} from 'lucide-react';
import { PubMedArticle, ProcessStatus } from './types';
import { 
  callGeminiAnalysis, 
  callGeminiTitleTranslation, 
  callGeminiReview 
} from './services/geminiService';
import { 
  executePubMedSearch, 
  fetchSummary, 
  fetchAbstracts, 
  fetchFullText, 
  fetchReferences 
} from './services/pubmedService';

export default function App() {
  // --- States ---
  const [inputText, setInputText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [meshTerms, setMeshTerms] = useState<string[]>([]);
  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set());
  const [analyzeStatus, setAnalyzeStatus] = useState<ProcessStatus>(ProcessStatus.IDLE);

  const [articles, setArticles] = useState<PubMedArticle[]>([]);
  const [searchStatus, setSearchStatus] = useState<ProcessStatus>(ProcessStatus.IDLE);
  const [totalHits, setTotalHits] = useState(0);
  const [yearRange, setYearRange] = useState(5);
  const [selectedArticleIds, setSelectedArticleIds] = useState<Set<string>>(new Set());
  const [translatingTitles, setTranslatingTitles] = useState(false);

  const [reviewStatus, setReviewStatus] = useState<ProcessStatus>(ProcessStatus.IDLE);
  const [statusMessage, setStatusMessage] = useState("");
  const [reportOutput, setReportOutput] = useState("");

  // --- Handlers ---

  const handleInitialAnalyze = async () => {
    if (!inputText.trim()) return;
    setAnalyzeStatus(ProcessStatus.LOADING);
    setMeshTerms([]);
    try {
      const result = await callGeminiAnalysis(inputText);
      setTranslatedText(result.englishText);
      setMeshTerms(result.meshTerms);
      setSelectedTerms(new Set(result.meshTerms.slice(0, 5)));
      setAnalyzeStatus(ProcessStatus.SUCCESS);
    } catch (e) {
      console.error(e);
      setAnalyzeStatus(ProcessStatus.ERROR);
    }
  };

  const handleSearch = async () => {
    if (selectedTerms.size === 0) return;
    setSearchStatus(ProcessStatus.LOADING);
    setArticles([]);
    setSelectedArticleIds(new Set());
    
    try {
      const { count, ids } = await executePubMedSearch(Array.from(selectedTerms), yearRange);
      setTotalHits(count);
      
      if (ids.length > 0) {
        const summaries = await fetchSummary(ids);
        setArticles(summaries);
        setSearchStatus(ProcessStatus.SUCCESS);

        // Background title translation
        setTranslatingTitles(true);
        const jpTitles = await callGeminiTitleTranslation(summaries);
        setArticles(prev => prev.map(a => ({
          ...a,
          titleJa: jpTitles[a.id] || ""
        })));
        setTranslatingTitles(false);
      } else {
        setSearchStatus(ProcessStatus.SUCCESS);
      }
    } catch (e) {
      console.error(e);
      setSearchStatus(ProcessStatus.ERROR);
    }
  };

  const handleDeepReview = async () => {
    if (selectedArticleIds.size === 0) return;
    setReviewStatus(ProcessStatus.LOADING);
    
    try {
      const ids = Array.from(selectedArticleIds);

      setStatusMessage("Retrieving abstracts...");
      const abstracts = await fetchAbstracts(ids);

      setStatusMessage("Attempting full text retrieval (PMC)...");
      const fullTexts: Record<string, string> = {};
      for (const pmid of ids) {
        const text = await fetchFullText(pmid);
        if (text) fullTexts[pmid] = text;
      }

      setStatusMessage("Analyzing citation network...");
      const refIds = await fetchReferences(ids);
      let refData: any[] = [];
      if (refIds.length > 0) {
        const topRefs = refIds.slice(0, 8);
        const refSummaries = await fetchSummary(topRefs);
        const refAbs = await fetchAbstracts(topRefs);
        refData = refSummaries.map(s => ({
          ...s,
          abstract: refAbs[s.id] || ""
        }));
      }

      setStatusMessage("Gemini is synthesizing report...");
      const selectedData = articles
        .filter(a => selectedArticleIds.has(a.id))
        .map(a => ({
          ...a,
          abstract: abstracts[a.id] || "",
          fullText: fullTexts[a.id] || null
        }));

      const report = await callGeminiReview(translatedText || inputText, selectedData, refData);
      setReportOutput(report);
      setReviewStatus(ProcessStatus.SUCCESS);
    } catch (e) {
      console.error(e);
      setReviewStatus(ProcessStatus.ERROR);
      setReportOutput("An error occurred during synthesis. Please check the console for details.");
    }
  };

  const toggleTerm = (term: string) => {
    const next = new Set(selectedTerms);
    if (next.has(term)) next.delete(term);
    else next.add(term);
    setSelectedTerms(next);
  };

  const toggleArticle = (id: string) => {
    const next = new Set(selectedArticleIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedArticleIds(next);
  };

  const downloadReport = () => {
    const blob = new Blob(["\uFEFF" + reportOutput], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Evidence_Review_${new Date().getTime()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-lg border-b border-slate-700">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-500 rounded-lg shadow-inner">
              <Activity className="text-slate-900" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Evidence Miner <span className="text-teal-400">v5.0 Pro</span></h1>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Medical Evidence Synthesizer</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge icon={<Languages size={12}/>} text="Auto-Trans" color="bg-indigo-900/50" border="border-indigo-700" />
            <Badge icon={<Network size={12}/>} text="Citation Chain" color="bg-emerald-900/50" border="border-emerald-700" />
            <Badge icon={<Database size={12}/>} text="PMC Sync" color="bg-amber-900/50" border="border-amber-700" />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-8 mt-4">
        
        {/* Step 1: Research Subject */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
          <div className="bg-slate-50 border-b border-slate-100 p-4 flex items-center gap-3">
            <StepCircle num={1} />
            <h2 className="font-bold text-slate-800">Initial AI Analysis & MeSH Discovery</h2>
          </div>
          <div className="p-6">
            <textarea 
              className="w-full h-32 p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm font-medium leading-relaxed bg-slate-50/50"
              placeholder="Paste research background, abstract, or keywords here (JP/EN supported)..."
              value={inputText}
              onChange={e => setInputText(e.target.value)}
            />
            <div className="mt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <button 
                onClick={handleInitialAnalyze} 
                disabled={analyzeStatus === ProcessStatus.LOADING || !inputText.trim()} 
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {analyzeStatus === ProcessStatus.LOADING ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18}/>}
                Analyze Theme
              </button>
              {translatedText && (
                <div className="text-xs bg-slate-100 p-2 rounded-lg border border-slate-200 text-slate-600 max-w-lg truncate">
                  <span className="font-bold text-indigo-600 mr-2 uppercase">Analysis Target:</span> {translatedText}
                </div>
              )}
            </div>

            {meshTerms.length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Extracted MeSH Terms</p>
                <div className="flex flex-wrap gap-2">
                  {meshTerms.map(term => (
                    <button 
                      key={term} 
                      onClick={() => toggleTerm(term)}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        selectedTerms.has(term) 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Step 2: Search */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in" style={{animationDelay: '0.1s'}}>
          <div className="bg-slate-50 border-b border-slate-100 p-4 flex items-center gap-3">
            <StepCircle num={2} />
            <h2 className="font-bold text-slate-800">PubMed Evidence Retrieval</h2>
          </div>
          <div className="p-6">
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1 bg-slate-100 p-3 rounded-xl border border-slate-200 flex items-center gap-3">
                <Search size={18} className="text-slate-400" />
                <div className="flex-1 overflow-hidden">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Query Preview</p>
                  <p className="text-sm font-mono text-indigo-700 truncate">
                    {selectedTerms.size > 0 ? Array.from(selectedTerms).join(" AND ") : "Please select keywords above"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <select 
                  className="bg-white border border-slate-200 p-2.5 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-teal-500 outline-none"
                  value={yearRange}
                  onChange={e => setYearRange(Number(e.target.value))}
                >
                  <option value={3}>Last 3 Years</option>
                  <option value={5}>Last 5 Years</option>
                  <option value={10}>Last 10 Years</option>
                  <option value={20}>Last 20 Years</option>
                </select>
                <button 
                  onClick={handleSearch}
                  disabled={searchStatus === ProcessStatus.LOADING || selectedTerms.size === 0}
                  className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-2.5 rounded-xl font-bold shadow-sm transition-all disabled:opacity-50"
                >
                  Retrieve
                </button>
              </div>
            </div>

            {searchStatus === ProcessStatus.SUCCESS && (
              <div className="mb-4 flex items-center justify-between px-4 py-3 bg-teal-50 rounded-xl border border-teal-100 text-teal-800 animate-fade-in">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-2xl font-black">{totalHits}</span>
                    <span className="text-xs font-bold uppercase ml-2 opacity-70">Total Matches</span>
                  </div>
                  <div className="w-px h-8 bg-teal-200/50 hidden sm:block" />
                  <p className="text-xs hidden sm:block">Showing top <span className="font-bold">30</span> most relevant entries</p>
                </div>
                {translatingTitles ? (
                   <div className="flex items-center gap-2 text-xs font-bold animate-pulse text-indigo-600">
                     <RefreshCw className="animate-spin" size={14}/>
                     Translating titles...
                   </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs font-bold text-teal-600">
                    <CheckSquare size={14}/>
                    Translation Complete
                  </div>
                )}
              </div>
            )}

            {articles.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="max-h-[500px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-12 text-center">Sel</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Evidence Entry</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-24">Link</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {articles.map(article => (
                        <tr 
                          key={article.id} 
                          className={`hover:bg-slate-50 transition-colors cursor-pointer ${selectedArticleIds.has(article.id) ? 'bg-indigo-50/50' : ''}`}
                          onClick={() => toggleArticle(article.id)}
                        >
                          <td className="px-4 py-4 text-center">
                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${selectedArticleIds.has(article.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300'}`}>
                              {selectedArticleIds.has(article.id) && <CheckSquare size={12}/>}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            {article.titleJa && (
                              <div className="text-sm font-bold text-indigo-900 mb-1 leading-snug">{article.titleJa}</div>
                            )}
                            <div className={`text-slate-600 leading-snug ${article.titleJa ? 'text-xs italic' : 'text-sm font-bold'}`}>{article.title}</div>
                            <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                              <span className="text-teal-600">{article.journal}</span>
                              <span>•</span>
                              <span>{article.pubdate}</span>
                              <span className="hidden sm:inline">• {article.authors}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <a 
                              href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              onClick={e => e.stopPropagation()}
                              className="text-indigo-500 hover:text-indigo-700 transition-colors flex items-center gap-1 text-xs font-bold"
                            >
                              {article.pmid} <ExternalLink size={10}/>
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Step 3: Synthesis */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in" style={{animationDelay: '0.2s'}}>
          <div className="bg-slate-50 border-b border-slate-100 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StepCircle num={3} />
              <h2 className="font-bold text-slate-800">Deep AI Synthesis & Report</h2>
            </div>
            <button 
              onClick={handleDeepReview}
              disabled={reviewStatus === ProcessStatus.LOADING || selectedArticleIds.size === 0}
              className="bg-gradient-to-r from-indigo-600 to-teal-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 hover:shadow-lg transition-all disabled:opacity-50"
            >
              {reviewStatus === ProcessStatus.LOADING ? <Loader2 className="animate-spin" size={18}/> : <Cpu size={18}/>}
              Synthesize Evidence
            </button>
          </div>
          
          <div className="p-6">
            <p className="text-xs text-slate-400 mb-6 flex items-center gap-2">
              <AlertCircle size={14}/>
              Currently selecting <span className="text-indigo-600 font-bold">{selectedArticleIds.size}</span> articles for deep synthesis. PMC full-text indexing will be attempted automatically.
            </p>

            {reviewStatus === ProcessStatus.LOADING && (
              <div className="py-20 flex flex-col items-center justify-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 animate-pulse">
                <div className="p-4 bg-indigo-100 rounded-full mb-4">
                  <Network size={32} className="text-indigo-600 animate-bounce" />
                </div>
                <h3 className="font-bold text-slate-700 mb-1">Deep Processing Initiated</h3>
                <p className="text-xs text-slate-500">{statusMessage}</p>
              </div>
            )}

            {reportOutput && (
              <div className="mt-4 animate-fade-in">
                <div className="flex items-center justify-between bg-slate-800 text-white px-5 py-3 rounded-t-2xl">
                   <div className="flex items-center gap-2">
                     <FileText size={16} className="text-teal-400" />
                     <span className="text-xs font-mono uppercase tracking-widest font-bold">Generated_Evidence_Report.txt</span>
                   </div>
                   <button 
                    onClick={downloadReport}
                    className="flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-slate-900 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors"
                   >
                     <Download size={14}/> Export
                   </button>
                </div>
                <div className="bg-slate-900 p-8 rounded-b-2xl shadow-inner min-h-[500px] border-t-0 border border-slate-800">
                  <pre className="text-sm font-mono text-slate-300 leading-relaxed whitespace-pre-wrap selection:bg-teal-500/30">
                    {reportOutput}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </section>

      </main>

      {/* Footer Info */}
      <footer className="max-w-6xl mx-auto px-4 text-center mt-12 pb-8">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
          Integrated with PubMed E-Utilities & Google Gemini 3 Pro • v5.0.4 Build 2024
        </p>
      </footer>
    </div>
  );
}

// --- Helper Components ---

function Badge({ icon, text, color, border }: { icon: React.ReactNode, text: string, color: string, border: string }) {
  return (
    <div className={`px-3 py-1.5 rounded-lg border ${border} ${color} flex items-center gap-1.5 transition-all hover:scale-105 cursor-default`}>
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-tight">{text}</span>
    </div>
  );
}

function StepCircle({ num }: { num: number }) {
  return (
    <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center font-black text-sm shadow-sm ring-4 ring-teal-50">
      {num}
    </div>
  );
}
