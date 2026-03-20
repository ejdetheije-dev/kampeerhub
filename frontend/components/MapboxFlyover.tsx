"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

interface MapboxFlyoverProps {
  lat: number;
  lon: number;
}

export default function MapboxFlyover({ lat, lon }: MapboxFlyoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ remove: () => void; setBearing: (b: number) => void } | null>(null);
  const rafRef = useRef<number | null>(null);
  const [animating, setAnimating] = useState(true);
  const animatingRef = useRef(true);
  const [token, setToken] = useState<string | undefined>(undefined); // undefined = loading

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setToken(d.mapbox_token ?? ""))
      .catch(() => setToken(""));
  }, []);

  useEffect(() => {
    animatingRef.current = animating;
  }, [animating]);

  useEffect(() => {
    if (!token || !containerRef.current) return;

    import("mapbox-gl").then((mod) => {
      const mapboxgl = mod.default;
      mapboxgl.accessToken = token;

      const map = new mapboxgl.Map({
        container: containerRef.current!,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [lon, lat],
        zoom: 10,
        pitch: 0,
        bearing: 0,
        antialias: true,
      });

      mapRef.current = map;

      map.on("load", () => {
        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
        });
        map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
        map.flyTo({ center: [lon, lat], zoom: 15, pitch: 0, duration: 2500 });

        map.once("moveend", () => {
          map.easeTo({ pitch: 65, duration: 1500 });
          map.once("moveend", () => {
            let bearing = 0;
            const rotate = () => {
              if (!animatingRef.current) return;
              bearing = (bearing + 0.3) % 360;
              map.setBearing(bearing);
              rafRef.current = requestAnimationFrame(rotate);
            };
            rafRef.current = requestAnimationFrame(rotate);
          });
        });
      });
    });

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [token, lat, lon]);

  if (token === undefined) {
    return <div className="text-gray-600 text-xs py-2">laden...</div>;
  }

  if (!token) {
    return (
      <div className="text-gray-500 text-xs py-2">
        3D satellietbeeld niet beschikbaar —{" "}
        <code className="text-gray-400">NEXT_PUBLIC_MAPBOX_TOKEN</code> niet ingesteld.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div ref={containerRef} className="w-full h-48 rounded overflow-hidden" />
      <button
        onClick={() => setAnimating((a) => !a)}
        className="text-xs text-gray-400 hover:text-gray-200"
      >
        {animating ? "Stop rotatie" : "Herstart rotatie"}
      </button>
    </div>
  );
}
