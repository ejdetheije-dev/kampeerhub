"use client";

import { useState } from "react";
import MapPanel from "@/components/MapPanel";
import CampingList from "@/components/CampingList";
import ChatPanel from "@/components/ChatPanel";
import { useOverpass } from "@/hooks/useOverpass";
import type { Bounds } from "@/types/camping";

export default function Home() {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const { campings, loading, error } = useOverpass(bounds);

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] text-gray-100">
      {/* Header */}
      <header className="flex items-center px-4 h-12 border-b border-gray-800 shrink-0">
        <span className="text-[#ecad0a] font-bold text-lg tracking-wide">kampeerhub</span>
        <span className="ml-3 text-gray-400 text-sm">camping zoeker</span>
        <span className="ml-auto w-2 h-2 rounded-full bg-green-400" title="verbonden" />
      </header>

      {/* Split screen */}
      <div className="flex flex-1 overflow-hidden">
        <MapPanel onBoundsChange={setBounds} />

        {/* Right column */}
        <div className="w-96 flex flex-col border-l border-gray-800 shrink-0 overflow-hidden">
          <CampingList campings={campings} loading={loading} error={error} />
          <ChatPanel />
        </div>
      </div>
    </div>
  );
}
