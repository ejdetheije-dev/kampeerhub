"use client";

const PLACEHOLDER_CAMPINGS = [
  { id: 1, name: "Camping Le Vieux Bourg", tags: ["honden", "wifi", "zwembad"], distance: "2.3 km van zee", price: "~€25/nacht" },
  { id: 2, name: "Camping de la Plage", tags: ["wifi", "stroom"], distance: "0.5 km van zee", price: "~€35/nacht" },
  { id: 3, name: "Domaine de Keravel", tags: ["honden", "stroom"], distance: "4.1 km van zee", price: "~€20/nacht" },
];

export default function CampingList() {
  return (
    <div className="w-96 flex flex-col border-l border-gray-800 overflow-hidden shrink-0">
      <div className="px-4 py-3 border-b border-gray-800">
        <span className="text-sm text-gray-400">
          <span className="text-[#209dd7] font-semibold">{PLACEHOLDER_CAMPINGS.length}</span> campings gevonden
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {PLACEHOLDER_CAMPINGS.map((c) => (
          <div
            key={c.id}
            className="px-4 py-3 border-b border-gray-800 hover:bg-gray-800/40 cursor-pointer transition-colors"
          >
            <div className="font-medium text-sm text-gray-100 mb-1">{c.name}</div>
            <div className="flex flex-wrap gap-1 mb-2">
              {c.tags.map((tag) => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                  {tag}
                </span>
              ))}
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{c.distance}</span>
              <span className="text-[#ecad0a]">{c.price}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
