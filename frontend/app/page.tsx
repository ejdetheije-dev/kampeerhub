import MapPanel from "@/components/MapPanel";
import CampingList from "@/components/CampingList";

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-[#0d1117] text-gray-100">
      {/* Header */}
      <header className="flex items-center px-4 h-12 border-b border-gray-800 shrink-0">
        <span className="text-[#ecad0a] font-bold text-lg tracking-wide">kampeerhub</span>
        <span className="ml-3 text-gray-400 text-sm">camping zoeker</span>
        <span className="ml-auto w-2 h-2 rounded-full bg-green-400" title="verbonden" />
      </header>

      {/* Split screen */}
      <div className="flex flex-1 overflow-hidden">
        <MapPanel />
        <CampingList />
      </div>
    </div>
  );
}
