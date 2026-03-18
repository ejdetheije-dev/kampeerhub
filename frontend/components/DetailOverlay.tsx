"use client";

import type { Camping } from "@/types/camping";

const TAG_LABELS: Record<string, string> = {
  dog: "honden",
  wifi: "wifi",
  pool: "zwembad",
  electricity: "stroom",
  nudism: "naturist",
};

interface DetailOverlayProps {
  camping: Camping;
  onClose: () => void;
}

export default function DetailOverlay({ camping, onClose }: DetailOverlayProps) {
  const { tags } = camping;

  const activeTags = (Object.entries(tags) as [string, unknown][])
    .filter(([k, v]) => v === true && TAG_LABELS[k])
    .map(([k]) => TAG_LABELS[k]);

  const eurocampingsUrl = tags.website
    ? tags.website
    : `https://www.eurocampings.nl/search/specific/?query=${encodeURIComponent(
        camping.name + " " + camping.lat.toFixed(2) + " " + camping.lon.toFixed(2)
      )}`;

  const priceLabel = tags.charge ?? (tags.fee === "yes" ? "betaald" : tags.fee === "no" ? "gratis" : null);

  return (
    <div className="absolute bottom-4 left-4 z-[1000] w-80 bg-[#0d1117] border border-gray-700 rounded shadow-xl text-gray-100">
      <div className="flex items-start justify-between px-4 pt-4 pb-2 border-b border-gray-800">
        <span className="font-semibold text-sm leading-snug pr-2">{camping.name}</span>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-200 text-lg leading-none shrink-0"
          aria-label="Sluiten"
        >
          ×
        </button>
      </div>

      <div className="px-4 py-3 space-y-3 text-xs">
        {activeTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {activeTags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="space-y-1 text-gray-400">
          {tags.capacity != null && (
            <div>
              <span className="text-gray-500">capaciteit: </span>
              {tags.capacity} plekken
            </div>
          )}
          {priceLabel && (
            <div>
              <span className="text-gray-500">prijs: </span>
              {priceLabel}
            </div>
          )}
          <div>
            <span className="text-gray-500">coördinaten: </span>
            {camping.lat.toFixed(5)}, {camping.lon.toFixed(5)}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <a
            href={eurocampingsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#209dd7] hover:underline"
          >
            {tags.website ? "Website" : "Eurocampings"}
          </a>
          <a
            href={`https://www.openstreetmap.org/?mlat=${camping.lat}&mlon=${camping.lon}&zoom=14`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-gray-300"
          >
            OSM
          </a>
        </div>
      </div>
    </div>
  );
}
