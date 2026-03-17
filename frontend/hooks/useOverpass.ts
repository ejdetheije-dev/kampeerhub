"use client";

import { useState, useEffect, useRef } from "react";
import type { Bounds, Camping } from "@/types/camping";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const DEBOUNCE_MS = 500;
const SHIFT_THRESHOLD = 0.3;

function hasSignificantShift(prev: Bounds, next: Bounds): boolean {
  const latSpan = next.north - next.south;
  const lngSpan = next.east - next.west;
  const latShift = Math.abs(((prev.north + prev.south) - (next.north + next.south)) / 2) / latSpan;
  const lngShift = Math.abs(((prev.east + prev.west) - (next.east + next.west)) / 2) / lngSpan;
  return latShift > SHIFT_THRESHOLD || lngShift > SHIFT_THRESHOLD;
}

function parseCampings(data: OverpassResponse): Camping[] {
  const result: Camping[] = [];
  for (const el of data.elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat === undefined || lon === undefined) continue;

    const t = el.tags ?? {};
    result.push({
      id: `${el.type}-${el.id}`,
      name: t.name ?? "Camping (naamloos)",
      lat,
      lon,
      tags: {
        dog: t.dog === "yes",
        wifi: t.internet_access === "wlan" || t.internet_access === "yes",
        pool: t.swimming_pool === "yes",
        electricity: t.electricity === "yes",
        nudism: t.nudism === "yes" || t.nudism === "designated",
        capacity: t.capacity ? parseInt(t.capacity, 10) : undefined,
        fee: t.fee,
        charge: t.charge,
      },
    });
  }
  return result;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

export function useOverpass(bounds: Bounds | null) {
  const [campings, setCampings] = useState<Camping[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cachedBoundsRef = useRef<Bounds | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!bounds) return;

    const cached = cachedBoundsRef.current;
    if (cached && !hasSignificantShift(cached, bounds)) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const { south, west, north, east } = bounds;
      const query = `[out:json][timeout:30];
(
  node["tourism"="camp_site"](${south},${west},${north},${east});
  way["tourism"="camp_site"](${south},${west},${north},${east});
  relation["tourism"="camp_site"](${south},${west},${north},${east});
);
out center tags;`;

      setLoading(true);
      setError(null);
      cachedBoundsRef.current = bounds;

      try {
        const res = await fetch(OVERPASS_URL, {
          method: "POST",
          body: `data=${encodeURIComponent(query)}`,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        if (!res.ok) throw new Error(`Overpass fout: ${res.status}`);
        const data: OverpassResponse = await res.json();
        setCampings(parseCampings(data));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ophalen mislukt");
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [bounds]);

  return { campings, loading, error };
}
