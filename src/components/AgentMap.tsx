"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { sideOf } from "@/lib/agents";
import { marketOutline } from "@/lib/markets";
import type { Agent, MapColorMode, Market } from "@/lib/types";
import "leaflet/dist/leaflet.css";

// Leaflet's canvas renderer can run one queued redraw after its map was torn down (React
// strict mode mounts the map twice in dev; navigating away does the same in prod). Skip
// redraws once the drawing context is gone instead of throwing.
const canvasProto = L.Canvas.prototype as unknown as { _redraw: () => void; _ctx?: unknown; __guarded?: boolean };
if (!canvasProto.__guarded) {
  const redraw = canvasProto._redraw;
  canvasProto._redraw = function (this: { _ctx?: unknown }) {
    if (!this._ctx) return;
    redraw.call(this);
  };
  canvasProto.__guarded = true;
}

const SIDE_COLOR = { sell: "#0f7b6c", buy: "#2f5fd0", balanced: "#c27d0e" } as const;
const VOLUME_RAMP = ["#bfdcd3", "#7dbbab", "#3f9884", "#16705e", "#0b4a3e"];
const RECENCY_RAMP = ["#0b4a3e", "#3f9884", "#a9cfc4", "#c9d3ce"];
const SELECTED_FILL = "#f2b632";

export function volumeColor(total: number): string {
  if (total >= 15) return VOLUME_RAMP[4];
  if (total >= 8) return VOLUME_RAMP[3];
  if (total >= 4) return VOLUME_RAMP[2];
  if (total >= 2) return VOLUME_RAMP[1];
  return VOLUME_RAMP[0];
}

function daysBetween(a: string, b: string): number {
  if (!a || !b) return Infinity;
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
}

export function recencyColor(last: string, through: string): string {
  const d = daysBetween(last, through);
  if (d <= 30) return RECENCY_RAMP[0];
  if (d <= 90) return RECENCY_RAMP[1];
  if (d <= 180) return RECENCY_RAMP[2];
  return RECENCY_RAMP[3];
}

function colorFor(agent: Agent, mode: MapColorMode, through: string): string {
  if (mode === "volume") return volumeColor(agent.total);
  if (mode === "recency") return recencyColor(agent.lastTransaction, through);
  return SIDE_COLOR[sideOf(agent)];
}

function radiusFor(agent: Agent): number {
  return 3 + Math.min(7, Math.sqrt(agent.total) * 1.2);
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export default function AgentMap({
  agents,
  market,
  selectedId,
  colorMode,
  through,
  onSelect,
}: {
  agents: Agent[];
  market: Market;
  selectedId: string | null;
  colorMode: MapColorMode;
  through: string;
  onSelect: (id: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const areaRef = useRef<L.Polygon | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const agentsRef = useRef<Map<string, Agent>>(new Map());
  const fittedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef<string | null>(null);
  const modeRef = useRef({ colorMode, through });

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Create the map once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || mapRef.current) return;
    const renderer = L.canvas();
    const map = L.map(host, {
      renderer,
      preferCanvas: true,
      zoomControl: false,
      center: market.center,
      zoom: 11,
    });
    L.control.zoom({ position: "topright" }).addTo(map);
    // Light-gray basemap so the pins carry the colour. Needs no API key; swap for a keyed
    // provider (MapTiler, Stadia) before heavy production traffic.
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, FAO, NOAA, USGS",
        maxNativeZoom: 16,
        maxZoom: 18,
      },
    ).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // The map can mount inside a hidden tab (mobile); re-measure and re-fit once it becomes visible.
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      if (!fittedRef.current && host.clientWidth > 0 && areaRef.current) {
        map.fitBounds(areaRef.current.getBounds(), { padding: [24, 24], animate: false });
        fittedRef.current = true;
      }
    });
    ro.observe(host);
    const markers = markersRef.current;
    return () => {
      ro.disconnect();
      // A canvas redraw can still be queued when the map is torn down (React strict mode
      // mounts twice in dev); cancel it so it doesn't paint on a destroyed context.
      const pending = (renderer as unknown as { _redrawRequest?: number })._redrawRequest;
      if (pending) L.Util.cancelAnimFrame(pending);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      areaRef.current = null;
      markers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Market area outline + camera.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    areaRef.current?.remove();
    const area = L.polygon(marketOutline(market), {
      color: "#0f5c4d",
      weight: 1.5,
      dashArray: "6 6",
      opacity: 0.6,
      fillColor: "#0f5c4d",
      fillOpacity: 0.04,
      interactive: false,
    }).addTo(map);
    areaRef.current = area;
    map.fitBounds(area.getBounds(), { padding: [24, 24], animate: false });
    fittedRef.current = (hostRef.current?.clientWidth ?? 0) > 0;
  }, [market]);

  // Pins.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    markersRef.current.clear();
    agentsRef.current.clear();
    modeRef.current = { colorMode, through };

    // Draw big producers last so they sit on top of one-deal agents.
    const ordered = [...agents].sort((a, b) => a.total - b.total);
    for (const agent of ordered) {
      const marker = L.circleMarker([agent.lat, agent.lng], {
        radius: radiusFor(agent),
        color: "#ffffff",
        weight: 0.75,
        fillColor: colorFor(agent, colorMode, through),
        fillOpacity: 0.78,
      });
      marker.bindTooltip(
        `<b>${esc(agent.name)}</b><br>${agent.total} txns · ${agent.sellSide} sell / ${agent.buySide} buy`,
        { className: "am-tip", direction: "top", offset: [0, -4] },
      );
      marker.on("click", () => onSelectRef.current(agent.id));
      marker.addTo(layer);
      markersRef.current.set(agent.id, marker);
      agentsRef.current.set(agent.id, agent);
    }
    // Re-apply the highlight after a rebuild.
    const sel = selectedRef.current;
    const m = sel ? markersRef.current.get(sel) : undefined;
    if (m) {
      m.setStyle({ fillColor: SELECTED_FILL, color: "#10201a", weight: 2.5, fillOpacity: 1 });
      m.setRadius(radiusFor(agentsRef.current.get(sel!)!) + 4);
      m.bringToFront();
    }
  }, [agents, colorMode, through]);

  // Selection highlight + pan.
  useEffect(() => {
    const map = mapRef.current;
    const prev = selectedRef.current;
    selectedRef.current = selectedId;

    if (prev && prev !== selectedId) {
      const pm = markersRef.current.get(prev);
      const pa = agentsRef.current.get(prev);
      if (pm && pa) {
        pm.setStyle({
          fillColor: colorFor(pa, modeRef.current.colorMode, modeRef.current.through),
          color: "#ffffff",
          weight: 0.75,
          fillOpacity: 0.78,
        });
        pm.setRadius(radiusFor(pa));
      }
    }
    if (!selectedId) return;
    const marker = markersRef.current.get(selectedId);
    const agent = agentsRef.current.get(selectedId);
    if (!marker || !agent || !map) return;
    marker.setStyle({ fillColor: SELECTED_FILL, color: "#10201a", weight: 2.5, fillOpacity: 1 });
    marker.setRadius(radiusFor(agent) + 4);
    marker.bringToFront();
    if (!map.getBounds().pad(-0.15).contains(marker.getLatLng())) {
      map.panTo(marker.getLatLng(), { animate: true });
    }
  }, [selectedId]);

  return <div ref={hostRef} className="h-full w-full" role="application" aria-label="Agent map" />;
}
