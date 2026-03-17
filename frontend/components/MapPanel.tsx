"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { Bounds } from "@/types/camping";

interface MapPanelProps {
  onBoundsChange?: (bounds: Bounds) => void;
}

export default function MapPanel({ onBoundsChange }: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "/leaflet/marker-icon-2x.png",
        iconUrl: "/leaflet/marker-icon.png",
        shadowUrl: "/leaflet/marker-shadow.png",
      });

      const map = L.map(containerRef.current).setView([46.5, 2.5], 6);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      const emitBounds = () => {
        const b = map.getBounds();
        onBoundsChangeRef.current?.({
          south: b.getSouth(),
          west: b.getWest(),
          north: b.getNorth(),
          east: b.getEast(),
          zoom: map.getZoom(),
        });
      };

      map.on("moveend", emitBounds);
      map.on("zoomend", emitBounds);
      // Single initial emit after layout settles
      setTimeout(emitBounds, 300);

      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div className="flex-1 relative">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
