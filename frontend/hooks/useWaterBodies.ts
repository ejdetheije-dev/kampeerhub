"use client";

import { useState, useEffect, useRef } from "react";
import type { Bounds } from "@/types/camping";

export interface WaterPoint {
  lat: number;
  lon: number;
}

export function useWaterBodies(bounds: Bounds | null, enabled: boolean): WaterPoint[] {
  const [points, setPoints] = useState<WaterPoint[]>([]);
  const prevKeyRef = useRef<string>("");

  useEffect(() => {
    if (!bounds || !enabled) {
      setPoints([]);
      prevKeyRef.current = "";
      return;
    }
    const key = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;

    const { south, west, north, east } = bounds;
    fetch(`/api/water-bodies?south=${south}&west=${west}&north=${north}&east=${east}`)
      .then((r) => r.json())
      .then((data) => setPoints(data.points ?? []))
      .catch(() => {});
  }, [bounds, enabled]);

  return points;
}
