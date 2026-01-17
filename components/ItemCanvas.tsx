
import React, { useRef, useEffect, useState } from 'react';
import { AnalysisResult, ItemInstance, Point, CalibrationData } from '../types';

interface ItemCanvasProps {
  imageSrc: string;
  result: AnalysisResult | null;
  calibration: CalibrationData;
  showMasks: boolean;
  showBoxes: boolean;
  selectedItemId: string | null;
  onItemClick: (item: ItemInstance) => void;
  onCalibrationUpdate?: (points: [Point, Point]) => void;
  onMaskUpdate?: (itemId: string, newMask: Point[]) => void;
  isCalibrating: boolean;
  editMode: boolean;
}

const ItemCanvas: React.FC<ItemCanvasProps> = ({
  imageSrc,
  result,
  calibration,
  showMasks,
  showBoxes,
  selectedItemId,
  onItemClick,
  onCalibrationUpdate,
  onMaskUpdate,
  isCalibrating,
  editMode
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [calPoints, setCalPoints] = useState<Point[]>([]);

  useEffect(() => {
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      imgRef.current = img;
      render();
    };
  }, [imageSrc, result, showMasks, showBoxes, hoveredItemId, calibration, isCalibrating, calPoints, editMode, selectedItemId]);

  const render = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const containerWidth = canvas.parentElement?.clientWidth || 800;
    const scale = containerWidth / img.width;
    canvas.width = containerWidth;
    canvas.height = img.height * scale;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (result && !isCalibrating) {
      result.items.forEach((item, index) => {
        const isHovered = hoveredItemId === item.id;
        const isSelected = selectedItemId === item.id;
        const effectScale = isHovered ? 1.05 : 1.0;
        
        ctx.save();
        
        // Find centroid for scaling hover effect and label placement
        let cx = 0, cy = 0;
        item.mask.forEach(p => { cx += p.x; cy += p.y; });
        cx = (cx / item.mask.length / 1000) * canvas.width;
        cy = (cy / item.mask.length / 1000) * canvas.height;

        if (isHovered) {
          ctx.translate(cx, cy);
          ctx.scale(effectScale, effectScale);
          ctx.translate(-cx, -cy);
        }

        if (showMasks) {
          ctx.beginPath();
          item.mask.forEach((pt, i) => {
            const x = (pt.x / 1000) * canvas.width;
            const y = (pt.y / 1000) * canvas.height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.closePath();
          
          if (isSelected) {
            ctx.fillStyle = 'rgba(59, 130, 246, 0.7)';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 2;
          } else {
            ctx.fillStyle = isHovered ? 'rgba(16, 185, 129, 0.5)' : 'rgba(16, 185, 129, 0.3)';
            ctx.strokeStyle = isHovered ? '#059669' : '#10b981';
            ctx.lineWidth = 2;
          }
          ctx.fill();
          ctx.stroke();

          // Editing points handles
          if (editMode && isSelected) {
            item.mask.forEach(pt => {
              const x = (pt.x / 1000) * canvas.width;
              const y = (pt.y / 1000) * canvas.height;
              ctx.fillStyle = '#ffffff';
              ctx.strokeStyle = '#2563eb';
              ctx.beginPath();
              ctx.arc(x, y, 5, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            });
          }
        }

        if (showBoxes) {
          const [ymin, xmin, ymax, xmax] = item.boundingBox;
          const x = (xmin / 1000) * canvas.width;
          const y = (ymin / 1000) * canvas.height;
          const w = ((xmax - xmin) / 1000) * canvas.width;
          const h = ((ymax - ymin) / 1000) * canvas.height;
          
          ctx.strokeStyle = isSelected ? '#3b82f6' : 'rgba(255, 255, 255, 0.6)';
          ctx.setLineDash(isSelected ? [] : [5, 5]);
          ctx.lineWidth = isSelected ? 3 : 2;
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
        }

        // Prominent Labels for hovered or selected
        if (isHovered || isSelected) {
          const label = `#${index + 1}`;
          ctx.font = `bold ${isSelected ? '16px' : '14px'} sans-serif`;
          const textMetrics = ctx.measureText(label);
          const padding = 6;
          
          ctx.fillStyle = isSelected ? '#2563eb' : '#059669';
          ctx.fillRect(
            cx - textMetrics.width / 2 - padding, 
            cy - 10 - padding, 
            textMetrics.width + padding * 2, 
            20 + padding * 2
          );
          
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, cx, cy);
        }
        
        ctx.restore();
      });
    }

    // Visible Calibration Line in REVIEW
    if (calibration.startPoint && calibration.endPoint && !isCalibrating) {
      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.setLineDash([8, 4]);
      ctx.lineWidth = 3;
      ctx.shadowBlur = 4;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.moveTo(calibration.startPoint.x, calibration.startPoint.y);
      ctx.lineTo(calibration.endPoint.x, calibration.endPoint.y);
      ctx.stroke();
      
      // End caps
      [calibration.startPoint, calibration.endPoint].forEach(p => {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }

    // Calibration UI Overlay
    if (isCalibrating) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (calPoints.length > 0) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(calPoints[0].x, calPoints[0].y);
        if (calPoints.length === 2) ctx.lineTo(calPoints[1].x, calPoints[1].y);
        ctx.stroke();
        calPoints.forEach(p => {
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isCalibrating) return;
    const canvas = canvasRef.current;
    if (!canvas || !result) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / canvas.width) * 1000;
    const y = ((e.clientY - rect.top) / canvas.height) * 1000;

    const found = result.items.find(s => {
      const [ymin, xmin, ymax, xmax] = s.boundingBox;
      return x >= xmin && x <= xmax && y >= ymin && y <= ymax;
    });
    setHoveredItemId(found?.id || null);
  };

  const handleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isCalibrating) {
      if (calPoints.length < 2) {
        const newPoints = [...calPoints, { x, y }];
        setCalPoints(newPoints);
        if (newPoints.length === 2 && onCalibrationUpdate) {
          onCalibrationUpdate([newPoints[0], newPoints[1]]);
          setCalPoints([]);
        }
      }
      return;
    }

    if (editMode && selectedItemId && result) {
      const normX = (x / canvas.width) * 1000;
      const normY = (y / canvas.height) * 1000;
      const item = result.items.find(i => i.id === selectedItemId);
      if (item && onMaskUpdate) {
        const newMask = [...item.mask, { x: normX, y: normY }];
        onMaskUpdate(item.id, newMask);
      }
      return;
    }

    if (hoveredItemId && result) {
      const item = result.items.find(s => s.id === hoveredItemId);
      if (item) onItemClick(item);
    }
  };

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border-8 border-slate-200 bg-slate-900 shadow-2xl">
      <canvas ref={canvasRef} onMouseMove={handleMouseMove} onClick={handleClick} className="block cursor-crosshair mx-auto" />
      {isCalibrating && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-amber-500 text-white px-8 py-3 rounded-full shadow-2xl font-black animate-bounce text-sm uppercase tracking-widest flex items-center gap-3">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 12h14M12 5l7 7-7 7"/></svg>
          Select Two Reference Points
        </div>
      )}
      {editMode && selectedItemId && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-blue-600/90 backdrop-blur text-white px-6 py-2 rounded-xl shadow-2xl font-black text-xs uppercase tracking-wider">
          Click to add vertices to mask
        </div>
      )}
    </div>
  );
};

export default ItemCanvas;
