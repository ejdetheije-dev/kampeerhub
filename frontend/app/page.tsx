"use client";

import { useState, useMemo } from "react";
import MapPanel from "@/components/MapPanel";
import CampingList from "@/components/CampingList";
import ChatPanel from "@/components/ChatPanel";
import { useOverpass } from "@/hooks/useOverpass";
import { useWaterBodies } from "@/hooks/useWaterBodies";
import type { Bounds, Camping, Filters } from "@/types/camping";
import { DEFAULT_FILTERS } from "@/types/camping";
import type { WaterPoint } from "@/hooks/useWaterBodies";

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function minDistToWater(lat: number, lon: number, points: WaterPoint[]): number {
  if (points.length === 0) return Infinity;
  return Math.min(...points.map((p) => haversine(lat, lon, p.lat, p.lon)));
}

function effectivePrice(c: Camping): number | null {
  if (c.tags.fee === "no") return 0;
  if (c.tags.charge) {
    const match = c.tags.charge.match(/(\d+(?:[.,]\d+)?)/);
    if (match) return parseFloat(match[1].replace(",", "."));
  }
  // fee=yes but no parseable charge → camping IS paid, unknown amount
  if (c.tags.fee === "yes") return Infinity;
  return null; // completely unknown → don't filter
}

function applyFilters(campings: Camping[], filters: Filters, waterPoints: WaterPoint[]): Camping[] {
  return campings.filter((c) => {
    // Facility filters: only exclude campings that explicitly lack the feature
    if (filters.dog && !c.tags.dog) return false;
    if (filters.wifi && !c.tags.wifi) return false;
    if (filters.pool && !c.tags.pool) return false;
    if (filters.electricity && !c.tags.electricity) return false;

    // Type filter: lenient — campings without capacity data are included
    // (per spec: "OSM tags die ontbreken worden niet meegenomen in filtering")
    if (filters.sizeType === "naturist") {
      if (!c.tags.nudism) return false;
    } else if (filters.sizeType === "small" && c.tags.capacity != null) {
      if (c.tags.capacity >= 50) return false;
    } else if (filters.sizeType === "medium" && c.tags.capacity != null) {
      if (c.tags.capacity < 50 || c.tags.capacity > 200) return false;
    } else if (filters.sizeType === "large" && c.tags.capacity != null) {
      if (c.tags.capacity <= 200) return false;
    }

    // Price filter: use fee=yes as "camping costs something" even without charge tag
    if (filters.priceMax < 80) {
      const price = effectivePrice(c);
      if (price !== null && price > filters.priceMax) return false;
    }

    // Water distance filter: only apply when water points have loaded
    if (filters.waterMaxKm !== null && waterPoints.length > 0) {
      const dist = minDistToWater(c.lat, c.lon, waterPoints);
      if (dist > filters.waterMaxKm) return false;
    }

    return true;
  });
}

export default function Home() {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const { campings, loading, error, tooFarOut } = useOverpass(bounds);
  const waterPoints = useWaterBodies(bounds, filters.waterMaxKm !== null);

  const handleSelectCamping = (camping: Camping) => setSelectedId(camping.id);

  const sortedCampings = useMemo(() => {
    if (!bounds) return campings;
    const clat = (bounds.north + bounds.south) / 2;
    const clon = (bounds.east + bounds.west) / 2;
    return [...campings].sort((a, b) => {
      const da = (a.lat - clat) ** 2 + (a.lon - clon) ** 2;
      const db = (b.lat - clat) ** 2 + (b.lon - clon) ** 2;
      return da - db;
    });
  }, [campings, bounds]);

  const filteredCampings = useMemo(
    () => applyFilters(sortedCampings, filters, waterPoints),
    [sortedCampings, filters, waterPoints],
  );

  const filteredIds = useMemo(
    () => new Set(filteredCampings.map((c) => c.id)),
    [filteredCampings],
  );

  const capacityDataPct = useMemo(() => {
    if (sortedCampings.length === 0) return 0;
    const withCap = sortedCampings.filter((c) => c.tags.capacity != null).length;
    return Math.round((withCap / sortedCampings.length) * 100);
  }, [sortedCampings]);

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
          filteredIds={filteredIds}
          selectedId={selectedId}
          onSelectCamping={handleSelectCamping}
        />

        <div className="w-96 flex flex-col border-l border-gray-800 shrink-0 overflow-hidden">
          <CampingList
            campings={filteredCampings}
            totalCount={sortedCampings.length}
            loading={loading}
            error={error}
            tooFarOut={tooFarOut}
            selectedId={selectedId}
            onSelect={handleSelectCamping}
            filters={filters}
            onFiltersChange={setFilters}
            capacityDataPct={capacityDataPct}
          />
          <ChatPanel />
        </div>
      </div>
    </div>
  );
}
