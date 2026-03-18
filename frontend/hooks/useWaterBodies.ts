"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Bounds } from "@/types/camping";

export interface WaterPoint {
  lat: number;
  lon: number;
}

const POLL_MS = 5000;

export function useWaterBodies(bounds: Bounds | null, enabled: boolean): WaterPoint[] {
  const [points, setPoints] = useState<WaterPoint[]>([]);
  const prevKeyRef = useRef<string>("");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const doFetch = useCallback((b: Bounds) => {
    const { south, west, north, east } = b;
    fetch(`/api/water-bodies?south=${south}&west=${west}&north=${north}&east=${east}`)
      .then((r) => r.json())
      .then((data: { points: WaterPoint[]; fetching: boolean }) => {
        if (!mountedRef.current) return;
        if (data.points.length > 0) {
          setPoints(data.points);
        }
        if (data.fetching || data.points.length === 0) {
          pollRef.current = setTimeout(() => {
            if (mountedRef.current) doFetch(b);
          }, POLL_MS);
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          pollRef.current = setTimeout(() => doFetch(b), POLL_MS);
        }
      });
  }, []);

  useEffect(() => {
    if (pollRef.current) clearTimeout(pollRef.current);

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
