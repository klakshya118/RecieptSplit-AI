import React, { useState, useEffect } from 'react';
import { 
  ReceiptData, 
  Person, 
  ItemAssignments, 
  ChatMessage, 
  ReceiptItem, 
  SampleReceipt 
} from './types';
import { calculateSplitSummary, PERSON_COLORS } from './utils/calculator';
import { SAMPLE_RECEIPTS } from './data/sampleReceipts';
import { Header } from './components/Header';
import { ReceiptUploader } from './components/ReceiptUploader';
import { ReceiptPane } from './components/ReceiptPane';
import { ChatPane } from './components/ChatPane';
import { SettlementSummary } from './components/SettlementSummary';
import { PeopleManagerModal } from './components/PeopleManagerModal';
import { ShareModal } from './components/ShareModal';
import { 
  Receipt as ReceiptIcon, 
  MessageSquare, 
  PieChart, 
  Sparkles,
  AlertCircle
} from 'lucide-react';

export default function App() {
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [people, setPeople] = useState<Person[]>([
    { id: 'p-1', name: 'Dhruv', color: 'emerald' },
    { id: 'p-2', name: 'Sarah', color: 'indigo' },
    { id: 'p-3', name: 'Sue', color: 'rose' },
  ]);
  const [assignments, setAssignments] = useState<ItemAssignments>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currency, setCurrency] = useState<string>('$');
  const [paidStatus, setPaidStatus] = useState<Record<string, boolean>>({});

  // UI State
  const [isReceiptLoading, setIsReceiptLoading] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [rightPaneTab, setRightPaneTab] = useState<'chat' | 'summary'>('chat');
  const [mobileActiveTab, setMobileActiveTab] = useState<'receipt' | 'chat' | 'summary'>('receipt');
  const [showPeopleModal, setShowPeopleModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showUploaderModal, setShowUploaderModal] = useState(false);

  // Initialize with the first sample receipt for a ready-to-test experience out of the box
  useEffect(() => {
    loadSampleReceipt('sample-cantina', false);
  }, []);

  const loadSampleReceipt = (sampleId: string, announceInChat: boolean = true) => {
    const sample = SAMPLE_RECEIPTS.find((s) => s.id === sampleId) || SAMPLE_RECEIPTS[0];
    const newItems: ReceiptItem[] = sample.items.map((it, idx) => ({
      ...it,
      id: `item-${sample.id}-${idx + 1}`,
    }));

    const subtotal = newItems.reduce((sum, it) => sum + it.totalPrice, 0);
    const tax = sample.tax;
    const tip = sample.tip;
    const discount = sample.discount;
    const total = subtotal + tax + tip - discount;

    const newReceipt: ReceiptData = {
      id: `receipt-${Date.now()}`,
      merchantName: sample.merchant,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      currency: sample.currency,
      items: newItems,
      subtotal,
      tax,
      tip,
      tipType: 'fixed',
      tipPercentage: Math.round((tip / subtotal) * 100),
      discount,
      total,
    };

    setReceipt(newReceipt);
    setCurrency(sample.currency);
    setAssignments({});
    setPaidStatus({});
    setShowUploaderModal(false);

    // Initial greeting
    const greetingMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      text: `👋 Loaded **${sample.merchant}** receipt ($${total.toFixed(2)} total).\n\nTry natural commands like:\n• "Dhruv had the nachos"\n• "Sarah and Sue shared the pizza"\n• "Everyone split the appetizers"`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestedPrompts: [
        `Dhruv had the ${newItems[0]?.name || 'nachos'}`,
        `Sarah and Sue shared the ${newItems[1]?.name || 'tacos'}`,
        `Everyone split the ${newItems[0]?.name || 'appetizers'}`,
      ],
    };

    setMessages([greetingMsg]);
  };

  // Upload receipt image and parse with Gemini
  const handleImageUploaded = async (base64Image: string, mimeType: string) => {
    try {
      setIsReceiptLoading(true);
      const res = await fetch('/api/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Image, mimeType }),
      });

      const json = await res.json();
      if (!res.ok || !json.success || !json.receipt) {
        throw new Error(json.error || 'Could not parse receipt image');
      }

      const parsed: ReceiptData = {
        ...json.receipt,
        id: `receipt-${Date.now()}`,
        imageUrl: base64Image,
        tipType: json.receipt.tip > 0 ? 'fixed' : 'percentage',
        tipPercentage: json.receipt.subtotal > 0 ? Math.round((json.receipt.tip / json.receipt.subtotal) * 100) : 18,
      };

      setReceipt(parsed);
      setCurrency(parsed.currency || '$');
      setAssignments({});
      setPaidStatus({});
      setShowUploaderModal(false);

      const welcomeMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        text: `✨ Successfully parsed receipt from **${parsed.merchantName}** with ${parsed.items.length} items!\n\nSubtotal: ${parsed.currency}${parsed.subtotal.toFixed(2)}, Tax: ${parsed.currency}${parsed.tax.toFixed(2)}.\n\nWho ordered what? Type natural commands like "Dhruv had the ${parsed.items[0]?.name || 'item'}" to begin assigning.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedPrompts: parsed.items.slice(0, 3).map((item, idx) => {
          const person = people[idx % people.length]?.name || 'Dhruv';
          return `${person} had the ${item.name}`;
        }),
      };

      setMessages([welcomeMsg]);
    } catch (err: any) {
      console.error(err);
      throw new Error(
        err.message?.includes('high demand') || err.message?.includes('503')
          ? 'Gemini AI is currently under high traffic spike. Please retry in a moment, or click a sample bill below to test instantly.'
          : err.message || 'Error processing receipt image. Please try again.'
      );
    } finally {
      setIsReceiptLoading(false);
    }
  };

  // Parse raw text receipt
  const handleTextParsed = async (text: string) => {
    try {
      setIsReceiptLoading(true);
      const res = await fetch('/api/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const json = await res.json();
      if (!res.ok || !json.success || !json.receipt) {
        throw new Error(json.error || 'Could not parse receipt text');
      }

      const parsed: ReceiptData = {
        ...json.receipt,
        id: `receipt-${Date.now()}`,
        tipType: json.receipt.tip > 0 ? 'fixed' : 'percentage',
        tipPercentage: json.receipt.subtotal > 0 ? Math.round((json.receipt.tip / json.receipt.subtotal) * 100) : 18,
      };

      setReceipt(parsed);
      setCurrency(parsed.currency || '$');
      setAssignments({});
      setPaidStatus({});
      setShowUploaderModal(false);

      const welcomeMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        text: `✨ Parsed text receipt for **${parsed.merchantName}** (${parsed.items.length} items)!\nType commands in chat to assign items.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages([welcomeMsg]);
    } catch (err: any) {
      console.error(err);
      throw new Error(
        err.message?.includes('high demand') || err.message?.includes('503')
          ? 'Gemini AI is currently under high traffic spike. Please retry in a moment, or click a sample bill below.'
          : err.message || 'Error processing receipt text.'
      );
    } finally {
      setIsReceiptLoading(false);
    }
  };

  // Natural language chat command execution
  const handleSendMessage = async (commandText: string) => {
    if (!receipt) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      text: commandText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/chat-split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: commandText,
          receipt,
          people,
          assignments,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || 'Failed to process command');
      }

      const { data } = json;

      // Update people if new people were added
      if (Array.isArray(data.updatedPeople) && data.updatedPeople.length > 0) {
        setPeople(data.updatedPeople);
      }

      // Update assignments map
      if (data.updatedAssignments && typeof data.updatedAssignments === 'object') {
        setAssignments(data.updatedAssignments);
      }

      // Update tip if modified
      if (data.updatedTip && typeof data.updatedTip.tipAmount === 'number') {
        setReceipt((prev) =>
          prev
            ? {
                ...prev,
                tip: data.updatedTip.tipAmount,
                tipType: data.updatedTip.tipType || prev.tipType,
                tipPercentage: data.updatedTip.tipPercentage ?? prev.tipPercentage,
              }
            : prev
        );
      }

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        text: data.reply,
        actionApplied: data.actionApplied,
        suggestedPrompts: data.suggestedPrompts,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error(err);
      const errorReply: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        text: `Sorry, I ran into an issue understanding that command: ${err.message}. Try something like "Dhruv had the nachos".`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorReply]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Toggle person assignment directly on receipt item
  const handleTogglePerson = (itemId: string, personId: string) => {
    setAssignments((prev) => {
      const current = prev[itemId] || [];
      const exists = current.some((s) => s.personId === personId);

      let updated;
      if (exists) {
        updated = current.filter((s) => s.personId !== personId);
      } else {
        updated = [...current, { personId, weight: 1 }];
      }

      return {
        ...prev,
        [itemId]: updated,
      };
    });
  };

  // Assign remaining unassigned items evenly
  const handleAssignRemainingEvenly = () => {
    if (!receipt || people.length === 0) return;
    const summary = calculateSplitSummary(receipt, people, assignments);
    if (summary.unassignedItems.length === 0) return;

    setAssignments((prev) => {
      const next = { ...prev };
      for (const item of summary.unassignedItems) {
        next[item.id] = people.map((p) => ({ personId: p.id, weight: 1 }));
      }
      return next;
    });

    const msg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      text: `Split ${summary.unassignedItems.length} remaining items (${summary.unassignedItems.map((i) => i.name).join(', ')}) evenly across all ${people.length} people!`,
      actionApplied: `Split remaining items across ${people.length} people`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, msg]);
  };

  // Add / Edit / Delete Item
  const handleUpdateItem = (updated: ReceiptItem) => {
    if (!receipt) return;
    const newItems = receipt.items.map((it) => (it.id === updated.id ? updated : it));
    const subtotal = newItems.reduce((sum, it) => sum + it.totalPrice, 0);
    setReceipt({
      ...receipt,
      items: newItems,
      subtotal,
    });
  };

  const handleDeleteItem = (itemId: string) => {
    if (!receipt) return;
    const newItems = receipt.items.filter((it) => it.id !== itemId);
    const subtotal = newItems.reduce((sum, it) => sum + it.totalPrice, 0);
    setReceipt({
      ...receipt,
      items: newItems,
      subtotal,
    });
    setAssignments((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const handleAddItem = (newItem: Omit<ReceiptItem, 'id'>) => {
    if (!receipt) return;
    const created: ReceiptItem = {
      ...newItem,
      id: `item-${Date.now()}`,
    };
    const newItems = [...receipt.items, created];
    const subtotal = newItems.reduce((sum, it) => sum + it.totalPrice, 0);
    setReceipt({
      ...receipt,
      items: newItems,
      subtotal,
    });
  };

  // Update Tax, Tip, Discount
  const handleUpdateReceiptTotals = (
    tax: number,
    tip: number,
    tipType: 'percentage' | 'fixed',
    tipPercentage: number,
    discount: number
  ) => {
    if (!receipt) return;
    setReceipt({
      ...receipt,
      tax,
      tip,
      tipType,
      tipPercentage,
      discount,
      total: receipt.subtotal + tax + tip - discount,
    });
  };

  const handleUpdateMerchant = (merchantName: string) => {
    if (!receipt) return;
    setReceipt({ ...receipt, merchantName });
  };

  // Person management
  const handleAddPerson = (name: string, color: string) => {
    const newPerson: Person = {
      id: `p-${Date.now()}`,
      name: name.trim(),
      color: color || PERSON_COLORS[people.length % PERSON_COLORS.length].name,
    };
    setPeople((prev) => [...prev, newPerson]);
  };

  const handleRemovePerson = (personId: string) => {
    setPeople((prev) => prev.filter((p) => p.id !== personId));
    setAssignments((prev) => {
      const next: ItemAssignments = {};
      for (const [itemId, shares] of Object.entries(prev)) {
        if (Array.isArray(shares)) {
          next[itemId] = shares.filter((s) => s.personId !== personId);
        }
      }
      return next;
    });
  };

  const handleUpdatePerson = (updated: Person) => {
    setPeople((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleTogglePaid = (personId: string) => {
    setPaidStatus((prev) => ({ ...prev, [personId]: !prev[personId] }));
  };

  const handleResetBill = () => {
    if (window.confirm('Reset all assignments and clear bill allocations?')) {
      setAssignments({});
      setPaidStatus({});
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          text: '🔄 All item assignments have been reset.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  };

  const summary = receipt
    ? calculateSplitSummary(receipt, people, assignments)
    : {
        personBreakdowns: [],
        totalAssignedSubtotal: 0,
        unassignedSubtotal: 0,
        unassignedItems: [],
        totalCalculatedBill: 0,
        taxRatePercent: 0,
        effectiveTipPercent: 0,
        isFullyAssigned: false,
      };

  return (
    <div className="min-h-screen flex flex-col bg-white text-black selection:bg-black selection:text-white">
      
      {/* Top Header */}
      <Header
        receipt={receipt}
        people={people}
        summary={summary}
        onSelectSample={(sampleId) => loadSampleReceipt(sampleId, true)}
        onOpenPeopleManager={() => setShowPeopleModal(true)}
        onOpenShareModal={() => setShowShareModal(true)}
        onResetBill={handleResetBill}
        onUploadNewReceipt={() => setShowUploaderModal(true)}
        currency={currency}
        onCurrencyChange={(curr) => {
          setCurrency(curr);
          if (receipt) setReceipt({ ...receipt, currency: curr });
        }}
      />

      {/* Main Split-Screen Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 md:p-6 flex flex-col">
        
        {/* Mobile Tab Navigation */}
        <div className="lg:hidden flex bg-white border-2 border-black p-1 mb-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          <button
            type="button"
            onClick={() => setMobileActiveTab('receipt')}
            className={`flex-1 py-2 text-xs font-black uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all ${
              mobileActiveTab === 'receipt'
                ? 'bg-black text-white'
                : 'text-black hover:bg-neutral-100'
            }`}
          >
            <ReceiptIcon className="w-3.5 h-3.5" />
            <span>RECEIPT</span>
            {!summary.isFullyAssigned && summary.unassignedItems.length > 0 && (
              <span className="w-2 h-2 bg-black" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileActiveTab('chat')}
            className={`flex-1 py-2 text-xs font-black uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all ${
              mobileActiveTab === 'chat'
                ? 'bg-black text-white'
                : 'text-black hover:bg-neutral-100'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>CHAT</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileActiveTab('summary')}
            className={`flex-1 py-2 text-xs font-black uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all ${
              mobileActiveTab === 'summary'
                ? 'bg-black text-white'
                : 'text-black hover:bg-neutral-100'
            }`}
          >
            <PieChart className="w-3.5 h-3.5" />
            <span>SUMMARY</span>
          </button>
        </div>

        {/* Content Body */}
        {!receipt ? (
          <div className="my-auto py-8">
            <ReceiptUploader
              onImageUploaded={handleImageUploaded}
              onTextParsed={handleTextParsed}
              onSelectSample={(sampleId) => loadSampleReceipt(sampleId, true)}
              isLoading={isReceiptLoading}
            />
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-stretch min-h-[calc(100vh-8.5rem)]">
            
            {/* Left Pane: AI-Parsed Receipt */}
            <div
              className={`lg:col-span-6 xl:col-span-7 bg-white border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col ${
                mobileActiveTab === 'receipt' ? 'flex' : 'hidden lg:flex'
              }`}
            >
              <ReceiptPane
                receipt={receipt}
                people={people}
                assignments={assignments}
                summary={summary}
                onTogglePerson={handleTogglePerson}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onAddItem={handleAddItem}
                onUpdateReceiptTotals={handleUpdateReceiptTotals}
                onUpdateMerchant={handleUpdateMerchant}
                onAssignRemainingEvenly={handleAssignRemainingEvenly}
              />
            </div>

            {/* Right Pane: Smart Chat & Real-Time Settlement Summary */}
            <div
              className={`lg:col-span-6 xl:col-span-5 flex flex-col space-y-4 ${
                mobileActiveTab !== 'receipt' ? 'flex' : 'hidden lg:flex'
              }`}
            >
              {/* Desktop Dual Tabs Switcher */}
              <div className="bg-white border-2 border-black p-1 flex items-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <button
                  type="button"
                  onClick={() => setRightPaneTab('chat')}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all ${
                    rightPaneTab === 'chat'
                      ? 'bg-black text-white'
                      : 'text-black hover:bg-neutral-100'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>COMMAND CHAT</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRightPaneTab('summary')}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all ${
                    rightPaneTab === 'summary'
                      ? 'bg-black text-white'
                      : 'text-black hover:bg-neutral-100'
                  }`}
                >
                  <PieChart className="w-3.5 h-3.5" />
                  <span>LIVE SETTLEMENT</span>
                  <span className="px-1.5 py-0.5 text-[9px] bg-neutral-200 text-black font-mono border border-black ml-1">
                    {people.length}
                  </span>
                </button>
              </div>

              {/* Right Pane Card Container */}
              <div className="flex-1 bg-white border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col">
                {(rightPaneTab === 'chat' || mobileActiveTab === 'chat') && mobileActiveTab !== 'summary' ? (
                  <ChatPane
                    messages={messages}
                    receipt={receipt}
                    people={people}
                    summary={summary}
                    onSendMessage={handleSendMessage}
                    isLoading={isChatLoading}
                    onClearHistory={() => setMessages([])}
                  />
                ) : (
                  <div className="p-4 overflow-y-auto flex-1 bg-white">
                    <SettlementSummary
                      receipt={receipt}
                      people={people}
                      summary={summary}
                      onTogglePaid={handleTogglePaid}
                      paidStatus={paidStatus}
                    />
                  </div>
                )}
              </div>

              {/* Bottom Quick Mini Summary Widget (when in chat mode on desktop) */}
              {rightPaneTab === 'chat' && (
                <div className="hidden sm:block bg-white border-2 border-black p-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="font-black uppercase tracking-wider text-black text-[10px]">QUICK TOTALS:</span>
                      <div className="flex -space-x-1 overflow-hidden">
                        {summary.personBreakdowns.map((b) => (
                          <div
                            key={b.person.id}
                            className="inline-block h-5 w-5 bg-black text-white font-mono text-[9px] font-black border border-black flex items-center justify-center uppercase"
                            title={`${b.person.name}: ${currency}${b.totalOwed.toFixed(2)}`}
                          >
                            {b.person.name[0]}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 font-mono text-xs font-bold uppercase">
                      {summary.personBreakdowns.slice(0, 3).map((b) => (
                        <span key={b.person.id} className="text-black">
                          <strong className="text-black font-black">{b.person.name}:</strong> {currency}{b.totalOwed.toFixed(2)}
                        </span>
                      ))}
                      {summary.personBreakdowns.length > 3 && (
                        <span className="text-neutral-500 font-bold">+{summary.personBreakdowns.length - 3} MORE</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* People Manager Modal */}
      {showPeopleModal && (
        <PeopleManagerModal
          people={people}
          onAddPerson={handleAddPerson}
          onRemovePerson={handleRemovePerson}
          onUpdatePerson={handleUpdatePerson}
          onClose={() => setShowPeopleModal(false)}
        />
      )}

      {/* Share Split Modal */}
      {showShareModal && receipt && (
        <ShareModal
          receipt={receipt}
          summary={summary}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* Upload New Receipt Modal / Dialog */}
      {showUploaderModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="max-w-xl w-full relative">
            <button
              type="button"
              onClick={() => setShowUploaderModal(false)}
              className="absolute top-4 right-4 z-10 p-2 text-black hover:bg-black hover:text-white bg-white border-2 border-black transition-colors"
            >
              ✕
            </button>
            <ReceiptUploader
              onImageUploaded={handleImageUploaded}
              onTextParsed={handleTextParsed}
              onSelectSample={(sampleId) => loadSampleReceipt(sampleId, true)}
              isLoading={isReceiptLoading}
            />
          </div>
        </div>
      )}
    </div>
  );
}
