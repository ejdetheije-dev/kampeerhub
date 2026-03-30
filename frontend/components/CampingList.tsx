"use client";

import type { Camping, Filters } from "@/types/camping";
import type { Dates } from "@/hooks/useOverpass";
import FilterPanel from "@/components/FilterPanel";
import { TAG_LABELS, HeartIcon } from "@/components/shared";

function availabilityBadgeClass(label: string): string {
  switch (label) {
    case "Waarschijnlijk beschikbaar": return "bg-green-900/60 text-green-400 border-green-700/40";
    case "Onzeker": return "bg-yellow-900/60 text-yellow-400 border-yellow-700/40";
    case "Waarschijnlijk vol":
    case "Regio structureel vol": return "bg-red-900/60 text-red-400 border-red-700/40";
    case "Minimumverblijf waarschijnlijk": return "bg-orange-900/60 text-orange-400 border-orange-700/40";
    default: return "bg-gray-700/60 text-gray-400 border-gray-600/40";
  }
}

interface CampingListProps {
  campings: Camping[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  tooFarOut: boolean;
  selectedId?: string | null;
  onSelect?: (camping: Camping) => void;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  capacityDataPct: number;
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
  showFavoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  dates: Dates | null;
  onDatesChange: (dates: Dates | null) => void;
}

export default function CampingList({
  campings,
  totalCount,
  loading,
  error,
  tooFarOut,
  selectedId,
  onSelect,
  filters,
  onFiltersChange,
  capacityDataPct,
  favorites,
  onToggleFavorite,
  showFavoritesOnly,
  onToggleFavoritesOnly,
  dates,
  onDatesChange,
}: CampingListProps) {
  const today = new Date().toISOString().split("T")[0];
  const nights =
    dates?.arrival && dates?.departure
      ? Math.round((new Date(dates.departure).getTime() - new Date(dates.arrival).getTime()) / 86400000)
      : null;

  function handleArrivalChange(val: string) {
    if (!val) { onDatesChange(null); return; }
    const dep = dates?.departure && dates.departure > val ? dates.departure : "";
    if (dep) onDatesChange({ arrival: val, departure: dep });
    else onDatesChange({ arrival: val, departure: dates?.departure ?? "" });
  }

  function handleDepartureChange(val: string) {
    if (!val) { onDatesChange(null); return; }
    if (dates?.arrival && val > dates.arrival) onDatesChange({ arrival: dates.arrival, departure: val });
    else onDatesChange(dates ? { ...dates, departure: val } : { arrival: "", departure: val });
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Date row */}
      <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-gray-500 shrink-0">Van</span>
        <input
          type="date"
          value={dates?.arrival ?? ""}
          min={today}
          onChange={(e) => handleArrivalChange(e.target.value)}
          className="bg-gray-800 text-gray-200 text-xs rounded px-2 py-1 flex-1 min-w-0 outline-none focus:ring-1 focus:ring-[#209dd7]"
        />
        <span className="text-xs text-gray-500 shrink-0">tot</span>
        <input
          type="date"
          value={dates?.departure ?? ""}
          min={dates?.arrival ?? today}
          onChange={(e) => handleDepartureChange(e.target.value)}
          className="bg-gray-800 text-gray-200 text-xs rounded px-2 py-1 flex-1 min-w-0 outline-none focus:ring-1 focus:ring-[#209dd7]"
        />
        {nights !== null && nights > 0 && (
          <span className="text-xs text-gray-500 shrink-0">{nights}n</span>
        )}
        {dates && (dates.arrival || dates.departure) && (
          <button onClick={() => onDatesChange(null)} className="text-gray-600 hover:text-gray-300 text-xs shrink-0" title="Datums wissen">✕</button>
        )}
      </div>

      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
        <span className="text-sm text-gray-400 flex-1">
          {tooFarOut ? (
            <span className="text-gray-500">zoom in om campings te laden</span>
          ) : loading ? (
            <span className="text-gray-500">laden...</span>
          ) : error ? (
            <span className="text-red-400">{error}</span>
          ) : (
            <>
              <span className="text-[#209dd7] font-semibold">{campings.length}</span>
              {campings.length !== totalCount && (
                <span className="text-gray-600"> van {totalCount}</span>
              )}{" "}
              campings
            </>
          )}
        </span>
        <button
          onClick={onToggleFavoritesOnly}
          title={showFavoritesOnly ? "Toon alle campings" : "Toon alleen favorieten"}
          className={`p-1 rounded transition-colors ${showFavoritesOnly ? "text-[#ecad0a]" : "text-gray-600 hover:text-gray-400"}`}
        >
          <HeartIcon filled={showFavoritesOnly} />
        </button>
      </div>

      <FilterPanel filters={filters} onChange={onFiltersChange} capacityDataPct={capacityDataPct} tooFarOut={tooFarOut} />

      <div className="flex-1 overflow-y-auto">
        {!loading && !error && !tooFarOut && campings.length === 0 && (
          <div className="px-4 py-6 text-sm text-gray-500 text-center">
            {showFavoritesOnly ? "Geen favorieten opgeslagen" : "Geen campings gevonden in dit gebied"}
          </div>
        )}
        {campings.map((c) => {
          const activeTags = (Object.entries(c.tags) as [string, unknown][])
            .filter(([, v]) => v === true)
            .map(([k]) => TAG_LABELS[k] ?? k);

          const priceLabel = c.tags.charge ?? (c.tags.fee === "yes" ? "betaald" : c.tags.fee === "no" ? "gratis" : null);

          const websiteUrl =
            c.tags.website ??
            `https://www.eurocampings.nl/search/specific/?query=${encodeURIComponent(c.name + " " + c.lat.toFixed(2) + " " + c.lon.toFixed(2))}`;

          const isSelected = c.id === selectedId;
          const isFav = favorites.has(c.id);

          return (
            <div
              key={c.id}
              onClick={() => onSelect?.(c)}
              className={`px-4 py-3 border-b border-gray-800 cursor-pointer transition-colors ${isSelected ? "bg-gray-700/60 border-l-2 border-l-[#ecad0a]" : "hover:bg-gray-800/40"}`}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="font-medium text-sm text-gray-100">{c.name}</div>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite(c.id); }}
                  className="ml-2 shrink-0 p-0.5"
                  aria-label={isFav ? "Verwijder favoriet" : "Voeg toe aan favorieten"}
                >
                  <HeartIcon filled={isFav} />
                </button>
              </div>
              {(activeTags.length > 0 || c.tags.cozy || c.availability) && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {c.availability && (
                    <span className={`text-xs px-2 py-0.5 rounded border ${availabilityBadgeClass(c.availability.label)}`}>
                      {c.availability.label}
                    </span>
                  )}
                  {c.tags.cozy && (
                    <span className="text-xs px-2 py-0.5 rounded bg-green-900/60 text-green-400 border border-green-700/40">
                      knusse camping
                    </span>
                  )}
                  {activeTags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex justify-between items-center text-xs text-gray-500">
                <span className="flex gap-2">
                  <span>
                    {c.lat.toFixed(3)}, {c.lon.toFixed(3)}
                  </span>
                  {priceLabel && <span className="text-gray-400">{priceLabel}</span>}
                </span>
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#209dd7] hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {c.tags.website ? "Website" : "Eurocampings"}
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
