"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface FiltersPayload {
  dog?: boolean | null;
  wifi?: boolean | null;
  pool?: boolean | null;
  size_type?: string | null;
  water_max_km?: number | null;
}

interface ChatPanelProps {
  onSetFilters?: (patch: FiltersPayload) => void;
  onNavigateMap?: (lat: number, lon: number, zoom: number) => void;
  onSetTravelRange?: (hours: number) => void;
  onSelectCamping?: (name: string) => void;
  authToken?: string | null;
}

export default function ChatPanel({ onSetFilters, onNavigateMap, onSetTravelRange, onSelectCamping, authToken }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hallo! Ik ben kampeerhub. Waar wil je naartoe kamperen?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!loading) inputRef.current?.focus();
  }, [loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const updated: Message[] = [...messages, { role: "user", content: text }];
    setMessages(updated);
    setInput("");
    setLoading(true);

    // Skip the hardcoded UI greeting (index 0); keep last 6 messages to limit context size
    const apiMessages = updated.slice(1).slice(-6);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ messages: apiMessages }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail || (res.status === 503 ? "LLM te traag. Probeer opnieuw." : "Serverfout. Probeer opnieuw.");
        setMessages((prev) => [...prev, { role: "assistant", content: detail }]);
        return;
      }
      if (data.action === "set_filters" && data.filters) {
        onSetFilters?.(data.filters);
      } else if (data.action === "navigate_map" && data.navigate?.lat != null && data.navigate?.lon != null) {
        const zoom = (data.navigate.zoom > 0 && data.navigate.zoom <= 18) ? data.navigate.zoom : 10;
        onNavigateMap?.(data.navigate.lat, data.navigate.lon, zoom);
      } else if (data.action === "set_travel_range" && data.travel_hours != null) {
        onSetTravelRange?.(data.travel_hours);
      } else if (data.action === "select_camping" && data.camping_name) {
        onSelectCamping?.(data.camping_name);
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
          ref={inputRef}
          className="flex-1 bg-gray-800 text-gray-100 text-sm rounded px-3 py-2 outline-none focus:ring-1 focus:ring-[#209dd7] placeholder-gray-500"
          placeholder="Stel een vraag..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={loading}
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
