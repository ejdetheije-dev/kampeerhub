"use client";

import { useState, useMemo, useRef } from "react";
import MapPanel from "@/components/MapPanel";
import CampingList from "@/components/CampingList";
import ChatPanel from "@/components/ChatPanel";
import { useOverpass } from "@/hooks/useOverpass";
import { useWaterBodies } from "@/hooks/useWaterBodies";
import { useFavorites } from "@/hooks/useFavorites";
import DetailOverlay from "@/components/DetailOverlay";
import LandingPage from "@/components/LandingPage";
import type { Bounds, Camping, Filters, SizeType } from "@/types/camping";
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

function isWithinWaterDist(lat: number, lon: number, points: WaterPoint[], maxKm: number): boolean {
  for (const p of points) {
    if (haversine(lat, lon, p.lat, p.lon) <= maxKm) return true;
  }
  return false;
}

function applyFilters(campings: Camping[], filters: Filters, waterPoints: WaterPoint[]): Camping[] {
  return campings.filter((c) => {
    if (filters.dog && !c.tags.dog) return false;
    if (filters.wifi && !c.tags.wifi) return false;
    if (filters.pool && !c.tags.pool) return false;

    if (filters.sizeType === "naturist") {
      if (!c.tags.nudism) return false;
    } else if (filters.sizeType === "small" && c.tags.capacity != null) {
      if (c.tags.capacity >= 50) return false;
    } else if (filters.sizeType === "medium" && c.tags.capacity != null) {
      if (c.tags.capacity < 50 || c.tags.capacity > 200) return false;
    } else if (filters.sizeType === "large" && c.tags.capacity != null) {
      if (c.tags.capacity <= 200) return false;
    }

    if (filters.waterMaxKm !== null && waterPoints.length > 0) {
      if (!isWithinWaterDist(c.lat, c.lon, waterPoints, filters.waterMaxKm)) return false;
    }

    return true;
  });
}

function AppContent() {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [travelHours, setTravelHours] = useState<number>(0);
  const mapFlyToRef = useRef<((lat: number, lon: number, zoom: number) => void) | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [campingNotFound, setCampingNotFound] = useState<string | null>(null);
  const { campings, loading, error, tooFarOut } = useOverpass(bounds);
  const waterPoints = useWaterBodies(bounds, filters.waterMaxKm !== null);
  const { favorites, toggleFavorite } = useFavorites();

  const handleSelectCamping = (camping: Camping) => {
    setSelectedId(camping.id);
    setTravelHours(0);
  };

  const selectedCamping = useMemo(
    () => campings.find((c) => c.id === selectedId) ?? null,
    [campings, selectedId],
  );

  const sortedCampings = useMemo(() => {
    if (!bounds) return campings;
    const clat = (bounds.north + bounds.south) / 2;
    const clon = (bounds.east + bounds.west) / 2;
    return [...campings].sort((a, b) => {
      const da = haversine(a.lat, a.lon, clat, clon);
      const db = haversine(b.lat, b.lon, clat, clon);
      return da - db;
    });
  }, [campings, bounds]);

  const filteredCampings = useMemo(() => {
    const base = applyFilters(sortedCampings, filters, waterPoints);
    return showFavoritesOnly ? base.filter((c) => favorites.has(c.id)) : base;
  }, [sortedCampings, filters, waterPoints, showFavoritesOnly, favorites]);

  const filteredIds = useMemo(
    () => new Set(filteredCampings.map((c) => c.id)),
    [filteredCampings],
  );

  const reachableIds = useMemo(() => {
    if (!selectedCamping || travelHours <= 0) return null;
    const maxKm = travelHours * 90 / 1.3;
    return new Set(
      campings
        .filter((c) => haversine(selectedCamping.lat, selectedCamping.lon, c.lat, c.lon) <= maxKm)
        .map((c) => c.id),
    );
  }, [selectedCamping, travelHours, campings]);

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
        <div className="relative flex-1 flex flex-col">
          <MapPanel
            onBoundsChange={setBounds}
            campings={campings}
            filteredIds={filteredIds}
            selectedId={selectedId}
            onSelectCamping={handleSelectCamping}
            reachableIds={reachableIds}
            travelRadiusKm={travelHours > 0 ? travelHours * 90 / 1.3 : null}
            onMapReady={(fn) => { mapFlyToRef.current = fn; }}
          />
          {campingNotFound && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1001] px-4 py-2 bg-gray-800 border border-gray-600 rounded text-xs text-gray-300 shadow-lg">
              &quot;{campingNotFound}&quot; niet gevonden in huidige kaartweergave
            </div>
          )}
          {selectedCamping && (
            <DetailOverlay
              camping={selectedCamping}
              isFavorite={favorites.has(selectedCamping.id)}
              onToggleFavorite={() => toggleFavorite(selectedCamping.id)}
              onClose={() => { setSelectedId(null); setTravelHours(0); }}
              travelHours={travelHours}
              onTravelHoursChange={setTravelHours}
              reachableCount={reachableIds ? reachableIds.size : null}
            />
          )}
        </div>

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
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            showFavoritesOnly={showFavoritesOnly}
            onToggleFavoritesOnly={() => setShowFavoritesOnly((v) => !v)}
          />
          <ChatPanel
            onSetFilters={(patch) =>
              setFilters((f) => ({
                ...f,
                ...(patch.dog !== undefined ? { dog: patch.dog! } : {}),
                ...(patch.wifi !== undefined ? { wifi: patch.wifi! } : {}),
                ...(patch.pool !== undefined ? { pool: patch.pool! } : {}),
                ...(patch.size_type !== undefined && (["all", "small", "medium", "large", "naturist"] as const).includes(patch.size_type as SizeType) ? { sizeType: patch.size_type as SizeType } : {}),
                ...(patch.water_max_km !== undefined ? { waterMaxKm: patch.water_max_km } : {}),
              }))
            }
            onNavigateMap={(lat, lon, zoom) => mapFlyToRef.current?.(lat, lon, zoom)}
            onSetTravelRange={setTravelHours}
            onSelectCamping={(name) => {
              const found = campings.find((c) =>
                c.name.toLowerCase().includes(name.toLowerCase())
              );
              if (found) {
                handleSelectCamping(found);
                setCampingNotFound(null);
              } else {
                setCampingNotFound(name);
                setTimeout(() => setCampingNotFound(null), 4000);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("loggedIn") === "true";
  });

  function handleEnter() {
    localStorage.setItem("loggedIn", "true");
    setLoggedIn(true);
  }

  if (!loggedIn) {
    return <LandingPage onEnter={handleEnter} />;
  }

  return <AppContent />;
}
