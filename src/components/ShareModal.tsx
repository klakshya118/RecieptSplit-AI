import React, { useState } from 'react';
import { ReceiptData, SplitSummary } from '../types';
import { generateSettlementText, formatCurrency } from '../utils/calculator';
import { X, Copy, Check, Share2, Download, FileSpreadsheet, Code } from 'lucide-react';

interface ShareModalProps {
  receipt: ReceiptData;
  summary: SplitSummary;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  receipt,
  summary,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const settlementText = generateSettlementText(receipt, summary);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(settlementText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([settlementText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bill-Split-${(receipt.merchantName || 'Receipt').replace(/\s+/g, '-')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    const headers = ['Participant', 'Assigned Items Count', 'Food Subtotal', 'Tax Share', 'Tip Share', 'Discount Share', 'Total Owed', 'Status'];
    const rows = summary.personBreakdowns.map((b) => [
      `"${b.person.name.replace(/"/g, '""')}"`,
      b.items.length,
      b.itemSubtotal.toFixed(2),
      b.taxShare.toFixed(2),
      b.tipShare.toFixed(2),
      b.discountShare.toFixed(2),
      b.totalOwed.toFixed(2),
      'Pending'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bill-Split-${(receipt.merchantName || 'Receipt').replace(/\s+/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const exportData = {
      receipt: {
        merchant: receipt.merchantName,
        date: receipt.date,
        currency: receipt.currency,
        subtotal: receipt.subtotal,
        tax: receipt.tax,
        tip: receipt.tip,
        discount: receipt.discount,
        total: receipt.total,
        items: receipt.items
      },
      summary: {
        totalCalculatedBill: summary.totalCalculatedBill,
        taxRatePercent: summary.taxRatePercent,
        effectiveTipPercent: summary.effectiveTipPercent,
        personBreakdowns: summary.personBreakdowns.map(b => ({
          personName: b.person.name,
          foodSubtotal: b.itemSubtotal,
          taxShare: b.taxShare,
          tipShare: b.tipShare,
          discountShare: b.discountShare,
          totalOwed: b.totalOwed,
          items: b.items.map(i => ({
            name: i.item.name,
            sharePercent: i.sharePercent,
            allocatedPrice: i.allocatedPrice
          }))
        }))
      }
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bill-Split-${(receipt.merchantName || 'Receipt').replace(/\s+/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-white max-w-lg w-full border-4 border-black p-6 flex flex-col max-h-[90vh] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-4 border-black">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-black text-white flex items-center justify-center border-2 border-black">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-lg text-black uppercase tracking-tight font-mono">
                SHARE BREAKDOWN
              </h3>
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                Export text summary, CSV, or JSON
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-black hover:bg-black hover:text-white border-2 border-black transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Summary Preview */}
        <div className="my-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <div className="bg-neutral-50 p-2.5 border-2 border-black">
            <span className="text-[9px] text-neutral-500 block font-black uppercase tracking-widest">TOTAL BILL</span>
            <span className="text-base font-black text-black font-mono">
              {formatCurrency(summary.totalCalculatedBill, receipt.currency)}
            </span>
          </div>
          <div className="bg-neutral-50 p-2.5 border-2 border-black">
            <span className="text-[9px] text-neutral-500 block font-black uppercase tracking-widest">PARTICIPANTS</span>
            <span className="text-base font-black text-black uppercase font-mono">
              {summary.personBreakdowns.length} PEOPLE
            </span>
          </div>
          <div className="bg-neutral-50 p-2.5 border-2 border-black col-span-2 sm:col-span-1">
            <span className="text-[9px] text-neutral-500 block font-black uppercase tracking-widest">TAX + TIP</span>
            <span className="text-base font-black text-black font-mono">
              {formatCurrency(receipt.tax + receipt.tip, receipt.currency)}
            </span>
          </div>
        </div>

        {/* Formatted Text Box */}
        <div className="flex-1 overflow-y-auto bg-black text-white p-4 font-mono text-xs leading-relaxed border-2 border-black select-all">
          <pre className="whitespace-pre-wrap">{settlementText}</pre>
        </div>

        {/* Actions Bar */}
        <div className="mt-4 pt-3 border-t-2 border-black flex flex-wrap gap-2 items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleDownloadTxt}
              className="inline-flex items-center space-x-1 px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-black bg-white hover:bg-neutral-100 border-2 border-black transition-colors"
              title="Download formatted text file"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.TXT</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="inline-flex items-center space-x-1 px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-black bg-white hover:bg-neutral-100 border-2 border-black transition-colors"
              title="Export as CSV for Excel or Google Sheets"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>.CSV</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadJson}
              className="inline-flex items-center space-x-1 px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-black bg-white hover:bg-neutral-100 border-2 border-black transition-colors"
              title="Export as raw JSON data"
            >
              <Code className="w-3.5 h-3.5" />
              <span>.JSON</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider text-white bg-black hover:bg-neutral-800 border-2 border-black transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-400" />
                <span>COPIED!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>COPY SUMMARY</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
