"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  onAction?: (action: string) => void;
}

export default function ChatPanel({ onAction }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hallo! Ik ben kampeerhub. Waar wil je naartoe kamperen?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const updated: Message[] = [...messages, { role: "user", content: text }];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail || "Serverfout. Probeer opnieuw.";
        setMessages((prev) => [...prev, { role: "assistant", content: detail }]);
        return;
      }
      if (data.action && data.action !== "none") {
        onAction?.(data.action);
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Verbindingsfout. Probeer opnieuw." }]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex flex-col border-t border-gray-800 h-72 shrink-0">
      <div className="px-4 py-2 border-b border-gray-800 shrink-0">
        <span className="text-xs text-gray-400 uppercase tracking-wider">AI assistent</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] text-sm px-3 py-2 rounded-lg ${
                m.role === "user"
                  ? "bg-[#753991] text-white"
                  : "bg-gray-800 text-gray-200"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 text-gray-400 text-sm px-3 py-2 rounded-lg">...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-3 py-2 border-t border-gray-800 flex gap-2 shrink-0">
        <input
          className="flex-1 bg-gray-800 text-gray-100 text-sm rounded px-3 py-2 outline-none focus:ring-1 focus:ring-[#209dd7] placeholder-gray-500"
          placeholder="Stel een vraag..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={loading}
          maxLength={4000}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-[#753991] hover:bg-[#5e2d77] disabled:opacity-40 text-white text-sm rounded transition-colors"
        >
          Stuur
        </button>
      </div>
    </div>
  );
}
