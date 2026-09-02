import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Sparkles, 
  Bot, 
  User, 
  Mic, 
  MicOff, 
  Loader2, 
  RotateCcw, 
  CheckCircle2, 
  Zap,
} from 'lucide-react';
import { ChatMessage, ReceiptData, Person, SplitSummary } from '../types';

interface ChatPaneProps {
  messages: ChatMessage[];
  receipt: ReceiptData;
  people: Person[];
  summary: SplitSummary;
  onSendMessage: (text: string) => Promise<void>;
  isLoading: boolean;
  onClearHistory: () => void;
}

export const ChatPane: React.FC<ChatPaneProps> = ({
  messages,
  receipt,
  people,
  summary,
  onSendMessage,
  isLoading,
  onClearHistory,
}) => {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    const msg = inputText.trim();
    setInputText('');
    await onSendMessage(msg);
  };

  const handlePromptClick = async (prompt: string) => {
    if (isLoading) return;
    await onSendMessage(prompt);
  };

  // Speech Recognition support
  const toggleSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please type your message.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText(transcript);
        setIsListening(false);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognition.start();
    } catch (e) {
      console.error(e);
      setIsListening(false);
    }
  };

  // Contextual smart suggestions
  const dynamicSuggestions: string[] = [];
  if (summary.unassignedItems.length > 0) {
    const firstUnassigned = summary.unassignedItems[0];
    if (people.length > 0) {
      dynamicSuggestions.push(`${people[0].name} had the ${firstUnassigned.name}`);
      if (people.length >= 2) {
        dynamicSuggestions.push(`${people[0].name} and ${people[1].name} shared the ${firstUnassigned.name}`);
      }
    } else {
      dynamicSuggestions.push(`Dhruv had the ${firstUnassigned.name}`);
      dynamicSuggestions.push(`Sarah and Sue shared the ${firstUnassigned.name}`);
    }
    if (summary.unassignedItems.length > 1) {
      dynamicSuggestions.push(`Everyone split the remaining items`);
    }
  }

  if (receipt.tip === 0) {
    dynamicSuggestions.push('Add 18% tip');
  }

  const latestMessage = messages[messages.length - 1];
  const activeSuggestions = latestMessage?.suggestedPrompts?.length 
    ? latestMessage.suggestedPrompts 
    : dynamicSuggestions.slice(0, 3);

  return (
    <div className="flex flex-col h-full bg-white">
      
      {/* Chat Header */}
      <div className="bg-white p-4 border-b-4 border-black flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 bg-black flex items-center justify-center text-white border-2 border-black">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-lg text-black uppercase tracking-tight font-mono">
              COMMAND CHAT
            </h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
              Type natural statements to split costs
            </p>
          </div>
        </div>

        {messages.length > 1 && (
          <button
            type="button"
            onClick={onClearHistory}
            className="px-2.5 py-1 text-black bg-white hover:bg-black hover:text-white border-2 border-black transition-colors text-[10px] font-black uppercase tracking-wider flex items-center space-x-1"
            title="Clear chat history"
          >
            <RotateCcw className="w-3 h-3" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        )}
      </div>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const isSystem = msg.role === 'system';

          if (isSystem) {
            return (
              <div key={msg.id} className="text-center my-2">
                <span className="inline-block px-3 py-1 bg-neutral-100 border border-black text-[10px] text-black font-black uppercase tracking-widest">
                  {msg.text}
                </span>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`flex items-start space-x-3 ${isUser ? 'flex-row-reverse space-x-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 flex items-center justify-center text-xs font-black uppercase shrink-0 border-2 border-black ${
                  isUser
                    ? 'bg-black text-white'
                    : 'bg-white text-black'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
              </div>

              {/* Message Content Bubble */}
              <div className={`max-w-[85%] space-y-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
                <div
                  className={`p-3.5 text-xs font-bold leading-relaxed border-2 border-black ${
                    isUser
                      ? 'bg-black text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]'
                      : 'bg-white text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>

                {/* Action Applied Badge */}
                {msg.actionApplied && (
                  <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-black text-white border border-black">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <span>{msg.actionApplied}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-center space-x-2 text-black bg-neutral-100 border-2 border-black p-3 w-fit text-xs font-black uppercase tracking-wider animate-pulse shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>AI is processing command...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompt Chips */}
      {activeSuggestions.length > 0 && !isLoading && (
        <div className="px-4 py-2.5 bg-neutral-100 border-t-2 border-black flex flex-wrap gap-2 items-center">
          <span className="text-[10px] font-black text-black uppercase tracking-widest flex items-center mr-1">
            <Zap className="w-3.5 h-3.5 mr-1 text-black" />
            Quick:
          </span>
          {activeSuggestions.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handlePromptClick(prompt)}
              className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 bg-white hover:bg-black hover:text-white text-black border-2 border-black transition-colors text-left"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Chat Input Bar */}
      <div className="p-4 bg-white border-t-4 border-black">
        <form onSubmit={handleSubmit} className="flex items-center space-x-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="e.g. Dhruv had the nachos, Sarah & Sue shared pizza..."
              disabled={isLoading}
              className="w-full text-xs sm:text-sm font-bold pl-3.5 pr-10 py-3 bg-white border-2 border-black placeholder:text-neutral-400 focus:outline-none"
            />

            {/* Voice Dictation Button */}
            <button
              type="button"
              onClick={toggleSpeechRecognition}
              className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 border border-black transition-colors ${
                isListening
                  ? 'bg-black text-white animate-pulse'
                  : 'text-black hover:bg-black hover:text-white'
              }`}
              title={isListening ? 'Stop listening' : 'Voice command'}
            >
              {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="p-3 bg-black hover:bg-neutral-800 disabled:opacity-30 text-white border-2 border-black transition-colors shrink-0"
            title="Send command"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
