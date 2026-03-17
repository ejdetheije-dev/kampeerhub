"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Bounds, Camping } from "@/types/camping";
import type * as L from "leaflet";

interface MapPanelProps {
  campings?: Camping[];
  onBoundsChange?: (bounds: Bounds) => void;
  onSelectCamping?: (camping: Camping) => void;
}

export default function MapPanel({ campings = [], onBoundsChange, onSelectCamping }: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const leafletRef = useRef<typeof L | null>(null);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const onSelectCampingRef = useRef(onSelectCamping);
  onBoundsChangeRef.current = onBoundsChange;
  onSelectCampingRef.current = onSelectCamping;

  // Initialize map once
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

      const markersLayer = L.layerGroup().addTo(map);

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
      setTimeout(emitBounds, 300);

      leafletRef.current = L;
      markersLayerRef.current = markersLayer;
      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersLayerRef.current = null;
        leafletRef.current = null;
      }
    };
  }, []);

  // Sync markers whenever campings changes
  useEffect(() => {
    const L = leafletRef.current;
    const layer = markersLayerRef.current;
    if (!L || !layer) return;

    layer.clearLayers();

    for (const camping of campings) {
      const marker = L.marker([camping.lat, camping.lon]);
      marker.bindTooltip(camping.name, { direction: "top", offset: [0, -10] });
      marker.on("click", () => onSelectCampingRef.current?.(camping));
      layer.addLayer(marker);
    }
  }, [campings]);

  return (
    <div className="flex-1 relative">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
