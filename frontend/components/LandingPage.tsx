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

  const inputClass =
    "bg-white/10 border border-white/20 rounded px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#ecad0a] transition-colors";
  const labelClass = "text-xs text-white/60 uppercase tracking-wider";

  const card = (children: React.ReactNode) => (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{
        backgroundImage:
          "url('https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=1920&q=80')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-black/55" />
      <div className="relative z-10 flex flex-col items-center w-full">
        <h1 className="text-4xl font-bold text-[#ecad0a] tracking-widest mb-1">kampeerhub</h1>
        <p className="text-white/50 text-sm tracking-wide mb-8">vind jouw perfecte camping in Europa</p>
        {children}
        <p className="mt-6 text-xs text-white/25 tracking-wide">
          Campingdata via OpenStreetMap · Weer via Open-Meteo
        </p>
      </div>
    </div>
  );

  if (registered) {
    return card(
      <div className="w-full max-w-sm bg-black/40 backdrop-blur-sm border border-white/15 rounded-xl p-8 text-center">
        <p className="text-white text-sm mb-2 font-semibold">Aanmelding ontvangen</p>
        <p className="text-white/50 text-xs">Je account wacht op goedkeuring door de beheerder.</p>
        <button
          className="mt-6 text-xs text-white/30 hover:text-white/60 transition-colors"
          onClick={() => setRegistered(false)}
        >
          Terug naar inloggen
        </button>
      </div>
    );
  }

  return card(
    <div className="w-full max-w-sm bg-black/40 backdrop-blur-sm border border-white/15 rounded-xl overflow-hidden">
      <div className="flex border-b border-white/10">
        <button
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === "login"
              ? "text-[#ecad0a] border-b-2 border-[#ecad0a]"
              : "text-white/40 hover:text-white/70"
          }`}
          onClick={() => { setTab("login"); setError(null); }}
        >
          Inloggen
        </button>
        <button
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === "register"
              ? "text-[#ecad0a] border-b-2 border-[#ecad0a]"
              : "text-white/40 hover:text-white/70"
          }`}
          onClick={() => { setTab("register"); setError(null); }}
        >
          Aanmelden
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
        {tab === "register" && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Naam</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jan de Boer"
              required
              className={inputClass}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>E-mailadres</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="naam@voorbeeld.nl"
            required
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Wachtwoord</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className={inputClass}
          />
        </div>

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 py-2.5 rounded bg-[#753991] hover:bg-[#8a44a8] disabled:opacity-50 text-white text-sm font-semibold tracking-wide transition-colors"
        >
          {pending ? "Bezig..." : tab === "login" ? "Inloggen" : "Account aanmaken"}
        </button>
      </form>
    </div>
  );
}
