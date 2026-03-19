"use client";

import { useEffect, useState } from "react";

interface User {
  id: number;
  email: string;
  name: string;
  approved: number;
  is_admin: number;
  last_login: string | null;
  created_at: string;
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  const isAdmin = typeof window !== "undefined" ? localStorage.getItem("isAdmin") === "true" : false;

  useEffect(() => {
    if (!token || !isAdmin) return;
    fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .catch(() => setError("Kon gebruikers niet laden"));
  }, [token, isAdmin]);

  async function toggleApproved(user: User) {
    const newVal = !user.approved;
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ approved: newVal }),
    });
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, approved: newVal ? 1 : 0 } : u));
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center text-gray-500 text-sm">
        Geen toegang.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <a href="/" className="text-[#ecad0a] font-bold text-lg tracking-wide">kampeerhub</a>
          <span className="text-gray-600">/</span>
          <span className="text-gray-400 text-sm">gebruikersbeheer</span>
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#161b22] text-gray-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Naam</th>
                <th className="px-4 py-3 text-left">E-mail</th>
                <th className="px-4 py-3 text-left">Aangemeld</th>
                <th className="px-4 py-3 text-left">Laatste login</th>
                <th className="px-4 py-3 text-left">Beheerder</th>
                <th className="px-4 py-3 text-center">Toegang</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={`border-t border-gray-800 ${i % 2 === 0 ? "" : "bg-[#0d1117]"}`}>
                  <td className="px-4 py-3">{u.name}</td>
                  <td className="px-4 py-3 text-gray-400">{u.email}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{u.created_at.slice(0, 16)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{u.last_login ? u.last_login.slice(0, 16) : "—"}</td>
                  <td className="px-4 py-3 text-xs">{u.is_admin ? <span className="text-[#ecad0a]">ja</span> : <span className="text-gray-600">nee</span>}</td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={!!u.approved}
                      onChange={() => toggleApproved(u)}
                      disabled={!!u.is_admin}
                      title={u.is_admin ? "Beheerder heeft altijd toegang" : ""}
                      className="accent-[#209dd7] w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-600 text-xs">Geen gebruikers gevonden</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
