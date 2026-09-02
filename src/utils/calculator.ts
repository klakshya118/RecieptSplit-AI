import { ReceiptData, Person, ItemAssignments, SplitSummary, PersonBreakdown, AllocatedItem, ReceiptItem } from '../types';

export const PERSON_COLORS = [
  { name: 'emerald', bg: 'bg-emerald-500', text: 'text-emerald-700', lightBg: 'bg-emerald-50', border: 'border-emerald-200', ring: 'ring-emerald-400', badge: 'bg-emerald-100 text-emerald-800' },
  { name: 'indigo', bg: 'bg-indigo-500', text: 'text-indigo-700', lightBg: 'bg-indigo-50', border: 'border-indigo-200', ring: 'ring-indigo-400', badge: 'bg-indigo-100 text-indigo-800' },
  { name: 'amber', bg: 'bg-amber-500', text: 'text-amber-700', lightBg: 'bg-amber-50', border: 'border-amber-200', ring: 'ring-amber-400', badge: 'bg-amber-100 text-amber-800' },
  { name: 'rose', bg: 'bg-rose-500', text: 'text-rose-700', lightBg: 'bg-rose-50', border: 'border-rose-200', ring: 'ring-rose-400', badge: 'bg-rose-100 text-rose-800' },
  { name: 'cyan', bg: 'bg-cyan-500', text: 'text-cyan-700', lightBg: 'bg-cyan-50', border: 'border-cyan-200', ring: 'ring-cyan-400', badge: 'bg-cyan-100 text-cyan-800' },
  { name: 'violet', bg: 'bg-violet-500', text: 'text-violet-700', lightBg: 'bg-violet-50', border: 'border-violet-200', ring: 'ring-violet-400', badge: 'bg-violet-100 text-violet-800' },
  { name: 'teal', bg: 'bg-teal-500', text: 'text-teal-700', lightBg: 'bg-teal-50', border: 'border-teal-200', ring: 'ring-teal-400', badge: 'bg-teal-100 text-teal-800' },
  { name: 'orange', bg: 'bg-orange-500', text: 'text-orange-700', lightBg: 'bg-orange-50', border: 'border-orange-200', ring: 'ring-orange-400', badge: 'bg-orange-100 text-orange-800' },
  { name: 'blue', bg: 'bg-blue-500', text: 'text-blue-700', lightBg: 'bg-blue-50', border: 'border-blue-200', ring: 'ring-blue-400', badge: 'bg-blue-100 text-blue-800' },
  { name: 'fuchsia', bg: 'bg-fuchsia-500', text: 'text-fuchsia-700', lightBg: 'bg-fuchsia-50', border: 'border-fuchsia-200', ring: 'ring-fuchsia-400', badge: 'bg-fuchsia-100 text-fuchsia-800' },
];

export function getPersonColorConfig(colorName: string) {
  const match = PERSON_COLORS.find(c => c.name.toLowerCase() === colorName?.toLowerCase());
  return match || PERSON_COLORS[0];
}

export function calculateSplitSummary(
  receipt: ReceiptData,
  people: Person[],
  assignments: ItemAssignments
): SplitSummary {
  const items = receipt.items || [];
  const baseSubtotal = receipt.subtotal > 0 ? receipt.subtotal : items.reduce((sum, item) => sum + item.totalPrice, 0);
  const tax = receipt.tax || 0;
  const tip = receipt.tip || 0;
  const discount = receipt.discount || 0;

  // Track unassigned items
  const unassignedItems: ReceiptItem[] = [];
  let unassignedSubtotal = 0;

  // Initialize breakdown map for each person
  const personAllocationsMap = new Map<string, { items: AllocatedItem[]; subtotal: number }>();
  for (const person of people) {
    personAllocationsMap.set(person.id, { items: [], subtotal: 0 });
  }

  // Iterate each item and distribute costs based on assignment weights
  for (const item of items) {
    const itemShares = assignments[item.id] || [];
    
    if (itemShares.length === 0) {
      unassignedItems.push(item);
      unassignedSubtotal += item.totalPrice;
      continue;
    }

    const totalWeight = itemShares.reduce((w, s) => w + (s.weight || 1), 0);
    if (totalWeight <= 0) {
      unassignedItems.push(item);
      unassignedSubtotal += item.totalPrice;
      continue;
    }

    for (const share of itemShares) {
      const shareFraction = (share.weight || 1) / totalWeight;
      const allocatedPrice = item.totalPrice * shareFraction;
      
      let personData = personAllocationsMap.get(share.personId);
      if (!personData) {
        personData = { items: [], subtotal: 0 };
        personAllocationsMap.set(share.personId, personData);
      }

      personData.items.push({
        item,
        sharePercent: shareFraction * 100,
        allocatedPrice: allocatedPrice,
      });
      personData.subtotal += allocatedPrice;
    }
  }

  const totalAssignedSubtotal = Array.from(personAllocationsMap.values()).reduce((sum, p) => sum + p.subtotal, 0);

  // Calculate proportional shares for each person
  const personBreakdowns: PersonBreakdown[] = people.map(person => {
    const data = personAllocationsMap.get(person.id) || { items: [], subtotal: 0 };
    const personSubtotal = data.subtotal;

    // Proportional ratio based on actual receipt subtotal (if > 0)
    const ratio = baseSubtotal > 0 ? (personSubtotal / baseSubtotal) : 0;

    const taxShare = ratio * tax;
    const tipShare = ratio * tip;
    const discountShare = ratio * discount;
    const totalOwed = personSubtotal + taxShare + tipShare - discountShare;

    const percentageOfBill = baseSubtotal > 0 ? (personSubtotal / baseSubtotal) * 100 : 0;

    return {
      person,
      items: data.items,
      itemSubtotal: Math.round(personSubtotal * 100) / 100,
      taxShare: Math.round(taxShare * 100) / 100,
      tipShare: Math.round(tipShare * 100) / 100,
      discountShare: Math.round(discountShare * 100) / 100,
      totalOwed: Math.max(0, Math.round(totalOwed * 100) / 100),
      percentageOfBill: Math.round(percentageOfBill * 10) / 10,
    };
  });

  const taxRatePercent = baseSubtotal > 0 ? (tax / baseSubtotal) * 100 : 0;
  const effectiveTipPercent = baseSubtotal > 0 ? (tip / baseSubtotal) * 100 : 0;
  const totalCalculatedBill = baseSubtotal + tax + tip - discount;
  const isFullyAssigned = unassignedItems.length === 0 && items.length > 0;

  return {
    personBreakdowns,
    totalAssignedSubtotal: Math.round(totalAssignedSubtotal * 100) / 100,
    unassignedSubtotal: Math.round(unassignedSubtotal * 100) / 100,
    unassignedItems,
    totalCalculatedBill: Math.round(totalCalculatedBill * 100) / 100,
    taxRatePercent: Math.round(taxRatePercent * 10) / 10,
    effectiveTipPercent: Math.round(effectiveTipPercent * 10) / 10,
    isFullyAssigned,
  };
}

export function formatCurrency(amount: number, currency: string = '$'): string {
  const safeAmount = isNaN(amount) ? 0 : amount;
  return `${currency}${safeAmount.toFixed(2)}`;
}

export function generateSettlementText(receipt: ReceiptData, summary: SplitSummary): string {
  const lines: string[] = [];
  lines.push(`🧾 Bill Split Breakdown: ${receipt.merchantName || 'Restaurant'}`);
  lines.push(`Date: ${receipt.date || new Date().toLocaleDateString()}`);
  lines.push(`---------------------------------`);
  lines.push(`Subtotal: ${formatCurrency(receipt.subtotal, receipt.currency)}`);
  if (receipt.tax > 0) lines.push(`Tax: ${formatCurrency(receipt.tax, receipt.currency)} (${summary.taxRatePercent}%)`);
  if (receipt.tip > 0) lines.push(`Tip: ${formatCurrency(receipt.tip, receipt.currency)} (${summary.effectiveTipPercent}%)`);
  if (receipt.discount > 0) lines.push(`Discount: -${formatCurrency(receipt.discount, receipt.currency)}`);
  lines.push(`Total Bill: ${formatCurrency(summary.totalCalculatedBill, receipt.currency)}`);
  lines.push(`=================================`);
  lines.push(`INDIVIDUAL OWED AMOUNTS:`);
  
  for (const b of summary.personBreakdowns) {
    lines.push(``);
    lines.push(`👤 ${b.person.name}: ${formatCurrency(b.totalOwed, receipt.currency)}`);
    lines.push(`   • Items (${formatCurrency(b.itemSubtotal, receipt.currency)}):`);
    for (const alloc of b.items) {
      const shareTxt = alloc.sharePercent < 99 ? ` (${Math.round(alloc.sharePercent)}% share)` : '';
      lines.push(`     - ${alloc.item.name}: ${formatCurrency(alloc.allocatedPrice, receipt.currency)}${shareTxt}`);
    }
    if (b.taxShare > 0) lines.push(`   • Tax (prop.): ${formatCurrency(b.taxShare, receipt.currency)}`);
    if (b.tipShare > 0) lines.push(`   • Tip (prop.): ${formatCurrency(b.tipShare, receipt.currency)}`);
    if (b.discountShare > 0) lines.push(`   • Discount: -${formatCurrency(b.discountShare, receipt.currency)}`);
  }

  if (summary.unassignedItems.length > 0) {
    lines.push(``);
    lines.push(`⚠️ Unassigned Items (${formatCurrency(summary.unassignedSubtotal, receipt.currency)}):`);
    for (const un of summary.unassignedItems) {
      lines.push(`   - ${un.name}: ${formatCurrency(un.totalPrice, receipt.currency)}`);
    }
  }

  lines.push(``);
  lines.push(`Generated by ReceiptSplit AI ✨`);
  return lines.join('\n');
}
