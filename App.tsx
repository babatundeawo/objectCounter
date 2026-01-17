
import React, { useState, useCallback, useRef } from 'react';
import { analyzeItems } from './geminiService';
import { AnalysisResult, ItemInstance, AppState, CalibrationData, Point, ModelMode, ItemMetadata } from './types';
import ItemCanvas from './components/ItemCanvas';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.SETUP);
  const [metadata, setMetadata] = useState<ItemMetadata>({ name: '', sampleImage: null });
  const [batchImage, setBatchImage] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showMasks, setShowMasks] = useState(true);
  const [showBoxes, setShowBoxes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelMode, setModelMode] = useState<ModelMode>(ModelMode.PRO);
  const [isCalibratingInit, setIsCalibratingInit] = useState(false);
  const [editMode, setEditMode] = useState(false);
  
  const [calibration, setCalibration] = useState<CalibrationData>({
    referenceLengthMm: 10,
    pixelsPerMm: null,
    startPoint: null,
    endPoint: null
  });

  const batchUploadRef = useRef<HTMLInputElement>(null);
  const batchCameraRef = useRef<HTMLInputElement>(null);
  const sampleUploadRef = useRef<HTMLInputElement>(null);
  const sampleCameraRef = useRef<HTMLInputElement>(null);

  const handleSampleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setMetadata({ ...metadata, sampleImage: ev.target?.result as string });
      reader.readAsDataURL(file);
    }
  };

  const handleBatchUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setBatchImage(ev.target?.result as string);
        setAppState(AppState.IDLE);
        setResult(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const processBatch = async () => {
    if (!batchImage) return;
    setAppState(AppState.PROCESSING);
    setError(null);

    try {
      const base64Data = batchImage.split(',')[1];
      const analysis = await analyzeItems(base64Data, metadata, modelMode);
      
      if (calibration.pixelsPerMm) {
        analysis.items = updatePhysicalMetrics(analysis.items, calibration.pixelsPerMm);
      }

      setResult(analysis);
      setAppState(AppState.REVIEW);
    } catch (err: any) {
      setError("Analysis failed. Try a more descriptive item name or clearer batch image.");
      console.error(err);
      setAppState(AppState.IDLE);
    }
  };

  const updatePhysicalMetrics = (items: ItemInstance[], pxMm: number) => {
    return items.map(s => {
      const [ymin, xmin, ymax, xmax] = s.boundingBox;
      const widthPx = (xmax - xmin) * 5; 
      const heightPx = (ymax - ymin) * 5;
      return {
        ...s,
        widthMm: Number((widthPx / pxMm).toFixed(2)),
        heightMm: Number((heightPx / pxMm).toFixed(2))
      };
    });
  };

  const startCalibration = () => {
    setIsCalibratingInit(true);
    setTimeout(() => {
      setIsCalibratingInit(false);
      setAppState(AppState.CALIBRATING);
    }, 800);
  };

  const handleCalibrationUpdate = (points: [Point, Point]) => {
    const dx = points[1].x - points[0].x;
    const dy = points[1].y - points[0].y;
    const distPx = Math.sqrt(dx * dx + dy * dy);
    const pxPerMm = distPx / calibration.referenceLengthMm;
    
    setCalibration(prev => ({
      ...prev,
      pixelsPerMm: pxPerMm,
      startPoint: points[0],
      endPoint: points[1]
    }));
    
    if (result) {
      const updated = { ...result, items: updatePhysicalMetrics(result.items, pxPerMm) };
      setResult(updated);
    }
    setAppState(AppState.REVIEW);
  };

  const handleMaskUpdate = (itemId: string, newMask: Point[]) => {
    if (!result) return;
    const updatedItems = result.items.map(i => i.id === itemId ? { ...i, mask: newMask } : i);
    setResult({ ...result, items: updatedItems });
  };

  const clearSelectedMask = () => {
    if (!selectedItemId || !result) return;
    const updatedItems = result.items.map(i => i.id === selectedItemId ? { ...i, mask: [] } : i);
    setResult({ ...result, items: updatedItems });
  };

  const exportCsv = () => {
    if (!result) return;
    const headers = ["ID", "Label", "Confidence", "AreaPx", "WidthMm", "HeightMm"];
    const rows = result.items.map((s, idx) => [
      idx + 1, s.label || metadata.name, s.confidence.toFixed(4), s.areaPx.toFixed(2),
      s.widthMm || "N/A", s.heightMm || "N/A"
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${metadata.name.replace(/\s+/g, '_')}_analysis_${Date.now()}.csv`;
    link.click();
  };

  const selectedItemIndex = result?.items.findIndex(i => i.id === selectedItemId);
  const selectedItem = selectedItemId && result ? result.items[selectedItemIndex!] : null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900">
      <aside className="w-full md:w-96 bg-white border-b md:border-r border-slate-200 p-6 flex-shrink-0 flex flex-col gap-8 overflow-y-auto">
        <div onClick={() => setAppState(AppState.SETUP)} className="cursor-pointer group select-none">
          <h1 className="text-3xl font-black text-slate-800 tracking-tighter flex items-center gap-2">
            <span className="bg-blue-600 text-white px-2 py-0.5 rounded-lg text-xl shadow-lg shadow-blue-200">OC</span> ObjectCounter
          </h1>
          <p className="text-slate-400 text-[10px] mt-2 font-black group-hover:text-blue-600 transition-colors uppercase tracking-[0.2em]">
            {metadata.name || 'Setup Device Context'}
          </p>
        </div>

        {appState === AppState.SETUP ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-left-6 duration-500">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Identify Item Type</label>
              <input 
                type="text" 
                placeholder="e.g. Diamond Studs, Washers, M&Ms"
                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-blue-500 focus:bg-white outline-none transition-all"
                value={metadata.name}
                onChange={(e) => setMetadata({...metadata, name: e.target.value})}
              />
            </div>
            
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visual Reference (Optional)</label>
              <div className="relative aspect-video bg-slate-50 rounded-2xl border-4 border-dashed border-slate-100 flex items-center justify-center overflow-hidden">
                {metadata.sampleImage ? (
                  <img src={metadata.sampleImage} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-6">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mx-auto mb-3">
                      <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"/></svg>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase">Snapshot Reference</p>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => sampleUploadRef.current?.click()}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Upload File
                </button>
                <button 
                  onClick={() => sampleCameraRef.current?.click()}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Use Camera
                </button>
              </div>

              <input type="file" ref={sampleUploadRef} className="hidden" accept="image/*" onChange={handleSampleUpload} />
              <input type="file" ref={sampleCameraRef} className="hidden" accept="image/*" capture="environment" onChange={handleSampleUpload} />
            </div>

            <button 
              disabled={!metadata.name}
              onClick={() => setAppState(AppState.IDLE)}
              className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs disabled:opacity-30 shadow-2xl shadow-slate-200 hover:scale-[1.02] active:scale-95 transition-all"
            >
              Continue to Workspace
            </button>
          </div>
        ) : (
          <div className="space-y-6 flex-1 flex flex-col">
            <div className="bg-slate-50 p-1.5 rounded-2xl flex gap-1 border border-slate-100">
              <button 
                onClick={() => setModelMode(ModelMode.PRO)}
                disabled={appState === AppState.CALIBRATING || isCalibratingInit}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${modelMode === ModelMode.PRO ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-600 disabled:opacity-30'}`}
              >
                High Precision
              </button>
              <button 
                onClick={() => setModelMode(ModelMode.FLASH)}
                disabled={appState === AppState.CALIBRATING || isCalibratingInit}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${modelMode === ModelMode.FLASH ? 'bg-white shadow-md text-emerald-600' : 'text-slate-400 hover:text-slate-600 disabled:opacity-30'}`}
              >
                Fast Mode
              </button>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Capture Batch</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => batchUploadRef.current?.click()}
                  disabled={appState === AppState.PROCESSING || appState === AppState.CALIBRATING || isCalibratingInit}
                  className="bg-blue-50 hover:bg-blue-100 text-blue-600 py-4 px-2 rounded-2xl border-2 border-dashed border-blue-200 transition-all font-black flex flex-col items-center justify-center gap-2 text-[9px] uppercase tracking-widest disabled:opacity-30"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                  Upload Batch
                </button>
                <button
                  onClick={() => batchCameraRef.current?.click()}
                  disabled={appState === AppState.PROCESSING || appState === AppState.CALIBRATING || isCalibratingInit}
                  className="bg-blue-50 hover:bg-blue-100 text-blue-600 py-4 px-2 rounded-2xl border-2 border-dashed border-blue-200 transition-all font-black flex flex-col items-center justify-center gap-2 text-[9px] uppercase tracking-widest disabled:opacity-30"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  Take Photo
                </button>
              </div>

              <input type="file" ref={batchUploadRef} className="hidden" accept="image/*" onChange={handleBatchUpload} />
              <input type="file" ref={batchCameraRef} className="hidden" accept="image/*" capture="environment" onChange={handleBatchUpload} />

              {batchImage && appState === AppState.IDLE && (
                <button
                  onClick={processBatch}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 px-4 rounded-2xl shadow-2xl shadow-blue-100 transition-all font-black text-xs uppercase tracking-[0.2em] active:scale-95"
                >
                  Analyze Batch
                </button>
              )}

              {(appState === AppState.PROCESSING || isCalibratingInit) && (
                <div className="space-y-4 py-6 text-center bg-slate-50 rounded-2xl border border-slate-100 animate-pulse">
                  <div className="inline-block animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full"></div>
                  <div className="text-slate-800 text-[10px] font-black uppercase tracking-widest">
                    {isCalibratingInit ? 'Calibrating Optics...' : 'Neural Segmentation...'}
                  </div>
                </div>
              )}
            </div>

            {appState === AppState.CALIBRATING && (
              <div className="bg-amber-50 border-2 border-amber-200 p-6 rounded-2xl space-y-4 animate-in slide-in-from-top-4">
                <p className="text-xs font-black text-amber-800 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                  Active Calibration
                </p>
                <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
                  Tap two points on the canvas that represent exactly {calibration.referenceLengthMm}mm.
                </p>
                <button onClick={() => setAppState(AppState.REVIEW)} className="w-full bg-white text-amber-700 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border border-amber-200 shadow-sm hover:bg-amber-100 transition-all">Cancel Calibration</button>
              </div>
            )}

            {result && appState !== AppState.CALIBRATING && (
              <div className="pt-6 border-t border-slate-100 space-y-6 flex-1 flex flex-col">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-900 text-white p-6 rounded-3xl flex flex-col items-center justify-center shadow-2xl">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Count</p>
                    <p className="text-4xl font-black">{result.summary.totalCount}</p>
                  </div>
                  <div className="bg-emerald-50 text-emerald-700 p-6 rounded-3xl flex flex-col items-center justify-center border border-emerald-100">
                    <p className="text-[10px] font-black text-emerald-300 uppercase tracking-widest mb-1">Avg Conf</p>
                    <p className="text-3xl font-black">{(result.summary.averageConfidence * 100).toFixed(0)}%</p>
                  </div>
                </div>

                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Geometric Scale</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input type="number" value={calibration.referenceLengthMm} onChange={(e) => setCalibration({...calibration, referenceLengthMm: parseFloat(e.target.value)})} className="w-full pl-4 pr-10 py-3 border-2 border-slate-100 rounded-xl text-sm font-black focus:border-amber-400 outline-none" />
                      <span className="absolute right-3 top-3.5 text-[10px] font-black text-slate-300">MM</span>
                    </div>
                    <button onClick={startCalibration} className="bg-amber-100 hover:bg-amber-200 text-amber-700 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm">Scale</button>
                  </div>
                  {calibration.pixelsPerMm && (
                    <p className="text-[9px] text-amber-600 font-bold text-center">System Scale: {calibration.pixelsPerMm.toFixed(2)} px/mm</p>
                  )}
                </div>

                <button onClick={exportCsv} className="w-full mt-auto bg-slate-800 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl hover:bg-slate-900 transition-all">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  Export CSV Report
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      <main className="flex-1 p-4 lg:p-10 flex flex-col overflow-y-auto">
        {error && (
          <div className="mb-6 bg-red-600 text-white px-8 py-5 rounded-3xl flex items-center justify-between shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              <span className="text-sm font-black uppercase tracking-widest">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="font-black text-xl hover:scale-125 transition-transform">✕</button>
          </div>
        )}

        {!batchImage ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-2xl mx-auto py-20">
             <div className="w-32 h-32 bg-blue-600 rounded-[2.5rem] flex items-center justify-center text-white mb-10 shadow-[0_20px_50px_rgba(37,99,235,0.3)] rotate-6 transform hover:rotate-0 transition-transform cursor-pointer">
               <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
             </div>
             <h2 className="text-5xl font-black text-slate-800 mb-6 tracking-tighter leading-tight">Batch Identification <br/>Engine Active</h2>
             <p className="text-slate-500 text-lg font-medium leading-relaxed mb-12 max-w-lg">
               {appState === AppState.SETUP ? 'Define your parameters to enable high-precision industrial counting.' : `Position your ${metadata.name} batch and capture a high-resolution image to begin.`}
             </p>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                <GuideCard step="1" text="Contextual Setup" icon="⚙️" />
                <GuideCard step="2" text="Batch Capture" icon="📸" />
                <GuideCard step="3" text="Digital Export" icon="📊" />
             </div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto w-full space-y-8">
            <div className="flex flex-wrap items-center justify-between bg-white px-8 py-5 rounded-3xl border-4 border-slate-100 shadow-xl gap-4">
              <div className="flex items-center gap-8">
                <div className="space-y-1">
                  <h2 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">Batch Class</h2>
                  <p className="text-lg font-black text-slate-800 tracking-tight">{metadata.name}</p>
                </div>
                <div className="h-10 w-px bg-slate-100 hidden sm:block"></div>
                <div className="flex gap-6">
                  <LayerToggle label="Masks" active={showMasks} onClick={() => setShowMasks(!showMasks)} />
                  <LayerToggle label="Boxes" active={showBoxes} onClick={() => setShowBoxes(!showBoxes)} />
                </div>
              </div>
              <div className="flex gap-3">
                {result && (
                  <button 
                    onClick={() => setEditMode(!editMode)} 
                    className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${editMode ? 'bg-blue-600 text-white shadow-xl shadow-blue-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    {editMode ? 'Finish Refining' : 'Refine Segments'}
                  </button>
                )}
                <button onClick={() => { setBatchImage(null); setResult(null); setSelectedItemId(null); setEditMode(false); }} className="px-6 py-2.5 bg-red-50 text-red-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-colors">Abort</button>
              </div>
            </div>

            <div className="relative group">
              <ItemCanvas 
                imageSrc={batchImage} 
                result={result}
                calibration={calibration}
                showMasks={showMasks}
                showBoxes={showBoxes}
                selectedItemId={selectedItemId}
                isCalibrating={appState === AppState.CALIBRATING}
                editMode={editMode}
                onCalibrationUpdate={handleCalibrationUpdate}
                onMaskUpdate={handleMaskUpdate}
                onItemClick={(item) => setSelectedItemId(item.id)}
              />
              <div className="absolute top-8 right-8 flex items-center gap-3">
                 <div className="bg-white/90 backdrop-blur-xl px-6 py-2.5 rounded-full border-2 border-slate-200/50 shadow-2xl flex items-center gap-4">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em]">Operational Analytics</span>
                 </div>
              </div>
            </div>

            {selectedItem && (
              <div className="bg-white rounded-[3rem] border-[6px] border-blue-50 p-10 shadow-[0_50px_100px_rgba(0,0,0,0.05)] animate-in slide-in-from-bottom-12 duration-700">
                <div className="flex flex-wrap items-center justify-between mb-10 gap-6">
                  <div className="flex items-center gap-6">
                    <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center text-white text-3xl font-black shadow-xl shadow-blue-200">
                      #{selectedItemIndex! + 1}
                    </div>
                    <div>
                      <h3 className="text-4xl font-black text-slate-800 tracking-tighter mb-1">Instance Data</h3>
                      <p className="text-xs font-black text-blue-500 uppercase tracking-[0.3em]">{selectedItem.label || metadata.name}</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    {editMode && (
                      <button onClick={clearSelectedMask} className="px-6 py-3 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">Clear Mask</button>
                    )}
                    <button onClick={() => setSelectedItemId(null)} className="w-14 h-14 flex items-center justify-center rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-800 transition-all">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
                  <StatCard label="Matching Score" value={`${(selectedItem.confidence * 100).toFixed(1)}%`} sub="Neural Certainty" color="blue" />
                  <StatCard label="Total Footprint" value={selectedItem.areaPx.toFixed(0)} sub="Pixel Density" color="blue" />
                  <StatCard label="Calibrated X" value={selectedItem.widthMm ? `${selectedItem.widthMm}mm` : '---'} sub="Horizontal Axis" color="amber" />
                  <StatCard label="Calibrated Y" value={selectedItem.heightMm ? `${selectedItem.heightMm}mm` : '---'} sub="Vertical Axis" color="amber" />
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

const GuideCard = ({ step, text, icon }: { step: string, text: string, icon: string }) => (
  <div className="p-8 bg-white border-2 border-slate-100 rounded-[2rem] shadow-sm text-left space-y-4 hover:shadow-xl hover:border-blue-100 transition-all cursor-default">
    <div className="flex items-center justify-between">
      <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-black">{step}</div>
      <span className="text-3xl">{icon}</span>
    </div>
    <p className="text-sm font-black text-slate-700 tracking-tight leading-snug">{text}</p>
  </div>
);

const LayerToggle = ({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) => (
  <button onClick={onClick} className="flex items-center gap-3 cursor-pointer group select-none">
    <div className={`w-10 h-6 rounded-full transition-colors relative ${active ? 'bg-blue-600' : 'bg-slate-200'}`}>
      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${active ? 'left-5' : 'left-1'}`}></div>
    </div>
    <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${active ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`}>{label}</span>
  </button>
);

const StatCard = ({ label, value, sub, color }: { label: string, value: string, sub: string, color: 'blue' | 'amber' }) => (
  <div className={`p-8 rounded-[2.5rem] border-2 shadow-sm transition-all hover:shadow-xl ${color === 'blue' ? 'bg-blue-50/30 border-blue-50' : 'bg-amber-50/30 border-amber-50'}`}>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">{label}</p>
    <p className={`text-4xl font-black mb-1 ${color === 'blue' ? 'text-blue-600' : 'text-amber-600'}`}>{value}</p>
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{sub}</p>
  </div>
);

export default App;
