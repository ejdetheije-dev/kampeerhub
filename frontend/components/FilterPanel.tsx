"use client";

import { useState } from "react";
import type { Filters, SizeType } from "@/types/camping";
import { DEFAULT_FILTERS } from "@/types/camping";

interface FilterPanelProps {
  filters: Filters;
  onChange: (f: Filters) => void;
  capacityDataPct?: number; // % of campings with capacity data (for info note)
}

const FACILITIES: [keyof Pick<Filters, "dog" | "wifi" | "pool" | "electricity">, string][] = [
  ["dog", "honden"],
  ["wifi", "wifi"],
  ["pool", "zwembad"],
  ["electricity", "stroom"],
];

const SIZE_TYPES: [SizeType, string][] = [
  ["all", "alle"],
  ["small", "klein (<50)"],
  ["medium", "middelgroot"],
  ["large", "groot (>200)"],
  ["naturist", "naturist"],
];

export default function FilterPanel({ filters, onChange, capacityDataPct }: FilterPanelProps) {
  const [open, setOpen] = useState(false);

  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  const activeCount = [
    filters.dog,
    filters.wifi,
    filters.pool,
    filters.electricity,
    filters.sizeType !== "all",
    filters.priceMax < 80,
    filters.waterMaxKm !== null,
  ].filter(Boolean).length;

  return (
    <div className="border-b border-gray-800">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-2 flex items-center justify-between text-xs text-gray-400 hover:bg-gray-800/40 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          Filters
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-[#209dd7]/20 text-[#209dd7]">
              {activeCount}
            </span>
          )}
        </span>
        <span className="text-gray-600">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 py-3 space-y-3 bg-[#0d1117]/60">
          {/* Faciliteiten */}
          <div>
            <div className="text-xs text-gray-500 mb-1.5">Faciliteiten</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {FACILITIES.map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters[key]}
                    onChange={(e) => set({ [key]: e.target.checked })}
                    className="accent-[#209dd7]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Type */}
          <div>
            <div className="text-xs text-gray-500 mb-1.5">Type</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {SIZE_TYPES.map(([val, label]) => (
                <label key={val} className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="radio"
                    name="sizeType"
                    checked={filters.sizeType === val}
                    onChange={() => set({ sizeType: val })}
                    className="accent-[#209dd7]"
                  />
                  {label}
                </label>
              ))}
            </div>
            {filters.sizeType !== "all" && filters.sizeType !== "naturist" && capacityDataPct !== undefined && (
              <div className="mt-1.5 text-xs text-gray-600">
                {capacityDataPct}% campings heeft capaciteitsdata in OSM
              </div>
            )}
          </div>

          {/* Prijs */}
          <div>
            <div className="text-xs text-gray-500 mb-1.5">
              Max prijs:{" "}
              {filters.priceMax >= 80 ? (
                <span className="text-gray-400">geen limiet</span>
              ) : (
                <span className="text-gray-300">€{filters.priceMax}/nacht</span>
              )}
            </div>
            <input
              type="range"
              min={0}
              max={80}
              step={5}
              value={filters.priceMax}
              onChange={(e) => set({ priceMax: Number(e.target.value) })}
              className="w-full accent-[#209dd7]"
            />
          </div>

          {/* Afstand tot water */}
          <div>
            <div className="text-xs text-gray-500 mb-1.5 flex items-center gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.waterMaxKm !== null}
                  onChange={(e) => set({ waterMaxKm: e.target.checked ? 5 : null })}
                  className="accent-[#209dd7]"
                />
                <span className="text-gray-300">Afstand tot water</span>
              </label>
              {filters.waterMaxKm !== null && (
                <span className="text-gray-400">&lt;{filters.waterMaxKm} km</span>
              )}
            </div>
            {filters.waterMaxKm !== null && (
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={filters.waterMaxKm}
                onChange={(e) => set({ waterMaxKm: Number(e.target.value) })}
                className="w-full accent-[#209dd7]"
              />
            )}
          </div>

          {activeCount > 0 && (
            <button
              onClick={() => onChange(DEFAULT_FILTERS)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              filters wissen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
