import React, { useState } from 'react';
import { 
  Receipt, 
  Users, 
  Share2, 
  RotateCcw, 
  Sparkles, 
  UploadCloud, 
  Check, 
  Copy,
  ChevronDown
} from 'lucide-react';
import { ReceiptData, Person, SplitSummary } from '../types';
import { SAMPLE_RECEIPTS } from '../data/sampleReceipts';

interface HeaderProps {
  receipt: ReceiptData | null;
  people: Person[];
  summary: SplitSummary;
  onSelectSample: (sampleId: string) => void;
  onOpenPeopleManager: () => void;
  onOpenShareModal: () => void;
  onResetBill: () => void;
  onUploadNewReceipt: () => void;
  currency: string;
  onCurrencyChange: (curr: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  receipt,
  people,
  summary,
  onSelectSample,
  onOpenPeopleManager,
  onOpenShareModal,
  onResetBill,
  onUploadNewReceipt,
  currency,
  onCurrencyChange,
}) => {
  const [showSampleDropdown, setShowSampleDropdown] = useState(false);
  const [copiedQuick, setCopiedQuick] = useState(false);

  const currencies = ['$', '€', '£', '₹', '¥', 'C$'];

  return (
    <header className="bg-white border-b-4 md:border-b-8 border-black sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        
        {/* Logo & Brand Title */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-black flex items-center justify-center text-white border-2 border-black">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-black text-2xl sm:text-3xl text-black tracking-tighter uppercase font-mono">
                Split<span className="text-neutral-500">/</span>AI
              </span>
              <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-black uppercase tracking-widest bg-black text-white">
                <span className="w-2 h-2 rounded-full bg-green-500 mr-1.5 animate-pulse"></span>
                Live
              </span>
            </div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-neutral-500 hidden sm:block">
              {receipt ? `RECEIPT: #${receipt.id.slice(-6).toUpperCase()}` : 'AI RECEIPT SPLITTING ASSISTANT'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          
          {/* Sample Receipts Dropdown */}
          <div className="relative">
            <button
              id="sample-receipts-button"
              type="button"
              onClick={() => setShowSampleDropdown(!showSampleDropdown)}
              className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-black uppercase tracking-wider text-black bg-white border-2 border-black hover:bg-black hover:text-white transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Samples</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {showSampleDropdown && (
              <div 
                className="absolute right-0 mt-2 w-64 bg-white border-4 border-black py-1 z-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                onClick={() => setShowSampleDropdown(false)}
              >
                <div className="px-3 py-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest border-b-2 border-black">
                  Select Preset Receipt
                </div>
                {SAMPLE_RECEIPTS.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => onSelectSample(sample.id)}
                    className="w-full text-left px-3 py-2.5 hover:bg-black hover:text-white flex flex-col group transition-colors border-b border-neutral-100 last:border-b-0"
                  >
                    <span className="font-black text-xs uppercase tracking-tight">
                      {sample.title}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 group-hover:text-neutral-300">
                      {sample.tag} • {sample.items.length} items
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Upload New Receipt button */}
          <button
            id="upload-receipt-header-button"
            type="button"
            onClick={onUploadNewReceipt}
            className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-black uppercase tracking-wider text-black bg-white border-2 border-black hover:bg-black hover:text-white transition-colors"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Upload</span>
          </button>

          {/* People Count / Manager */}
          <button
            id="manage-people-header-button"
            type="button"
            onClick={onOpenPeopleManager}
            className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-black uppercase tracking-wider text-black bg-white border-2 border-black hover:bg-black hover:text-white transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            <span>{people.length} People</span>
          </button>

          {/* Currency Switcher */}
          <select
            id="currency-selector"
            aria-label="Currency"
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value)}
            className="text-xs font-black bg-white border-2 border-black text-black px-2.5 py-2 uppercase tracking-wider focus:outline-none"
          >
            {currencies.map((curr) => (
              <option key={curr} value={curr}>
                {curr}
              </option>
            ))}
          </select>

          {/* Share / Export Summary */}
          {receipt && (
            <button
              id="share-summary-button"
              type="button"
              onClick={onOpenShareModal}
              className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider text-white bg-black hover:bg-neutral-800 transition-colors border-2 border-black"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Share</span>
            </button>
          )}

          {/* Reset Bill */}
          {receipt && (
            <button
              id="reset-bill-header-button"
              type="button"
              onClick={onResetBill}
              className="p-2 text-black bg-white border-2 border-black hover:bg-black hover:text-white transition-colors"
              title="Reset allocations"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
