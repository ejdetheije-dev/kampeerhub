"use client";

import { useState } from "react";

interface LandingPageProps {
  onEnter: (token: string, isAdmin: boolean, name: string) => void;
}

export default function LandingPage({ onEnter }: LandingPageProps) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (tab === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.detail ?? "Registratie mislukt");
          return;
        }
        if (data.status === "approved") {
          // First user (admin) — log in immediately
          await doLogin();
        } else {
          setRegistered(true);
        }
      } else {
        await doLogin();
      }
    } finally {
      setPending(false);
    }
  }

  async function doLogin() {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail ?? "Inloggen mislukt");
      return;
    }
    onEnter(data.token, data.is_admin, data.name);
  }

  if (registered) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center px-4">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold text-[#ecad0a] tracking-widest mb-2">kampeerhub</h1>
        </div>
        <div className="w-full max-w-sm bg-[#161b22] border border-gray-800 rounded-lg p-8 text-center shadow-2xl">
          <p className="text-gray-300 text-sm mb-2">Aanmelding ontvangen.</p>
          <p className="text-gray-500 text-xs">Je account wacht op goedkeuring door de beheerder.</p>
          <button
            className="mt-6 text-xs text-gray-600 hover:text-gray-400 transition-colors"
            onClick={() => setRegistered(false)}
          >
            Terug naar inloggen
          </button>
        </div>
      </div>
    );
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
            onClick={() => { setTab("login"); setError(null); }}
          >
            Inloggen
          </button>
          <button
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === "register"
                ? "text-[#ecad0a] border-b-2 border-[#ecad0a] bg-[#0d1117]"
                : "text-gray-500 hover:text-gray-300"
            }`}
            onClick={() => { setTab("register"); setError(null); }}
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
                required
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
              required
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
              required
              className="bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#209dd7] transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 py-2.5 rounded bg-[#753991] hover:bg-[#8a44a8] disabled:opacity-50 text-white text-sm font-semibold tracking-wide transition-colors"
          >
            {pending ? "Bezig..." : tab === "login" ? "Inloggen" : "Account aanmaken"}
          </button>
        </form>
      </div>

      <p className="mt-8 text-xs text-gray-700">
        Campingdata via OpenStreetMap · Weer via Open-Meteo
      </p>
    </div>
  );
}
