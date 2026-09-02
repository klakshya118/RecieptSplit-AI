import React, { useState } from 'react';
import { 
  ReceiptItem, 
  Person, 
  ItemAssignments 
} from '../types';
import { formatCurrency } from '../utils/calculator';
import { 
  UserPlus, 
  X, 
  Edit3, 
  Check, 
  AlertCircle, 
  Trash2, 
  Tag
} from 'lucide-react';

interface ReceiptItemCardProps {
  item: ReceiptItem;
  itemIndex?: number;
  currency: string;
  people: Person[];
  assignments: ItemAssignments;
  onTogglePerson: (itemId: string, personId: string) => void;
  onUpdateItem: (updatedItem: ReceiptItem) => void;
  onDeleteItem: (itemId: string) => void;
}

export const ReceiptItemCard: React.FC<ReceiptItemCardProps> = ({
  item,
  itemIndex,
  currency,
  people,
  assignments,
  onTogglePerson,
  onUpdateItem,
  onDeleteItem,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editPrice, setEditPrice] = useState(item.totalPrice.toString());
  const [editQty, setEditQty] = useState(item.quantity.toString());
  const [showAssignMenu, setShowAssignMenu] = useState(false);

  const assignedShares = assignments[item.id] || [];
  const totalWeight = assignedShares.reduce((sum, s) => sum + (s.weight || 1), 0);
  const isUnassigned = assignedShares.length === 0;

  const handleSaveEdit = () => {
    const parsedPrice = parseFloat(editPrice) || item.totalPrice;
    const parsedQty = parseInt(editQty, 10) || item.quantity;
    onUpdateItem({
      ...item,
      name: editName.trim() || item.name,
      totalPrice: parsedPrice,
      quantity: parsedQty,
      unitPrice: parsedQty > 0 ? parsedPrice / parsedQty : parsedPrice,
    });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditName(item.name);
    setEditPrice(item.totalPrice.toString());
    setEditQty(item.quantity.toString());
    setIsEditing(false);
  };

  const formattedIdx = typeof itemIndex === 'number' ? String(itemIndex + 1).padStart(2, '0') : null;

  return (
    <div 
      id={`receipt-item-${item.id}`}
      className={`group relative border-b-2 border-black py-3 px-2 sm:px-3 transition-colors ${
        isUnassigned 
          ? 'bg-white hover:bg-neutral-50' 
          : 'bg-neutral-100/80 hover:bg-neutral-100'
      }`}
    >
      {/* Main Item Row */}
      {isEditing ? (
        <div className="space-y-2 py-1">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Item name"
              className="flex-1 text-sm font-black uppercase border-2 border-black px-2.5 py-1.5 focus:outline-none"
              autoFocus
            />
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              <span className="text-xs font-black uppercase">Qty:</span>
              <input
                type="number"
                min="1"
                value={editQty}
                onChange={(e) => setEditQty(e.target.value)}
                className="w-16 text-xs font-black border-2 border-black px-2 py-1 focus:outline-none"
              />
            </div>
            <div className="flex items-center space-x-1 flex-1">
              <span className="text-xs font-black uppercase">Total:</span>
              <input
                type="number"
                step="0.01"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                className="w-28 text-xs font-black border-2 border-black px-2 py-1 focus:outline-none font-mono"
              />
            </div>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={handleSaveEdit}
                className="p-1.5 bg-black text-white hover:bg-neutral-800 text-xs font-black uppercase"
                title="Save changes"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="p-1.5 bg-neutral-200 text-black hover:bg-neutral-300 text-xs font-black uppercase"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between gap-2">
            {/* Number Index badge */}
            {formattedIdx && (
              <span className="w-8 sm:w-10 text-base sm:text-lg font-black text-black shrink-0 font-mono">
                {formattedIdx}
              </span>
            )}

            {/* Left: Quantity, Name & Category */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                {item.quantity > 1 && (
                  <span className="inline-flex items-center px-1.5 py-0.2 text-[10px] font-black uppercase bg-black text-white">
                    {item.quantity}×
                  </span>
                )}
                <h4 className="text-sm sm:text-base font-bold uppercase tracking-tight text-black truncate font-mono">
                  {item.name}
                </h4>
              </div>

              <div className="flex items-center space-x-2 mt-0.5">
                {item.category && (
                  <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    <Tag className="w-2.5 h-2.5 mr-1" />
                    {item.category}
                  </span>
                )}
                {item.quantity > 1 && item.unitPrice > 0 && (
                  <span className="text-[10px] font-bold uppercase text-neutral-400">
                    ({formatCurrency(item.unitPrice, currency)} each)
                  </span>
                )}
              </div>
            </div>

            {/* Right: Price & Quick Action Buttons */}
            <div className="flex items-center space-x-2 shrink-0">
              <span className="text-base sm:text-lg font-black text-black font-mono">
                {formatCurrency(item.totalPrice, currency)}
              </span>

              {/* Edit / Delete on hover */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-0.5">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="p-1 text-black hover:bg-black hover:text-white transition-colors"
                  title="Edit item"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteItem(item.id)}
                  className="p-1 text-black hover:bg-black hover:text-white transition-colors"
                  title="Delete item"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Assigned People Row */}
          <div className="mt-2 pt-2 border-t border-neutral-200/60 flex flex-wrap items-center gap-1.5">
            {isUnassigned ? (
              <div className="flex items-center space-x-1 text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 border border-amber-300">
                <AlertCircle className="w-3 h-3 text-amber-800" />
                <span>Unassigned</span>
              </div>
            ) : (
              assignedShares.map((share) => {
                const person = people.find((p) => p.id === share.personId);
                if (!person) return null;
                const sharePercent = totalWeight > 0 ? (share.weight / totalWeight) * 100 : 0;
                const shareCost = (item.totalPrice * (share.weight || 1)) / (totalWeight || 1);

                return (
                  <span
                    key={share.personId}
                    className="inline-flex items-center pl-2 pr-1 py-0.5 bg-black text-white text-[10px] font-black uppercase tracking-wider"
                    title={`${person.name}: ${Math.round(sharePercent)}% (${formatCurrency(shareCost, currency)})`}
                  >
                    <span>{person.name}</span>
                    {assignedShares.length > 1 && (
                      <span className="ml-1 text-[9px] text-neutral-300 font-mono">
                        {Math.round(sharePercent)}%
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onTogglePerson(item.id, person.id)}
                      className="ml-1 p-0.5 hover:bg-neutral-800 text-white transition-colors"
                      title={`Remove ${person.name}`}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                );
              })
            )}

            {/* Quick Assign / Toggle Person Button */}
            <div className="relative inline-block ml-auto">
              <button
                type="button"
                onClick={() => setShowAssignMenu(!showAssignMenu)}
                className="inline-flex items-center space-x-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-white hover:bg-black hover:text-white text-black border border-black transition-colors"
                title="Assign / Split with someone"
              >
                <UserPlus className="w-3 h-3" />
                <span>{isUnassigned ? 'Assign' : '+ Person'}</span>
              </button>

              {/* People Toggle Dropdown */}
              {showAssignMenu && (
                <div 
                  className="absolute right-0 bottom-full mb-1.5 w-48 bg-white border-2 border-black py-1 z-20 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                >
                  <div className="px-2.5 py-1 text-[10px] font-black text-neutral-400 uppercase tracking-widest border-b border-black">
                    Assign to:
                  </div>
                  {people.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] font-bold uppercase text-neutral-400">
                      No participants yet
                    </div>
                  ) : (
                    people.map((p) => {
                      const isAssigned = assignedShares.some((s) => s.personId === p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            onTogglePerson(item.id, p.id);
                            setShowAssignMenu(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs font-black uppercase tracking-tight flex items-center justify-between hover:bg-black hover:text-white transition-colors ${
                            isAssigned ? 'bg-neutral-100' : ''
                          }`}
                        >
                          <span>{p.name}</span>
                          {isAssigned && <Check className="w-3.5 h-3.5 ml-2" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
