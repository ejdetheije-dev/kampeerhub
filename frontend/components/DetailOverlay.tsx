"use client";

import { useState, useEffect } from "react";
import type { Camping } from "@/types/camping";

const TAG_LABELS: Record<string, string> = {
  dog: "honden",
  wifi: "wifi",
  pool: "zwembad",
  electricity: "stroom",
  nudism: "naturist",
};

function weatherLabel(code: number): string {
  if (code === 0) return "zon";
  if (code <= 3) return "bew";
  if (code <= 48) return "mist";
  if (code <= 55) return "mot";
  if (code <= 65) return "reg";
  if (code <= 77) return "snw";
  if (code <= 82) return "bui";
  if (code <= 86) return "snb";
  return "onw";
}

interface DayForecast {
  date: string;
  max: number;
  min: number;
  precip: number;
  code: number;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`w-4 h-4 ${filled ? "fill-[#ecad0a] stroke-[#ecad0a]" : "fill-none stroke-gray-500"}`}
      strokeWidth={2}
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

interface DetailOverlayProps {
  camping: Camping;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClose: () => void;
  travelHours: number;
  onTravelHoursChange: (h: number) => void;
  reachableCount: number | null;
}

export default function DetailOverlay({ camping, isFavorite, onToggleFavorite, onClose, travelHours, onTravelHoursChange, reachableCount }: DetailOverlayProps) {
  const { tags } = camping;
  const [forecast, setForecast] = useState<DayForecast[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${camping.lat}&longitude=${camping.lon}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode` +
      `&forecast_days=7&timezone=Europe%2FParis`;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const d = data.daily;
        const days: DayForecast[] = d.time.map((t: string, i: number) => ({
          date: t,
          max: Math.round(d.temperature_2m_max[i]),
          min: Math.round(d.temperature_2m_min[i]),
          precip: Math.round(d.precipitation_sum[i] * 10) / 10,
          code: d.weathercode[i],
        }));
        setForecast(days);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [camping.lat, camping.lon]);

  const activeTags = (Object.entries(tags) as [string, unknown][])
    .filter(([k, v]) => v === true && TAG_LABELS[k])
    .map(([k]) => TAG_LABELS[k]);

  const eurocampingsUrl = tags.website
    ? tags.website
    : `https://www.eurocampings.nl/search/specific/?query=${encodeURIComponent(
        camping.name + " " + camping.lat.toFixed(2) + " " + camping.lon.toFixed(2)
      )}`;

  const priceLabel = tags.charge ?? (tags.fee === "yes" ? "betaald" : tags.fee === "no" ? "gratis" : null);

  const dayNames = ["zo", "ma", "di", "wo", "do", "vr", "za"];

  return (
    <div className="absolute bottom-4 left-4 z-[1000] w-80 bg-[#0d1117] border border-gray-700 rounded shadow-xl text-gray-100">
      <div className="flex items-start justify-between px-4 pt-4 pb-2 border-b border-gray-800">
        <span className="font-semibold text-sm leading-snug pr-2">{camping.name}</span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onToggleFavorite}
            aria-label={isFavorite ? "Verwijder favoriet" : "Voeg toe aan favorieten"}
          >
            <HeartIcon filled={isFavorite} />
          </button>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-200 text-lg leading-none"
            aria-label="Sluiten"
          >
            ×
          </button>
        </div>
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
            <span className="text-gray-500">coord: </span>
            {camping.lat.toFixed(4)}, {camping.lon.toFixed(4)}
          </div>
        </div>

        {/* 7-day weather forecast */}
        <div className="border-t border-gray-800 pt-3">
          {!forecast ? (
            <div className="text-gray-600 text-xs">weer laden...</div>
          ) : (
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {forecast.map((day) => {
                const d = new Date(day.date);
                return (
                  <div key={day.date} className="flex flex-col items-center gap-0.5">
                    <span className="text-gray-500">{dayNames[d.getDay()]}</span>
                    <span className="text-[#209dd7] font-medium">{day.max}°</span>
                    <span className="text-gray-500">{day.min}°</span>
                    <span className="text-gray-600 text-[10px]">{weatherLabel(day.code)}</span>
                    {day.precip > 0 && (
                      <span className="text-blue-400 text-[10px]">{day.precip}mm</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-gray-800 pt-3 space-y-1">
          <div className="flex justify-between text-gray-400">
            <span>reisbereik (caravan)</span>
            <span className="text-[#ecad0a]">{travelHours > 0 ? `${travelHours}u` : "uit"}</span>
          </div>
          <input
            type="range"
            min={0}
            max={8}
            step={0.5}
            value={travelHours}
            onChange={(e) => onTravelHoursChange(Number(e.target.value))}
            className="w-full accent-[#ecad0a]"
          />
          {reachableCount !== null && (
            <div className="text-gray-500">
              {reachableCount} camping{reachableCount !== 1 ? "s" : ""} bereikbaar
            </div>
          )}
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
