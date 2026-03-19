"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup, Circle } from "leaflet";
type LeafletType = typeof import("leaflet");
import type { Bounds, Camping } from "@/types/camping";

interface MapPanelProps {
  onBoundsChange?: (bounds: Bounds) => void;
  campings?: Camping[];
  filteredIds?: Set<string>;
  selectedId?: string | null;
  onSelectCamping?: (camping: Camping) => void;
  reachableIds?: Set<string> | null;
  travelRadiusKm?: number | null;
  onMapReady?: (flyTo: (lat: number, lon: number, zoom: number) => void) => void;
}

export default function MapPanel({ onBoundsChange, campings = [], filteredIds, selectedId, onSelectCamping, reachableIds, travelRadiusKm, onMapReady }: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LayerGroup | null>(null);
  const circleRef = useRef<Circle | null>(null);
  const leafletRef = useRef<LeafletType | null>(null);
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;
  const onSelectCampingRef = useRef(onSelectCamping);
  onSelectCampingRef.current = onSelectCamping;
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;

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

      const markers = L.layerGroup().addTo(map);
      markersRef.current = markers;

      mapRef.current = map;
      leafletRef.current = L;

      onMapReadyRef.current?.((lat, lon, zoom) => {
        mapRef.current?.flyTo([lat, lon], zoom);
      });
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = null;
      }
    };
  }, []);

  // Update markers when campings or selectedId change
  useEffect(() => {
    const layerGroup = markersRef.current;
    if (!layerGroup) return;

    import("leaflet").then((L) => {
      layerGroup.clearLayers();

      const hasActiveFilter = filteredIds !== undefined && filteredIds.size < campings.length;

      campings.forEach((camping) => {
        const isSelected = camping.id === selectedId;
        const isFiltered = hasActiveFilter && !filteredIds!.has(camping.id);
        const outOfReach = reachableIds != null && !reachableIds.has(camping.id) && !isSelected;
        const isCozy = camping.tags?.cozy === true;
        const size = isSelected ? 14 : 10;
        const dimmed = isFiltered || outOfReach;
        const color = isSelected ? "#ecad0a" : dimmed ? "#555" : isCozy ? "#4caf50" : "#209dd7";
        const opacity = dimmed ? 0.35 : 1;
        const icon = L.divIcon({
          className: "",
          html: isCozy
            ? `<div style="
                width:${size}px;
                height:${size}px;
                background:${color};
                border:2px solid ${isSelected ? "#fff" : "#0d1117"};
                box-shadow:0 0 4px rgba(0,0,0,0.5);
                opacity:${opacity};
                transform:rotate(45deg);
              "></div>`
            : `<div style="
                width:${size}px;
                height:${size}px;
                border-radius:50%;
                background:${color};
                border:2px solid ${isSelected ? "#fff" : "#0d1117"};
                box-shadow:0 0 4px rgba(0,0,0,0.5);
                opacity:${opacity};
              "></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        const marker = L.marker([camping.lat, camping.lon], { icon });
        marker.bindTooltip(camping.name, { direction: "top", offset: [0, -8] });
        marker.on("click", () => onSelectCampingRef.current?.(camping));
        marker.addTo(layerGroup);
      });

    });
  }, [campings, filteredIds, selectedId, reachableIds]);

  // Travel radius circle — synchroon via leafletRef, campings niet in deps
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const selected = campings.find((c) => c.id === selectedId);
    if (!selected || !travelRadiusKm || travelRadiusKm <= 0) return;

    circleRef.current = L.circle([selected.lat, selected.lon], {
      radius: travelRadiusKm * 1000,
      color: "#ecad0a",
      weight: 2,
      fillColor: "#ecad0a",
      fillOpacity: 0.08,
    }).addTo(map);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, travelRadiusKm]);

  return (
    <div className="flex-1 relative">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
