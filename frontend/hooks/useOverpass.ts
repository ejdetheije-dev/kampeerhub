"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Bounds, Camping } from "@/types/camping";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const DEBOUNCE_MS = 1500;
const SHIFT_THRESHOLD = 0.3;
const MIN_ZOOM = 9;
const COOLDOWN_MS = 30_000;
const RETRY_MS = 35_000;

function hasSignificantShift(prev: Bounds, next: Bounds): boolean {
  const latSpan = next.north - next.south;
  const lngSpan = next.east - next.west;
  const latShift = Math.abs(((prev.north + prev.south) - (next.north + next.south)) / 2) / latSpan;
  const lngShift = Math.abs(((prev.east + prev.west) - (next.east + next.west)) / 2) / lngSpan;
  return latShift > SHIFT_THRESHOLD || lngShift > SHIFT_THRESHOLD;
}

function inBounds(c: Camping, b: Bounds): boolean {
  return c.lat >= b.south && c.lat <= b.north && c.lon >= b.west && c.lon <= b.east;
}

function buildQuery(bounds: Bounds): string {
  const { south, west, north, east } = bounds;
  return `[out:json][timeout:30][maxsize:1048576];
(
  node["tourism"="camp_site"](${south},${west},${north},${east});
  way["tourism"="camp_site"](${south},${west},${north},${east});
  relation["tourism"="camp_site"](${south},${west},${north},${east});
);
out center tags;`;
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
  const [tooFarOut, setTooFarOut] = useState(false);

  // In-memory cache: id → Camping (survives re-renders, lost on page refresh)
  const cacheRef = useRef<Map<string, Camping>>(new Map());
  const cachedBoundsRef = useRef<Bounds | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchRef = useRef<number>(0);
  const pendingBoundsRef = useRef<Bounds | null>(null);

  const showFromCache = useCallback((b: Bounds) => {
    const visible = Array.from(cacheRef.current.values()).filter((c) => inBounds(c, b));
    setCampings(visible);
  }, []);

  const doFetch = useCallback(async (b: Bounds) => {
    lastFetchRef.current = Date.now();
    cachedBoundsRef.current = b;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        body: `data=${encodeURIComponent(buildQuery(b))}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      if (res.status === 429) {
        setError("Overpass bezet, opnieuw proberen in 35s...");
        retryRef.current = setTimeout(() => {
          lastFetchRef.current = 0;
          setError(null);
          doFetch(b);
        }, RETRY_MS);
        return;
      }

      if (!res.ok) throw new Error(`Overpass fout: ${res.status}`);
      const data: OverpassResponse = await res.json();

      // Merge into cache
      for (const c of parseCampings(data)) {
        cacheRef.current.set(c.id, c);
      }

      // Show everything visible in current bounds (may be newer than b if user panned)
      const currentBounds = pendingBoundsRef.current ?? b;
      showFromCache(currentBounds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ophalen mislukt");
    } finally {
      setLoading(false);
    }
  }, [showFromCache]);

  useEffect(() => {
    if (!bounds) return;

    if (bounds.zoom < MIN_ZOOM) {
      setTooFarOut(true);
      setCampings([]);
      return;
    }
    setTooFarOut(false);

    // Always show cached campings for current viewport immediately
    showFromCache(bounds);

    const cached = cachedBoundsRef.current;
    if (cached && !hasSignificantShift(cached, bounds)) return;

    pendingBoundsRef.current = bounds;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const b = pendingBoundsRef.current;
      if (!b) return;

      const elapsed = Date.now() - lastFetchRef.current;
      if (elapsed < COOLDOWN_MS) {
        debounceRef.current = setTimeout(() => {
          if (pendingBoundsRef.current) doFetch(pendingBoundsRef.current);
        }, COOLDOWN_MS - elapsed);
        return;
      }

      doFetch(b);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [bounds, doFetch, showFromCache]);

  useEffect(() => {
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, []);

  return { campings, loading, error, tooFarOut };
}
