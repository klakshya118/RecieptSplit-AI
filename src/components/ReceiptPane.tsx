import React, { useState } from 'react';
import { 
  ReceiptData, 
  Person, 
  ItemAssignments, 
  SplitSummary, 
  ReceiptItem 
} from '../types';
import { ReceiptItemCard } from './ReceiptItemCard';
import { formatCurrency } from '../utils/calculator';
import { 
  Store, 
  Calendar, 
  Plus, 
  Search, 
  Sparkles, 
  Percent, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2, 
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Share2
} from 'lucide-react';

interface ReceiptPaneProps {
  receipt: ReceiptData;
  people: Person[];
  assignments: ItemAssignments;
  summary: SplitSummary;
  onTogglePerson: (itemId: string, personId: string) => void;
  onUpdateItem: (updatedItem: ReceiptItem) => void;
  onDeleteItem: (itemId: string) => void;
  onAddItem: (newItem: Omit<ReceiptItem, 'id'>) => void;
  onUpdateReceiptTotals: (tax: number, tip: number, tipType: 'percentage' | 'fixed', tipPercentage: number, discount: number) => void;
  onUpdateMerchant: (merchantName: string) => void;
  onAssignRemainingEvenly: () => void;
}

export const ReceiptPane: React.FC<ReceiptPaneProps> = ({
  receipt,
  people,
  assignments,
  summary,
  onTogglePerson,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  onUpdateReceiptTotals,
  onUpdateMerchant,
  onAssignRemainingEvenly,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [isEditingMerchant, setIsEditingMerchant] = useState(false);
  const [merchantNameInput, setMerchantNameInput] = useState(receipt.merchantName);

  // New Item State
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemCat, setNewItemCat] = useState('General');

  // Tip & Tax Controls
  const [customTipActive, setCustomTipActive] = useState(false);

  // Categories list
  const categories: string[] = ['all', ...Array.from(new Set<string>(receipt.items.map((i) => i.category || 'Item')))];

  const filteredItems = receipt.items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || (item.category || 'Item') === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleAddNewItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !newItemPrice) return;

    const qty = parseInt(newItemQty, 10) || 1;
    const price = parseFloat(newItemPrice) || 0;

    onAddItem({
      name: newItemName.trim(),
      quantity: qty,
      unitPrice: qty > 0 ? price / qty : price,
      totalPrice: price,
      category: newItemCat.trim() || 'General',
    });

    setNewItemName('');
    setNewItemPrice('');
    setNewItemQty('1');
    setShowAddItemModal(false);
  };

  const handleQuickTip = (percent: number) => {
    const tipAmount = Math.round((receipt.subtotal * (percent / 100)) * 100) / 100;
    onUpdateReceiptTotals(receipt.tax, tipAmount, 'percentage', percent, receipt.discount);
    setCustomTipActive(false);
  };

  const handleCustomTipChange = (val: string) => {
    const tipVal = parseFloat(val) || 0;
    onUpdateReceiptTotals(receipt.tax, tipVal, 'fixed', 0, receipt.discount);
  };

  const handleTaxChange = (val: string) => {
    const taxVal = parseFloat(val) || 0;
    onUpdateReceiptTotals(taxVal, receipt.tip, receipt.tipType || 'fixed', receipt.tipPercentage || 0, receipt.discount);
  };

  const handleDiscountChange = (val: string) => {
    const discountVal = parseFloat(val) || 0;
    onUpdateReceiptTotals(receipt.tax, receipt.tip, receipt.tipType || 'fixed', receipt.tipPercentage || 0, discountVal);
  };

  return (
    <div className="flex flex-col h-full bg-white border-r-4 md:border-r-8 border-black">
      
      {/* Receipt Header Banner */}
      <div className="bg-white p-4 sm:p-5 border-b-4 border-black">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {isEditingMerchant ? (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={merchantNameInput}
                  onChange={(e) => setMerchantNameInput(e.target.value)}
                  className="font-black text-xl sm:text-2xl uppercase tracking-tight text-black border-2 border-black px-2 py-1 focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    onUpdateMerchant(merchantNameInput.trim() || receipt.merchantName);
                    setIsEditingMerchant(false);
                  }}
                  className="px-3 py-1.5 text-xs bg-black text-white font-black uppercase tracking-wider hover:bg-neutral-800"
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2 group">
                <Store className="w-6 h-6 text-black shrink-0" />
                <h2 
                  onClick={() => setIsEditingMerchant(true)}
                  className="font-black text-2xl sm:text-3xl text-black tracking-tight uppercase truncate cursor-pointer hover:underline"
                  title="Click to rename merchant"
                >
                  {receipt.merchantName}
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 group-hover:text-black cursor-pointer">
                  [edit]
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs font-bold uppercase tracking-wider text-neutral-500 font-mono">
              <span className="flex items-center text-black">
                <Calendar className="w-3.5 h-3.5 mr-1" />
                {receipt.date || 'Today'}
              </span>
              <span>•</span>
              <span className="text-black">
                {receipt.items.length} {receipt.items.length === 1 ? 'item' : 'items'}
              </span>
              {receipt.imageUrl && (
                <>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => setShowImagePreview(!showImagePreview)}
                    className="text-black hover:bg-black hover:text-white px-1.5 py-0.5 border border-black inline-flex items-center transition-colors"
                  >
                    <ImageIcon className="w-3 h-3 mr-1" />
                    {showImagePreview ? 'Hide Receipt' : 'View Image'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Quick Add Line Item */}
          <button
            type="button"
            onClick={() => setShowAddItemModal(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-black uppercase tracking-wider text-black bg-white hover:bg-black hover:text-white border-2 border-black transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Item</span>
          </button>
        </div>

        {/* Collapsible Image Preview */}
        {showImagePreview && receipt.imageUrl && (
          <div className="mt-4 p-2 bg-neutral-100 border-2 border-black">
            <div className="max-h-48 overflow-y-auto">
              <img 
                src={receipt.imageUrl} 
                alt="Original Receipt" 
                className="w-full object-contain border border-black"
              />
            </div>
          </div>
        )}
      </div>

      {/* Assignment Status Notice Bar */}
      <div className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider flex items-center justify-between border-b-2 border-black ${
        summary.isFullyAssigned 
          ? 'bg-black text-white' 
          : 'bg-neutral-100 text-black'
      }`}>
        <div className="flex items-center space-x-2">
          {summary.isFullyAssigned ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              <span>All items assigned</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-black shrink-0" />
              <span>
                {summary.unassignedItems.length} UNASSIGNED ({formatCurrency(summary.unassignedSubtotal, receipt.currency)})
              </span>
            </>
          )}
        </div>

        {!summary.isFullyAssigned && people.length > 0 && (
          <button
            type="button"
            onClick={onAssignRemainingEvenly}
            className="text-[10px] font-black uppercase tracking-widest underline hover:bg-black hover:text-white px-1.5 py-0.5 transition-colors"
          >
            Split evenly
          </button>
        )}
      </div>

      {/* Items Filter / Search Bar */}
      {receipt.items.length > 4 && (
        <div className="p-3 bg-white border-b-2 border-black flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-black absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="SEARCH ITEMS..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-white border-2 border-black focus:outline-none"
            />
          </div>

          {categories.length > 2 && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs font-black uppercase tracking-wider bg-white border-2 border-black px-2 py-1.5 text-black focus:outline-none"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'ALL CATEGORIES' : cat.toUpperCase()}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Scrollable Receipt Line Items List */}
      <div className="flex-1 overflow-y-auto">
        {filteredItems.length === 0 ? (
          <div className="text-center py-16 text-neutral-400 text-xs font-black uppercase tracking-widest">
            No items matching "{searchQuery}"
          </div>
        ) : (
          filteredItems.map((item, idx) => (
            <ReceiptItemCard
              key={item.id}
              item={item}
              itemIndex={idx}
              currency={receipt.currency}
              people={people}
              assignments={assignments}
              onTogglePerson={onTogglePerson}
              onUpdateItem={onUpdateItem}
              onDeleteItem={onDeleteItem}
            />
          ))
        )}
      </div>

      {/* Sticky Bottom Receipt Calculations (Subtotal, Tax, Tip, Total) */}
      <div className="bg-white border-t-4 border-black p-4">
        <div className="space-y-2 text-xs font-bold uppercase tracking-wider">
          
          {/* Subtotal */}
          <div className="flex justify-between items-center text-neutral-700">
            <span>Subtotal</span>
            <span className="font-black text-black text-sm font-mono">
              {formatCurrency(receipt.subtotal, receipt.currency)}
            </span>
          </div>

          {/* Tax Configuration */}
          <div className="flex justify-between items-center text-neutral-700">
            <div className="flex items-center space-x-1.5">
              <span>Tax ({summary.taxRatePercent}%)</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-black font-mono">{receipt.currency}</span>
              <input
                type="number"
                step="0.01"
                value={receipt.tax}
                onChange={(e) => handleTaxChange(e.target.value)}
                className="w-20 text-right font-mono font-black border-2 border-black px-1.5 py-0.5 focus:outline-none"
              />
            </div>
          </div>

          {/* Tip Configuration with Quick % Buttons */}
          <div className="pt-1">
            <div className="flex justify-between items-center text-neutral-700 mb-1.5">
              <div className="flex items-center space-x-1.5">
                <span>Tip ({summary.effectiveTipPercent}%)</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-black font-mono">{receipt.currency}</span>
                <input
                  type="number"
                  step="0.01"
                  value={receipt.tip}
                  onChange={(e) => handleCustomTipChange(e.target.value)}
                  className="w-20 text-right font-mono font-black border-2 border-black px-1.5 py-0.5 focus:outline-none"
                />
              </div>
            </div>

            {/* Quick Tip Chips */}
            <div className="grid grid-cols-4 gap-1.5">
              {[15, 18, 20, 25].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleQuickTip(pct)}
                  className={`py-1.5 text-xs font-black uppercase tracking-wider border-2 border-black transition-colors ${
                    receipt.tipType === 'percentage' && receipt.tipPercentage === pct
                      ? 'bg-black text-white'
                      : 'bg-white text-black hover:bg-neutral-100'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Discount if present */}
          {receipt.discount > 0 && (
            <div className="flex justify-between items-center text-black">
              <span>Discount</span>
              <span className="font-mono font-black">
                -{formatCurrency(receipt.discount, receipt.currency)}
              </span>
            </div>
          )}

          {/* Grand Total */}
          <div className="pt-3 border-t-2 border-black flex justify-between items-baseline">
            <div>
              <span className="font-black text-base text-black tracking-tight">TOTAL BILL</span>
            </div>
            <span className="text-2xl sm:text-3xl font-black text-black font-mono">
              {formatCurrency(summary.totalCalculatedBill, receipt.currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Add Custom Item Modal */}
      {showAddItemModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 max-w-sm w-full border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <h3 className="text-xl font-black text-black uppercase tracking-tight mb-4">
              Add Line Item
            </h3>
            <form onSubmit={handleAddNewItemSubmit} className="space-y-4 text-xs font-bold uppercase tracking-wider">
              <div>
                <label className="block mb-1 text-black">
                  Item Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Garlic Bread"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full p-2 border-2 border-black focus:outline-none"
                  autoFocus
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-black">
                    Total Price ({receipt.currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="8.50"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.target.value)}
                    className="w-full p-2 border-2 border-black font-mono focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block mb-1 text-black">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newItemQty}
                    onChange={(e) => setNewItemQty(e.target.value)}
                    className="w-full p-2 border-2 border-black font-mono focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block mb-1 text-black">
                  Category (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Starters, Drinks"
                  value={newItemCat}
                  onChange={(e) => setNewItemCat(e.target.value)}
                  className="w-full p-2 border-2 border-black focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddItemModal(false)}
                  className="px-3 py-2 text-black hover:bg-neutral-100 border-2 border-black font-black uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-black text-white hover:bg-neutral-800 font-black uppercase tracking-wider border-2 border-black"
                >
                  Add Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
