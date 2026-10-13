"use client";

import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { Agent, Market } from "@/lib/types";
import "leaflet/dist/leaflet.css";

function MapSync({
  market,
  selectedId,
  agents,
}: {
  market: Market;
  selectedId: string | null;
  agents: Agent[];
}) {
  const map = useMap();

  useEffect(() => {
    map.setView(market.center, market.id === "tampa-33647" ? 12 : 11);
  }, [map, market]);

  useEffect(() => {
    if (!selectedId) return;
    const agent = agents.find((a) => a.id === selectedId);
    if (!agent) return;
    map.panTo([agent.lat, agent.lng], { animate: true });
  }, [agents, map, selectedId]);

  return null;
}

export default function AgentMap({
  agents,
  market,
  selectedId,
  onSelect,
}: {
  agents: Agent[];
  market: Market;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const visible = agents.slice(0, 800);

  return (
    <MapContainer
      center={market.center}
      zoom={market.id === "tampa-33647" ? 12 : 11}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapSync market={market} selectedId={selectedId} agents={agents} />
      {visible.map((agent) => {
        const selected = agent.id === selectedId;
        return (
          <CircleMarker
            key={agent.id}
            center={[agent.lat, agent.lng]}
            radius={selected ? 10 : 6}
            pathOptions={{
              color: selected ? "#0B3D2E" : "#1B6B5A",
              fillColor: selected ? "#F4B942" : "#2A9D8F",
              fillOpacity: selected ? 0.95 : 0.7,
              weight: selected ? 2 : 1,
            }}
            eventHandlers={{
              click: () => onSelect(agent.id),
            }}
          >
            <Popup>
              <div className="min-w-[180px] text-sm">
                <p className="font-semibold text-slate-900">{agent.name}</p>
                <p className="text-slate-600">{agent.total} total txns</p>
                <p className="text-slate-500">
                  Sell {agent.sellSide} · Buy {agent.buySide}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
