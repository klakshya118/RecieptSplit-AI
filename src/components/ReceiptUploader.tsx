import React, { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, 
  Camera, 
  Sparkles, 
  FileText, 
  Image as ImageIcon, 
  Loader2, 
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { SAMPLE_RECEIPTS } from '../data/sampleReceipts';

interface ReceiptUploaderProps {
  onImageUploaded: (base64Image: string, mimeType: string) => Promise<void>;
  onTextParsed: (text: string) => Promise<void>;
  onSelectSample: (sampleId: string) => void;
  isLoading: boolean;
}

// Compress and resize image before upload to prevent network timeouts
const compressImageFile = async (
  file: File,
  maxDimension = 1600,
  quality = 0.85
): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ base64: e.target?.result as string, mimeType: file.type || 'image/jpeg' });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const mimeType = 'image/jpeg';
        const base64 = canvas.toDataURL(mimeType, quality);
        resolve({ base64, mimeType });
      };
      img.onerror = () => {
        resolve({ base64: e.target?.result as string, mimeType: file.type || 'image/jpeg' });
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const ReceiptUploader: React.FC<ReceiptUploaderProps> = ({
  onImageUploaded,
  onTextParsed,
  onSelectSample,
  isLoading,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [mode, setMode] = useState<'upload' | 'text'>('upload');
  const [rawText, setRawText] = useState('');
  const [loadingStep, setLoadingStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const loadingSteps = [
    'Optimizing receipt image & contacting AI...',
    'Scanning receipt image with Gemini Vision...',
    'Detecting line items, prices & quantities...',
    'Extracting subtotal, tax and tip details...',
    'Formatting structured bill data...',
  ];

  useEffect(() => {
    let interval: any;
    if (isLoading) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev < loadingSteps.length - 1 ? prev + 1 : prev));
      }, 1200);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Support clipboard paste for screenshots
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            handleFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file (JPG, PNG, WEBP, etc.)');
      return;
    }
    setErrorMsg(null);

    try {
      // Compress and optimize image to ensure ultra-fast and reliable upload
      const { base64, mimeType } = await compressImageFile(file);
      await onImageUploaded(base64, mimeType);
    } catch (err: any) {
      console.error('Image compression or upload error:', err);
      setErrorMsg(err.message || 'Failed to process image. Please try again or test with a sample receipt below.');
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 sm:p-8 max-w-xl mx-auto">
      {/* Title & Subtitle */}
      <div className="text-center mb-6">
        <div className="inline-flex p-3 bg-black text-white mb-3 border-2 border-black">
          <UploadCloud className="w-8 h-8" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-black uppercase tracking-tight font-mono">
          UPLOAD RECEIPT
        </h2>
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mt-1">
          Take a photo, drag & drop, or select a preset sample
        </p>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-neutral-100 border-2 border-black text-black text-xs font-bold uppercase tracking-wide flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-black" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Loading Overlay State */}
      {isLoading ? (
        <div className="py-12 px-4 border-4 border-black bg-neutral-50 text-center flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            <Loader2 className="w-10 h-10 text-black animate-spin" />
            <Sparkles className="w-4 h-4 text-black absolute -top-1 -right-1 animate-pulse" />
          </div>
          <div>
            <h3 className="font-black text-black text-sm uppercase tracking-wider">
              AI SCANNING RECEIPT...
            </h3>
            <p className="text-xs text-neutral-600 font-bold uppercase tracking-wider mt-1 animate-fade-in">
              {loadingSteps[loadingStep]}
            </p>
          </div>
        </div>
      ) : (
        <div>
          {/* Toggle Upload Mode */}
          <div className="flex bg-neutral-100 border-2 border-black p-1 mb-5">
            <button
              type="button"
              onClick={() => setMode('upload')}
              className={`flex-1 py-2 text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center space-x-1.5 ${
                mode === 'upload'
                  ? 'bg-black text-white'
                  : 'text-black hover:bg-neutral-200'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>IMAGE FILE</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('text')}
              className={`flex-1 py-2 text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center space-x-1.5 ${
                mode === 'text'
                  ? 'bg-black text-white'
                  : 'text-black hover:bg-neutral-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>PASTE TEXT</span>
            </button>
          </div>

          {mode === 'upload' ? (
            /* Drag & Drop Zone */
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-4 border-dashed border-black p-8 text-center cursor-pointer transition-all ${
                dragActive
                  ? 'bg-neutral-200 scale-[0.99]'
                  : 'hover:bg-neutral-100'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFile(e.target.files[0]);
                  }
                }}
              />

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFile(e.target.files[0]);
                  }
                }}
              />

              <div className="flex flex-col items-center space-y-3">
                <div className="w-12 h-12 border-2 border-black bg-white flex items-center justify-center text-black">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-black text-black uppercase tracking-wider">
                    CLICK TO BROWSE OR DRAG & DROP RECEIPT PHOTO
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mt-1 font-mono">
                    JPG, PNG, WEBP • CTRL+V TO PASTE SCREENSHOT
                  </p>
                </div>

                <div className="pt-2 flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      cameraInputRef.current?.click();
                    }}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-black bg-white hover:bg-black hover:text-white border-2 border-black transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Take Photo</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Paste Raw Text / Digital Receipt */
            <div className="space-y-3">
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste receipt lines, e.g.:
1x Loaded Queso Nachos $14.50
2x Baja Fish Tacos $31.00
1x House Margarita $28.00
Tax: $6.85
Total: $80.35"
                rows={6}
                className="w-full text-xs font-mono p-3 border-2 border-black focus:outline-none uppercase font-bold"
              />
              <button
                type="button"
                disabled={!rawText.trim()}
                onClick={() => onTextParsed(rawText)}
                className="w-full py-3 px-4 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center space-x-1.5 border-2 border-black transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>PARSE TEXT WITH AI</span>
              </button>
            </div>
          )}

          {/* Preset Sample Receipts Section */}
          <div className="mt-8 pt-6 border-t-2 border-black">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">
                PRESET SAMPLE BILLS:
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {SAMPLE_RECEIPTS.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => onSelectSample(sample.id)}
                  className="text-left p-3 border-2 border-black hover:bg-black hover:text-white transition-all flex flex-col justify-between group bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-tight truncate">
                        {sample.merchant}
                      </span>
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 group-hover:text-neutral-300 mt-0.5 line-clamp-1">
                      {sample.tag}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] font-mono font-bold uppercase">
                    <span>{sample.items.length} ITEMS</span>
                    <span className="group-hover:translate-x-0.5 transition-transform flex items-center">
                      LOAD <ArrowRight className="w-3 h-3 ml-0.5" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
