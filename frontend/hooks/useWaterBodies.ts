"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Bounds } from "@/types/camping";

export interface WaterPoint {
  lat: number;
  lon: number;
}

const POLL_MS = 5000;
// Keep one representative point per ~2km cell to reduce computation load
const GRID_DEG = 0.02;

function sample(points: WaterPoint[]): WaterPoint[] {
  const seen = new Set<string>();
  return points.filter((p) => {
    const key = `${Math.round(p.lat / GRID_DEG)}_${Math.round(p.lon / GRID_DEG)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function useWaterBodies(bounds: Bounds | null, enabled: boolean): WaterPoint[] {
  const [points, setPoints] = useState<WaterPoint[]>([]);
  const prevKeyRef = useRef<string>("");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const doFetch = useCallback((b: Bounds) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const { south, west, north, east } = b;
    fetch(`/api/water-bodies?south=${south}&west=${west}&north=${north}&east=${east}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { points: WaterPoint[]; fetching: boolean }) => {
        if (!mountedRef.current) return;
        if (data.points.length > 0) {
          setPoints(sample(data.points));
        }
        if (data.fetching) {
          pollRef.current = setTimeout(() => {
            if (mountedRef.current) doFetch(b);
          }, POLL_MS);
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        if (mountedRef.current) {
          pollRef.current = setTimeout(() => doFetch(b), POLL_MS);
        }
      });
  }, []);

  useEffect(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }

    if (!bounds || !enabled) {
      setPoints([]);
      prevKeyRef.current = "";
      return;
    }

    const key = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;

    doFetch(bounds);
  }, [bounds, enabled, doFetch]);

  return points;
}
