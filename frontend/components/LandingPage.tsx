"use client";

import { useState } from "react";

interface LandingPageProps {
  onEnter: () => void;
}

export default function LandingPage({ onEnter }: LandingPageProps) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onEnter();
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center px-4">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold text-[#ecad0a] tracking-widest mb-2">kampeerhub</h1>
        <p className="text-gray-400 text-sm tracking-wide">vind jouw perfecte camping in Europa</p>
      </div>

      <div className="w-full max-w-sm bg-[#161b22] border border-gray-800 rounded-lg overflow-hidden shadow-2xl">
        <div className="flex border-b border-gray-800">
          <button
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === "login"
                ? "text-[#ecad0a] border-b-2 border-[#ecad0a] bg-[#0d1117]"
                : "text-gray-500 hover:text-gray-300"
            }`}
            onClick={() => setTab("login")}
          >
            Inloggen
          </button>
          <button
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === "register"
                ? "text-[#ecad0a] border-b-2 border-[#ecad0a] bg-[#0d1117]"
                : "text-gray-500 hover:text-gray-300"
            }`}
            onClick={() => setTab("register")}
          >
            Aanmelden
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {tab === "register" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400 uppercase tracking-wider">Naam</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jan de Boer"
                className="bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#209dd7] transition-colors"
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 uppercase tracking-wider">E-mailadres</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="naam@voorbeeld.nl"
              className="bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#209dd7] transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 uppercase tracking-wider">Wachtwoord</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#209dd7] transition-colors"
            />
          </div>

          <button
            type="submit"
            className="mt-2 py-2.5 rounded bg-[#753991] hover:bg-[#8a44a8] text-white text-sm font-semibold tracking-wide transition-colors"
          >
            {tab === "login" ? "Inloggen" : "Account aanmaken"}
          </button>

          <button
            type="button"
            onClick={onEnter}
            className="text-xs text-gray-600 hover:text-gray-400 text-center transition-colors"
          >
            Doorgaan zonder account
          </button>
        </form>
      </div>

      <p className="mt-8 text-xs text-gray-700">
        Campingdata via OpenStreetMap · Weer via Open-Meteo
      </p>
    </div>
  );
}
