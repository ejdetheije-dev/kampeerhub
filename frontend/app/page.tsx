"use client";

import { useState } from "react";
import MapPanel from "@/components/MapPanel";
import CampingList from "@/components/CampingList";
import ChatPanel from "@/components/ChatPanel";
import { useOverpass } from "@/hooks/useOverpass";
import type { Bounds, Camping } from "@/types/camping";

export default function Home() {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { campings, loading, error, tooFarOut } = useOverpass(bounds);

  const handleSelectCamping = (camping: Camping) => setSelectedId(camping.id);

  const sortedCampings = bounds
    ? [...campings].sort((a, b) => {
        const clat = (bounds.north + bounds.south) / 2;
        const clon = (bounds.east + bounds.west) / 2;
        const da = (a.lat - clat) ** 2 + (a.lon - clon) ** 2;
        const db = (b.lat - clat) ** 2 + (b.lon - clon) ** 2;
        return da - db;
      })
    : campings;

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] text-gray-100">
      <header className="flex items-center px-4 h-12 border-b border-gray-800 shrink-0">
        <span className="text-[#ecad0a] font-bold text-lg tracking-wide">kampeerhub</span>
        <span className="ml-3 text-gray-400 text-sm">camping zoeker</span>
        <span
          className={`ml-auto w-2 h-2 rounded-full ${error ? "bg-red-400" : loading ? "bg-yellow-400" : "bg-green-400"}`}
          title={error ? "fout" : loading ? "laden..." : "verbonden"}
        />
      </header>

      <div className="flex flex-1 overflow-hidden">
        <MapPanel
          onBoundsChange={setBounds}
          campings={campings}
          selectedId={selectedId}
          onSelectCamping={handleSelectCamping}
        />

        <div className="w-96 flex flex-col border-l border-gray-800 shrink-0 overflow-hidden">
          <CampingList
            campings={sortedCampings}
            loading={loading}
            error={error}
            tooFarOut={tooFarOut}
            selectedId={selectedId}
            onSelect={handleSelectCamping}
          />
          <ChatPanel />
        </div>
      </div>
    </div>
  );
}
