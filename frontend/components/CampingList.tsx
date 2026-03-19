"use client";

import type { Camping, Filters } from "@/types/camping";
import FilterPanel from "@/components/FilterPanel";
import { TAG_LABELS, HeartIcon } from "@/components/shared";

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
}: CampingListProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
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
              {(activeTags.length > 0 || c.tags.cozy) && (
                <div className="flex flex-wrap gap-1 mb-2">
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
