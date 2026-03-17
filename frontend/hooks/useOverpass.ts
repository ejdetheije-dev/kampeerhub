"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Bounds, Camping } from "@/types/camping";

const MIN_ZOOM = 9;
const DEBOUNCE_MS = 800;
const POLL_MS = 3000;
const SHIFT_THRESHOLD = 0.3;

function hasSignificantShift(prev: Bounds, next: Bounds): boolean {
  const latSpan = next.north - next.south;
  const lngSpan = next.east - next.west;
  if (latSpan === 0 || lngSpan === 0) return true;
  const latShift = Math.abs(((prev.north + prev.south) - (next.north + next.south)) / 2) / latSpan;
  const lngShift = Math.abs(((prev.east + prev.west) - (next.east + next.west)) / 2) / lngSpan;
  return latShift > SHIFT_THRESHOLD || lngShift > SHIFT_THRESHOLD;
}

export function useOverpass(bounds: Bounds | null) {
  const [campings, setCampings] = useState<Camping[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooFarOut, setTooFarOut] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cachedBoundsRef = useRef<Bounds | null>(null);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (b: Bounds) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const { south, west, north, east } = b;
      const res = await fetch(
        `/api/campings?south=${south}&west=${west}&north=${north}&east=${east}`,
        { signal: controller.signal },
      );
      if (!res.ok) throw new Error(`${res.status}`);
      const data: { campings: Camping[]; fetching: boolean } = await res.json();

      if (controller.signal.aborted || !mountedRef.current) return;

      setCampings(data.campings);

      if (data.fetching) {
        pollRef.current = setTimeout(() => {
          if (mountedRef.current) load(b);
          // else: component unmounted — do nothing
        }, POLL_MS);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (mountedRef.current) setError("Ophalen mislukt");
    } finally {
      if (!controller.signal.aborted && mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!bounds) return;

    if (bounds.zoom < MIN_ZOOM) {
      setTooFarOut(true);
      setCampings([]);
      if (pollRef.current) clearTimeout(pollRef.current);
      return;
    }
    setTooFarOut(false);

    const cached = cachedBoundsRef.current;
    if (cached && !hasSignificantShift(cached, bounds)) return;
    cachedBoundsRef.current = bounds;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (pollRef.current) clearTimeout(pollRef.current);

    debounceRef.current = setTimeout(() => load(bounds), DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // pollRef is cleared above (on significant shift) or on zoom-out — not here,
      // because small pans should not cancel an in-progress poll for the same area
    };
  }, [bounds, load]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  return { campings, loading, error, tooFarOut };
}
