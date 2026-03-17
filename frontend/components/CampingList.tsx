"use client";

import type { Camping } from "@/types/camping";

const TAG_LABELS: Record<string, string> = {
  dog: "honden",
  wifi: "wifi",
  pool: "zwembad",
  electricity: "stroom",
  nudism: "naturist",
};

interface CampingListProps {
  campings: Camping[];
  loading: boolean;
  error: string | null;
  tooFarOut: boolean;
}

export default function CampingList({ campings, loading, error, tooFarOut }: CampingListProps) {
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
              <span className="text-[#209dd7] font-semibold">{campings.length}</span> campings gevonden
            </>
          )}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {campings.map((c) => {
          const activeTags = (Object.entries(c.tags) as [string, unknown][])
            .filter(([, v]) => v === true)
            .map(([k]) => TAG_LABELS[k] ?? k);

          const eurocampingsUrl = `https://www.eurocampings.nl/zoeken/?q=${encodeURIComponent(c.name)}`;

          const priceLabel = c.tags.charge ?? (c.tags.fee === "yes" ? "betaald" : null);

          return (
            <div
              key={c.id}
              className="px-4 py-3 border-b border-gray-800 hover:bg-gray-800/40 transition-colors"
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
                <span>{c.lat.toFixed(3)}, {c.lon.toFixed(3)}</span>
                <div className="flex items-center gap-2">
                  {priceLabel && (
                    <span className="text-[#ecad0a]">{priceLabel}</span>
                  )}
                  <a
                    href={eurocampingsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#209dd7] hover:underline"
                  >
                    Eurocampings
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
