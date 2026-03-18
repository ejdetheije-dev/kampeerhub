"use client";

import type { Camping, Filters } from "@/types/camping";
import FilterPanel from "@/components/FilterPanel";

const TAG_LABELS: Record<string, string> = {
  dog: "honden",
  wifi: "wifi",
  pool: "zwembad",
  electricity: "stroom",
  nudism: "naturist",
};

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
}: CampingListProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
        <span className="text-sm text-gray-400">
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
      </div>

      <FilterPanel filters={filters} onChange={onFiltersChange} />

      <div className="flex-1 overflow-y-auto">
        {!loading && !error && !tooFarOut && campings.length === 0 && (
          <div className="px-4 py-6 text-sm text-gray-500 text-center">
            Geen campings gevonden in dit gebied
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
          return (
            <div
              key={c.id}
              onClick={() => onSelect?.(c)}
              className={`px-4 py-3 border-b border-gray-800 cursor-pointer transition-colors ${isSelected ? "bg-gray-700/60 border-l-2 border-l-[#ecad0a]" : "hover:bg-gray-800/40"}`}
            >
              <div className="font-medium text-sm text-gray-100 mb-1">{c.name}</div>
              {activeTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
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
