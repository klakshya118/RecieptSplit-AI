export interface ReceiptItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  category?: string;
}

export interface ReceiptData {
  id: string;
  merchantName: string;
  date: string;
  currency: string;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  tip: number;
  tipType?: 'percentage' | 'fixed';
  tipPercentage?: number;
  discount: number;
  total: number;
  imageUrl?: string;
}

export interface Person {
  id: string;
  name: string;
  color: string; // Tailwind color key or hex
}

export interface AssignmentShare {
  personId: string;
  weight: number; // e.g. 1 for equal share
}

export type ItemAssignments = Record<string, AssignmentShare[]>; // itemId -> AssignmentShare[]

export interface AllocatedItem {
  item: ReceiptItem;
  sharePercent: number;
  allocatedPrice: number;
}

export interface PersonBreakdown {
  person: Person;
  items: AllocatedItem[];
  itemSubtotal: number;
  taxShare: number;
  tipShare: number;
  discountShare: number;
  totalOwed: number;
  percentageOfBill: number;
  isPaid?: boolean;
}

export interface SplitSummary {
  personBreakdowns: PersonBreakdown[];
  totalAssignedSubtotal: number;
  unassignedSubtotal: number;
  unassignedItems: ReceiptItem[];
  totalCalculatedBill: number;
  taxRatePercent: number;
  effectiveTipPercent: number;
  isFullyAssigned: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  actionApplied?: string;
  suggestedPrompts?: string[];
  affectedItems?: string[];
  affectedPeople?: string[];
}

export interface SampleReceipt {
  id: string;
  title: string;
  tag: string;
  merchant: string;
  currency: string;
  items: Array<{ name: string; quantity: number; unitPrice: number; totalPrice: number; category: string }>;
  tax: number;
  tip: number;
  discount: number;
  mockImageSvg: string;
}
