import React, { useState } from 'react';
import { 
  ReceiptData, 
  Person, 
  SplitSummary, 
  PersonBreakdown 
} from '../types';
import { 
  formatCurrency, 
  generateSettlementText 
} from '../utils/calculator';
import { 
  Check, 
  Copy, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface SettlementSummaryProps {
  receipt: ReceiptData;
  people: Person[];
  summary: SplitSummary;
  onTogglePaid?: (personId: string) => void;
  paidStatus: Record<string, boolean>;
}

export const SettlementSummary: React.FC<SettlementSummaryProps> = ({
  receipt,
  people,
  summary,
  onTogglePaid,
  paidStatus,
}) => {
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedPersonId, setCopiedPersonId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedPersonId(expandedPersonId === id ? null : id);
  };

  const handleCopyAll = async () => {
    const text = generateSettlementText(receipt, summary);
    await navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleCopyPersonShare = async (e: React.MouseEvent, b: PersonBreakdown) => {
    e.stopPropagation();
    const lines = [
      `🧾 ${receipt.merchantName || 'Bill'}: ${b.person.name}'s Share`,
      `Total: ${formatCurrency(b.totalOwed, receipt.currency)}`,
      `Items (${formatCurrency(b.itemSubtotal, receipt.currency)}):`,
      ...b.items.map(
        (i) =>
          ` • ${i.item.name} (${formatCurrency(i.allocatedPrice, receipt.currency)}${
            i.sharePercent < 99 ? ` - ${Math.round(i.sharePercent)}% share` : ''
          })`
      ),
      b.taxShare > 0 ? `Tax: ${formatCurrency(b.taxShare, receipt.currency)}` : '',
      b.tipShare > 0 ? `Tip: ${formatCurrency(b.tipShare, receipt.currency)}` : '',
      b.discountShare > 0 ? `Discount: -${formatCurrency(b.discountShare, receipt.currency)}` : '',
    ].filter(Boolean);

    await navigator.clipboard.writeText(lines.join('\n'));
    setCopiedPersonId(b.person.id);
    setTimeout(() => setCopiedPersonId(null), 2000);
  };

  const fireConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  const assignedPercentage =
    receipt.subtotal > 0
      ? Math.min(100, Math.round((summary.totalAssignedSubtotal / receipt.subtotal) * 100))
      : 0;

  return (
    <div className="space-y-4">
      
      {/* Top Settlement Stats Bar */}
      <div className="bg-white border-4 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest block">
              ALLOCATION PROGRESS
            </span>
            <div className="flex items-baseline space-x-2 mt-0.5">
              <span className="text-2xl sm:text-3xl font-black text-black tracking-tight font-mono">
                {assignedPercentage}%
              </span>
              <span className="text-xs font-bold text-neutral-500 font-mono">
                ({formatCurrency(summary.totalAssignedSubtotal, receipt.currency)} / {formatCurrency(receipt.subtotal, receipt.currency)})
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyAll}
            className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-black uppercase tracking-wider text-black bg-white hover:bg-black hover:text-white border-2 border-black transition-colors"
            title="Copy formatted settlement text for group chat"
          >
            {copiedText ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-500" />
                <span>COPIED!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>COPY ALL</span>
              </>
            )}
          </button>
        </div>

        {/* High-Contrast Progress Bar */}
        <div className="w-full bg-neutral-200 h-3 border-2 border-black overflow-hidden flex">
          <div
            className="h-full bg-black transition-all duration-300"
            style={{ width: `${assignedPercentage}%` }}
          />
        </div>

        {/* Unassigned Warning Pill */}
        {!summary.isFullyAssigned && (
          <div className="mt-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-black bg-neutral-100 p-2 border-2 border-black">
            <span className="flex items-center">
              <AlertCircle className="w-4 h-4 text-black mr-2 shrink-0" />
              {summary.unassignedItems.length} ITEMS ({formatCurrency(summary.unassignedSubtotal, receipt.currency)}) UNASSIGNED
            </span>
          </div>
        )}
      </div>

      {/* Person Breakdown Cards Grid */}
      <div className="space-y-3">
        {summary.personBreakdowns.length === 0 ? (
          <div className="bg-white border-4 border-dashed border-black p-8 text-center text-black text-xs font-black uppercase tracking-widest">
            No participants assigned yet. Type commands in the chat below.
          </div>
        ) : (
          summary.personBreakdowns.map((b) => {
            const isExpanded = expandedPersonId === b.person.id;
            const isPaid = paidStatus[b.person.id] || false;

            return (
              <div
                key={b.person.id}
                id={`person-summary-${b.person.id}`}
                className={`bg-white border-2 sm:border-4 border-black transition-all ${
                  isPaid
                    ? 'bg-neutral-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    : 'shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
                }`}
              >
                {/* Person Header Card */}
                <div
                  onClick={() => toggleExpand(b.person.id)}
                  className="p-3.5 flex items-center justify-between cursor-pointer select-none"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    {/* Avatar Box */}
                    <div className="w-9 h-9 bg-black text-white flex items-center justify-center font-black text-sm uppercase border border-black shrink-0 font-mono">
                      {b.person.name.charAt(0).toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-black text-sm sm:text-base text-black uppercase tracking-tight truncate">
                          {b.person.name}
                        </h4>
                        {isPaid && (
                          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-black text-white">
                            PAID ✓
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 font-mono">
                        {b.items.length} {b.items.length === 1 ? 'ITEM' : 'ITEMS'} • {b.percentageOfBill}% OF BILL
                      </p>
                    </div>
                  </div>

                  {/* Right Side: Total Owed & Actions */}
                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <span className="text-lg sm:text-xl font-black text-black font-mono block">
                        {formatCurrency(b.totalOwed, receipt.currency)}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400">
                        INCL. TAX & TIP
                      </span>
                    </div>

                    {/* Paid Checkbox toggle */}
                    {onTogglePaid && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePaid(b.person.id);
                          if (!isPaid) fireConfetti();
                        }}
                        className={`p-2 border-2 border-black text-xs font-black uppercase transition-colors ${
                          isPaid
                            ? 'bg-black text-white'
                            : 'bg-white text-black hover:bg-neutral-100'
                        }`}
                        title={isPaid ? 'Mark as unpaid' : 'Mark as paid'}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Expand / Collapse Icon */}
                    <div className="text-black">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Itemized Proportional Breakdown */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t-2 border-black text-xs bg-neutral-50">
                    
                    {/* Item list */}
                    <div className="space-y-2 my-2">
                      <div className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">
                        ITEMIZED SHARES:
                      </div>
                      {b.items.length === 0 ? (
                        <div className="text-neutral-400 text-[11px] font-bold uppercase">
                          No items assigned yet
                        </div>
                      ) : (
                        b.items.map((alloc) => (
                          <div
                            key={alloc.item.id}
                            className="flex justify-between items-center text-black font-bold uppercase"
                          >
                            <span className="truncate pr-2">
                              {alloc.item.name}
                              {alloc.sharePercent < 99 && (
                                <span className="text-[10px] text-neutral-500 ml-1 font-mono">
                                  ({Math.round(alloc.sharePercent)}%)
                                </span>
                              )}
                            </span>
                            <span className="font-mono font-black shrink-0">
                              {formatCurrency(alloc.allocatedPrice, receipt.currency)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Proportional Tax & Tip line items */}
                    <div className="pt-2 border-t-2 border-black space-y-1 text-black font-bold uppercase text-[11px]">
                      <div className="flex justify-between">
                        <span>Items Subtotal:</span>
                        <span className="font-mono">{formatCurrency(b.itemSubtotal, receipt.currency)}</span>
                      </div>
                      {b.taxShare > 0 && (
                        <div className="flex justify-between">
                          <span>Tax ({summary.taxRatePercent}%):</span>
                          <span className="font-mono">+{formatCurrency(b.taxShare, receipt.currency)}</span>
                        </div>
                      )}
                      {b.tipShare > 0 && (
                        <div className="flex justify-between">
                          <span>Tip ({summary.effectiveTipPercent}%):</span>
                          <span className="font-mono">+{formatCurrency(b.tipShare, receipt.currency)}</span>
                        </div>
                      )}
                      {b.discountShare > 0 && (
                        <div className="flex justify-between">
                          <span>Discount:</span>
                          <span className="font-mono">-{formatCurrency(b.discountShare, receipt.currency)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-black text-sm text-black pt-1.5 border-t border-black">
                        <span>FINAL TOTAL OWED:</span>
                        <span className="font-mono">
                          {formatCurrency(b.totalOwed, receipt.currency)}
                        </span>
                      </div>
                    </div>

                    {/* Copy Person Share button */}
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={(e) => handleCopyPersonShare(e, b)}
                        className="inline-flex items-center space-x-1 text-[10px] font-black uppercase tracking-wider text-black bg-white hover:bg-black hover:text-white border-2 border-black px-2.5 py-1 transition-colors"
                      >
                        {copiedPersonId === b.person.id ? (
                          <>
                            <Check className="w-3 h-3 text-green-500" />
                            <span>COPIED!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>COPY {b.person.name.toUpperCase()}'S SHARE</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
