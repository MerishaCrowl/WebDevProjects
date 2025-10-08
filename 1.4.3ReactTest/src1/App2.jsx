/*
Daily Progress Tracker — single-file React App (App.jsx)

Drop this into src/App.jsx in a Vite + React project.

Dependencies (install these in your project root):
npm install @supabase/supabase-js recharts

Optional / dev deps used earlier:
npm install -D tailwindcss postcss autoprefixer
(then configure tailwind/postcss as we discussed)

Environment:
Create .env in project root with:
VITE_SUPABASE_URL=[https://your-project-ref.supabase.co](https://your-project-ref.supabase.co)
VITE_SUPABASE_ANON_KEY=your-anon-key

Notes:

* This file is intentionally self-contained for a quick local run.
* Supabase usage is minimal. Make sure you created the DB table schema
  and RLS policies previously provided if you plan to use cloud backups.
* Backups are encrypted client-side with Web Crypto using a user passphrase.
* This component uses Tailwind utility classes for layout; it will render
  fine without Tailwind but looks better with it enabled.
  */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
ResponsiveContainer,
PieChart,
Pie,
Cell,
Tooltip,
BarChart,
Bar,
XAxis,
YAxis,
CartesianGrid,
} from "recharts";

/* ----------------- CONFIG ----------------- */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const STORAGE_KEY = "dpt_v2_local";
const COLORS = ["#4ade80", "#f59e0b", "#f97316", "#ef4444", "#60a5fa"];

/* ----------------- UTIL: E2EE ----------------- */
async function deriveKey(password, salt) {
const enc = new TextEncoder();
const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
return crypto.subtle.deriveKey(
{ name: "PBKDF2", salt: enc.encode(salt), iterations: 200000, hash: "SHA-256" },
keyMaterial,
{ name: "AES-GCM", length: 256 },
false,
["encrypt", "decrypt"]
);
}
async function encryptString(key, plaintext) {
const iv = crypto.getRandomValues(new Uint8Array(12));
const enc = new TextEncoder();
const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
const combined = new Uint8Array(iv.byteLength + ct.byteLength);
combined.set(iv, 0);
combined.set(new Uint8Array(ct), iv.byteLength);
return btoa(String.fromCharCode(...combined));
}
async function decryptString(key, dataB64) {
const raw = Uint8Array.from(atob(dataB64), (c) => c.charCodeAt(0));
const iv = raw.slice(0, 12);
const ct = raw.slice(12);
const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
return new TextDecoder().decode(pt);
}

/* ----------------- CSV helper ----------------- */
function toCSV(entries) {
const header = [
"date",
"plannedTasks",
"completedTasks",
"tasksNotes",
"wins",
"challenges",
"mood",
"minutesFocused",
"tags",
"createdAt",
];
const rows = entries.map((r) => [
r.date,
r.plannedTasks,
r.completedTasks,
`"${(r.tasksNotes || "").replace(/"/g, '""')}"`,
`"${(r.wins || "").replace(/"/g, '""')}"`,
`"${(r.challenges || "").replace(/"/g, '""')}"`,
r.mood,
r.minutesFocused,
`"${(r.tags || []).join(", ")}"`,
r.createdAt,
]);
return [header, ...rows].map((r) => r.join(",")).join("\n");
}

/* ----------------- Main App ----------------- */
export default function App() {
// Core data
const [entries, setEntries] = useState(() => {
try {
return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
} catch {
return [];
}
});
const [form, setForm] = useState(getEmptyForm());
const [query, setQuery] = useState("");
const [filterTag, setFilterTag] = useState("");
const [dateRange, setDateRange] = useState({ from: "", to: "" });

// Mode & Auth
const [mode, setMode] = useState(() => localStorage.getItem("dpt_mode") || "local"); // local | cloud
const [user, setUser] = useState(null);
const [authEmail, setAuthEmail] = useState("");
const [authPassword, setAuthPassword] = useState("");
const [passphrase, setPassphrase] = useState(""); // used for E2EE
const cryptoKeyRef = useRef(null);

// UI / other features
const [view, setView] = useState("dashboard"); // dashboard, habits, pomodoro, settings
const [habits, setHabits] = useState(() => JSON.parse(localStorage.getItem("dpt_habits") || "[]"));
const [pomodoro, setPomodoro] = useState({ running: false, mode: "work", remaining: 25 * 60 });
const pomoRef = useRef(null);

/* Persist locally */
useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)), [entries]);
useEffect(() => localStorage.setItem("dpt_habits", JSON.stringify(habits)), [habits]);
useEffect(() => localStorage.setItem("dpt_mode", mode), [mode]);

/* Supabase auth listener */
useEffect(() => {
if (!supabase) return;
supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
return () => sub.subscription.unsubscribe();
}, []);

/* derive crypto key when passphrase changes */
useEffect(() => {
(async () => {
if (!passphrase) {
cryptoKeyRef.current = null;
return;
}
const salt = user?.id || "public-salt";
try {
cryptoKeyRef.current = await deriveKey(passphrase, salt);
} catch (e) {
console.error("deriveKey failed", e);
cryptoKeyRef.current = null;
}
})();
}, [passphrase, user]);

/* Pomodoro timer */
useEffect(() => {
if (!pomodoro.running) return;
pomoRef.current = setInterval(() => {
setPomodoro((p) => {
if (p.remaining <= 1) {
const nextMode = p.mode === "work" ? "break" : "work";
const nextRemaining = nextMode === "work" ? 25 * 60 : 5 * 60;
if (Notification && Notification.permission === "granted") {
new Notification(nextMode === "work" ? "Work time — focus!" : "Break time — rest!");
}
return { ...p, mode: nextMode, remaining: nextRemaining };
}
return { ...p, remaining: p.remaining - 1 };
});
}, 1000);
return () => clearInterval(pomoRef.current);
}, [pomodoro.running]);

/* CRUD entries */
function addEntry(e) {
e?.preventDefault();
const newEntry = {
id: Date.now().toString(),
date: form.date,
plannedTasks: Number(form.plannedTasks) || 0,
completedTasks: Number(form.completedTasks) || 0,
tasksNotes: form.tasksNotes,
wins: form.wins,
challenges: form.challenges,
mood: Number(form.mood) || 3,
tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
minutesFocused: Number(form.minutesFocused) || 0,
createdAt: new Date().toISOString(),
};
setEntries((s) => [newEntry, ...s]);
setForm(getEmptyForm());
}
function removeEntry(id) {
if (!confirm("Delete this entry?")) return;
setEntries((s) => s.filter((r) => r.id !== id));
}

/* Filters */
const filtered = useMemo(() => {
return entries.filter((e) => {
if (query) {
const q = query.toLowerCase();
if (!(e.tasksNotes || "").toLowerCase().includes(q) && !(e.wins || "").toLowerCase().includes(q) && !(e.challenges || "").toLowerCase().includes(q) && !(e.tags || []).join(", ").toLowerCase().includes(q)) return false;
}
if (filterTag && !(e.tags || []).includes(filterTag)) return false;
if (dateRange.from && new Date(e.date) < new Date(dateRange.from)) return false;
if (dateRange.to && new Date(e.date) > new Date(dateRange.to)) return false;
return true;
});
}, [entries, query, filterTag, dateRange]);

/* Basic analytics */
const analytics = useMemo(() => {
const days = entries.length || 0;
const totalPlanned = entries.reduce((s, r) => s + (r.plannedTasks || 0), 0);
const totalCompleted = entries.reduce((s, r) => s + (r.completedTasks || 0), 0);
const avgTasksPerDay = days ? +(totalCompleted / days).toFixed(2) : 0;
const successRate = totalPlanned ? +((totalCompleted / totalPlanned) * 100).toFixed(1) : null;
const avgMood = days ? +(entries.reduce((s, r) => s + (r.mood || 0), 0) / days).toFixed(2) : null;
const totalFocus = entries.reduce((s, r) => s + (r.minutesFocused || 0), 0);
const tagCounts = {};
entries.forEach((r) => (r.tags || []).forEach((t) => (tagCounts[t] = (tagCounts[t] || 0) + 1)));
const tagData = Object.entries(tagCounts).map(([name, value]) => ({ name, value }));
const trend = [...entries].slice(0, 60).reverse().map((r) => ({ date: r.date, completed: r.completedTasks })).slice(-30);
return { days, totalPlanned, totalCompleted, avgTasksPerDay, successRate, avgMood, totalFocus, tagData, trend };
}, [entries]);

/* Reports */
function generateReport(range = "weekly") {
const now = new Date();
const start = new Date(now);
if (range === "weekly") start.setDate(now.getDate() - 6);
if (range === "monthly") start.setMonth(now.getMonth() - 1);
const selected = entries.filter((e) => new Date(e.date) >= start && new Date(e.date) <= now);
const totalPlanned = selected.reduce((s, r) => s + (r.plannedTasks || 0), 0);
const totalCompleted = selected.reduce((s, r) => s + (r.completedTasks || 0), 0);
const avgMood = selected.length ? (selected.reduce((s, r) => s + (r.mood || 0), 0) / selected.length).toFixed(2) : "—";
const topTags = (() => {
const counts = {};
selected.forEach((r) => (r.tags || []).forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
})();
const successRate = totalPlanned ? ((totalCompleted / totalPlanned) * 100).toFixed(1) + "%" : "—";
const recommendations = [];
if (successRate !== "—") {
const sr = Number(successRate.replace("%", ""));
if (sr < 50) recommendations.push("Reduce planned tasks to 1–3 priorities and try time-blocking.");
else if (sr < 80) recommendations.push("Experiment with removing the top distraction for 7 days.");
else recommendations.push("You're consistent — consider raising one small target.");
}
if (selected.some((s) => (s.minutesFocused || 0) < 20)) recommendations.push("Aim for 1 focused block of 25 minutes (25min Pomodoro).");
return {
title: `${range.charAt(0).toUpperCase() + range.slice(1)} report (${new Date().toLocaleDateString()})`,
range,
totalDays: selected.length,
totalPlanned,
totalCompleted,
avgMood,
topTags,
successRate,
recommendations,
entries: selected,
};
}
function downloadReportCSV(range = "weekly") {
const r = generateReport(range);
const csv = toCSV(r.entries);
const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = `report-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
a.click();
URL.revokeObjectURL(url);
}
function emailReport(range = "weekly") {
const r = generateReport(range);
const subject = encodeURIComponent(r.title);
const bodyParts = [
`Days included: ${r.totalDays}`,
`Planned: ${r.totalPlanned} • Completed: ${r.totalCompleted} • Success rate: ${r.successRate}`,
`Avg mood: ${r.avgMood}`,
`Top tags: ${r.topTags.map((t) => `${t[0]} (${t[1]})`).join(", ")}`,
"",
"Recommendations:",
...r.recommendations.map((x) => `- ${x}`),
"",
"Entries:",
...r.entries.map((e) => `${e.date}: planned ${e.plannedTasks}, done ${e.completedTasks}, mood ${e.mood}, tags: ${(e.tags || []).join(", ")}`),
];
const body = encodeURIComponent(bodyParts.join("\n"));
window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

/* Cloud backup helpers (using Supabase table 'progress_backups' with columns id,user_id,encrypted_payload,updated_at) */
async function uploadBackup() {
if (!supabase) return alert("Supabase not configured (add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).");
if (!user) return alert("Sign in first.");
if (!cryptoKeyRef.current) return alert("Enter a passphrase to derive encryption key.");
try {
const payload = JSON.stringify({ entries, habits, updatedAt: new Date().toISOString() });
const encrypted = await encryptString(cryptoKeyRef.current, payload);
const { error } = await supabase.from("progress_backups").upsert({ id: user.id, user_id: user.id, encrypted_payload: encrypted }, { returning: "minimal" });
if (error) throw error;
alert("Encrypted backup uploaded.");
} catch (e) {
console.error(e);
alert("Upload failed: " + (e.message || e));
}
}
async function downloadBackup() {
if (!supabase) return alert("Supabase not configured.");
if (!user) return alert("Sign in first.");
if (!cryptoKeyRef.current) return alert("Enter passphrase to decrypt backup.");
try {
const { data, error } = await supabase.from("progress_backups").select("encrypted_payload").eq("id", user.id).single();
if (error) throw error;
const decrypted = await decryptString(cryptoKeyRef.current, data.encrypted_payload);
const parsed = JSON.parse(decrypted);
if (parsed.entries) setEntries(parsed.entries);
if (parsed.habits) setHabits(parsed.habits);
alert("Backup restored.");
} catch (e) {
console.error(e);
alert("Restore failed: " + (e.message || e));
}
}

/* Supabase auth helpers */
async function signUp() {
if (!supabase) return alert("Supabase not configured.");
const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
if (error) return alert("Sign up failed: " + error.message);
alert("Check your email to confirm sign-up, then sign in.");
}
async function signIn() {
if (!supabase) return alert("Supabase not configured.");
const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
if (error) return alert("Sign in failed: " + error.message);
setUser(data.user);
}
async function signOut() {
if (!supabase) return;
await supabase.auth.signOut();
setUser(null);
}

/* Habits cloud helpers (minimal: fetch/add/mark) */
async function addHabitCloud(name) {
if (!supabase || !user) return;
const { data, error } = await supabase.from("habits").insert([{ user_id: user.id, name }]);
if (!error && data) {
setHabits((h) => [...h, ...data]);
}
}
async function fetchHabitsCloud() {
if (!supabase || !user) return;
const { data, error } = await supabase.from("habits").select("*").eq("user_id", user.id);
if (!error && data) setHabits(data);
}
async function markHabitCloud(habitId) {
if (!supabase || !user) return;
const { error } = await supabase.from("habits").update({ last_completed: new Date().toISOString() }).eq("id", habitId).eq("user_id", user.id);
if (!error) fetchHabitsCloud();
}

/* UI render */
return ( <div className="min-h-screen bg-gray-50 p-4"> <div className="max-w-6xl mx-auto"> <header className="flex items-center justify-between mb-4"> <div> <h1 className="text-2xl font-bold">Daily Progress Tracker — v2</h1> <p className="text-sm text-gray-600">Local-first. Optional encrypted cloud backup (Supabase).</p> </div>

```
      <nav className="flex gap-2 items-center">
        <button onClick={() => setView("dashboard")} className="px-3 py-1 rounded" aria-pressed={view === "dashboard"}>Dashboard</button>
        <button onClick={() => setView("habits")} className="px-3 py-1 rounded" aria-pressed={view === "habits"}>Habits</button>
        <button onClick={() => setView("pomodoro")} className="px-3 py-1 rounded" aria-pressed={view === "pomodoro"}>Pomodoro</button>
        <button onClick={() => setView("settings")} className="px-3 py-1 rounded" aria-pressed={view === "settings"}>Settings</button>
      </nav>
    </header>

    <main className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <section className="lg:col-span-2">
        {view === "dashboard" && (
          <>
            <form onSubmit={addEntry} className="p-4 bg-white rounded-lg shadow mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs">Date</label>
                  <input required value={form.date} onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))} type="date" className="mt-1 w-full rounded p-2 border" />
                </div>
                <div>
                  <label className="block text-xs">Mood</label>
                  <input value={form.mood} onChange={(e) => setForm((s) => ({ ...s, mood: e.target.value }))} type="number" min={1} max={5} className="mt-1 w-full rounded p-2 border" />
                </div>
                <div>
                  <label className="block text-xs">Planned tasks</label>
                  <input value={form.plannedTasks} onChange={(e) => setForm((s) => ({ ...s, plannedTasks: e.target.value }))} type="number" className="mt-1 w-full rounded p-2 border" />
                </div>
                <div>
                  <label className="block text-xs">Completed tasks</label>
                  <input value={form.completedTasks} onChange={(e) => setForm((s) => ({ ...s, completedTasks: e.target.value }))} type="number" className="mt-1 w-full rounded p-2 border" />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs">Task notes</label>
                  <textarea value={form.tasksNotes} onChange={(e) => setForm((s) => ({ ...s, tasksNotes: e.target.value }))} rows={3} className="mt-1 w-full rounded p-2 border" />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs">Wins</label>
                  <input value={form.wins} onChange={(e) => setForm((s) => ({ ...s, wins: e.target.value }))} className="mt-1 w-full rounded p-2 border" />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs">Challenges</label>
                  <input value={form.challenges} onChange={(e) => setForm((s) => ({ ...s, challenges: e.target.value }))} className="mt-1 w-full rounded p-2 border" />
                </div>

                <div>
                  <label className="block text-xs">Minutes focused</label>
                  <input value={form.minutesFocused} onChange={(e) => setForm((s) => ({ ...s, minutesFocused: e.target.value }))} type="number" className="mt-1 w-full rounded p-2 border" />
                </div>

                <div>
                  <label className="block text-xs">Tags</label>
                  <input value={form.tags} onChange={(e) => setForm((s) => ({ ...s, tags: e.target.value }))} placeholder="coding, health" className="mt-1 w-full rounded p-2 border" />
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <button className="px-4 py-2 rounded bg-blue-600 text-white">Save entry</button>
                <button type="button" onClick={() => setForm(getEmptyForm())} className="px-3 py-1 rounded bg-gray-200">Reset</button>
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={() => { const csv = toCSV(entries); const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `all-entries-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url); }} className="px-3 py-1 rounded bg-green-500 text-white">Export CSV</button>
                </div>
              </div>
            </form>

            <div className="p-4 bg-white rounded-lg shadow mb-4">
              <div className="flex gap-2 mb-3">
                <input placeholder="search notes/wins/challenges/tags" value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 p-2 border rounded" />
                <input type="date" value={dateRange.from} onChange={(e) => setDateRange((s) => ({ ...s, from: e.target.value }))} className="p-2 border rounded" />
                <input type="date" value={dateRange.to} onChange={(e) => setDateRange((s) => ({ ...s, to: e.target.value }))} className="p-2 border rounded" />
                <input placeholder="filter tag" value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="p-2 border rounded" />
                <button onClick={() => { setQuery(""); setFilterTag(""); setDateRange({ from: "", to: "" }); }} className="px-3 py-1 rounded bg-gray-200">Clear</button>
              </div>

              {filtered.length === 0 ? <p className="text-sm text-gray-500">No entries.</p> : (
                <div className="space-y-2">
                  {filtered.map((r) => (
                    <article key={r.id} className="p-3 border rounded">
                      <div className="text-sm text-gray-500">{r.date} • mood {r.mood} • {r.minutesFocused}m</div>
                      <div className="font-medium">Planned: {r.plannedTasks} • Completed: {r.completedTasks}</div>
                      <div className="mt-1 text-sm text-gray-700">{r.tasksNotes}</div>
                      <div className="mt-2 text-xs text-green-700">Wins: {r.wins}</div>
                      <div className="mt-1 text-xs text-red-600">Challenges: {r.challenges}</div>
                      <div className="mt-2 text-xs text-gray-600">Tags: {(r.tags || []).join(", ")}</div>
                      <div className="mt-2 flex gap-2"><button onClick={() => removeEntry(r.id)} className="px-2 py-1 border rounded">Delete</button></div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 bg-white rounded-lg shadow">
              <h3 className="font-semibold">Quick analytics</h3>
              <div className="grid grid-cols-2 gap-2 mt-2 text-sm text-gray-600">
                <div>Days logged: <strong>{analytics.days}</strong></div>
                <div>Completed total: <strong>{analytics.totalCompleted}</strong></div>
                <div>Avg completed/day: <strong>{analytics.avgTasksPerDay}</strong></div>
                <div>Avg mood: <strong>{analytics.avgMood ?? "—"}</strong></div>
                <div>Total focused minutes: <strong>{analytics.totalFocus}</strong></div>
                <div>Success rate: <strong>{analytics.successRate === null ? "—" : analytics.successRate + "%"}</strong></div>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => { const r = generateReport("weekly"); alert(r.title + "\n" + r.recommendations.join("\n")); }} className="px-3 py-1 rounded bg-indigo-100">Quick weekly report</button>
                <button onClick={() => downloadReportCSV("weekly")} className="px-3 py-1 rounded bg-gray-200">Download weekly CSV</button>
                <button onClick={() => emailReport("weekly")} className="px-3 py-1 rounded bg-gray-200">Email weekly report</button>
              </div>
            </div>
          </>
        )}

        {view === "habits" && (
          <div className="p-4 bg-white rounded-lg shadow">
            <h3 className="font-semibold">Habits</h3>
            <HabitUI
              habits={habits}
              onAdd={(name) => {
                if (mode === "cloud" && supabase && user) addHabitCloud(name);
                else setHabits((h) => [...h, { id: Date.now().toString(), name, streak: 0, history: [] }]);
              }}
              onRefresh={() => { if (mode === "cloud" && user) fetchHabitsCloud(); }}
              onMark={(id) => { if (mode === "cloud" && user) markHabitCloud(id); else markHabitLocal(id, setHabits); }}
            />
          </div>
        )}

        {view === "pomodoro" && (
          <div className="p-4 bg-white rounded-lg shadow">
            <h3 className="font-semibold">Pomodoro</h3>
            <div className="mt-2 text-sm">Mode: {pomodoro.mode} • {Math.floor(pomodoro.remaining / 60)}:{String(pomodoro.remaining % 60).padStart(2, "0")}</div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => { setPomodoro({ running: true, mode: "work", remaining: 25 * 60 }); if (Notification && Notification.permission !== "granted") Notification.requestPermission(); }} className="px-3 py-1 rounded bg-blue-600 text-white">Start</button>
              <button onClick={() => setPomodoro({ running: false, mode: "work", remaining: 25 * 60 })} className="px-3 py-1 rounded bg-gray-200">Stop</button>
            </div>
            <div className="mt-2 text-xs text-gray-600">Tip: mark a quick entry after each Pomodoro to track focused minutes.</div>
          </div>
        )}
      </section>

      <aside className="lg:col-span-1">
        <div className="p-4 bg-white rounded-lg shadow mb-4">
          <h4 className="font-semibold">Cloud / Backup</h4>
          <div className="mt-2 text-sm text-gray-700">
            <div className="mb-2">Mode:
              <select value={mode} onChange={(e) => setMode(e.target.value)} className="ml-2 p-1 border rounded">
                <option value="local">Local only</option>
                <option value="cloud">Cloud (encrypted)</option>
              </select>
            </div>

            <div className="mb-2">
              {supabase ? (user ? <div>Signed in as {user.email} <button onClick={() => signOut()} className="ml-2 px-2 py-1 border rounded">Sign out</button></div> : (
                <div>
                  <label className="block text-xs">Email</label>
                  <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className="w-full p-2 border rounded" />
                  <label className="block text-xs mt-2">Password</label>
                  <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="w-full p-2 border rounded" />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => signIn()} className="px-2 py-1 rounded bg-blue-600 text-white">Sign in</button>
                    <button onClick={() => signUp()} className="px-2 py-1 rounded bg-gray-200">Sign up</button>
                  </div>
                </div>
              )) : <div className="text-sm text-gray-500">Supabase not configured. Add keys in .env to enable cloud features.</div>}
            </div>

            <div className="mb-2">
              <label className="block text-xs">Backup passphrase</label>
              <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} className="w-full p-2 border rounded" placeholder="Used to encrypt backups (keep safe)" />
            </div>

            <div className="flex gap-2">
              <button onClick={() => uploadBackup()} className="px-3 py-1 rounded bg-green-600 text-white">Upload Encrypted Backup</button>
              <button onClick={() => downloadBackup()} className="px-3 py-1 rounded bg-blue-200">Restore Encrypted Backup</button>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white rounded-lg shadow mb-4">
          <h4 className="font-semibold">Reports & Export</h4>
          <div className="mt-2 flex flex-col gap-2">
            <button onClick={() => { const r = generateReport("weekly"); alert(r.title + "\n" + r.recommendations.join("\n")); }} className="px-3 py-1 rounded bg-indigo-100">Generate weekly summary</button>
            <button onClick={() => downloadReportCSV("weekly")} className="px-3 py-1 rounded bg-gray-200">Download weekly CSV</button>
            <button onClick={() => emailReport("weekly")} className="px-3 py-1 rounded bg-gray-200">Email weekly report</button>
            <div className="border-t pt-2 mt-2 text-xs text-gray-600">Monthly:</div>
            <button onClick={() => { const r = generateReport("monthly"); alert(r.title + "\n" + r.recommendations.join("\n")); }} className="px-3 py-1 rounded bg-indigo-100">Generate monthly summary</button>
            <button onClick={() => downloadReportCSV("monthly")} className="px-3 py-1 rounded bg-gray-200">Download monthly CSV</button>
            <button onClick={() => emailReport("monthly")} className="px-3 py-1 rounded bg-gray-200">Email monthly report</button>
          </div>
        </div>

        <div className="p-4 bg-white rounded-lg shadow">
          <h4 className="font-semibold">Integrations</h4>
          <div className="mt-2 text-sm text-gray-600">Smartwatch / Health integrations planned: Apple Health / Google Fit requires OAuth & server-side tokens. I can scaffold this next if desired.</div>
        </div>
      </aside>
    </main>

    <footer className="mt-6 text-sm text-center text-gray-500">Local-first. Cloud optional. Exports are CSV & email drafts. Backups are client-side encrypted.</footer>
  </div>
</div>
```

);
}

/* ----------------- Small components & helpers ----------------- */

function HabitUI({ habits, onAdd, onRefresh, onMark }) {
const [name, setName] = useState("");
return ( <div> <div className="flex gap-2">
<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Habit name" className="flex-1 p-2 border rounded" />
<button onClick={() => { if (name.trim()) { onAdd(name.trim()); setName(""); } }} className="px-3 py-1 bg-blue-600 text-white rounded">Add</button> </div> <div className="mt-2"> <button onClick={onRefresh} className="px-3 py-1 bg-gray-700 text-white rounded">Refresh Habits</button> </div> <ul className="mt-3 space-y-2">
{habits.length === 0 ? <li className="text-sm text-gray-500">No habits yet.</li> : habits.map((h) => ( <li key={h.id} className="flex justify-between items-center p-2 border rounded"> <div> <div className="font-medium">{h.name}</div> <div className="text-xs text-gray-600">Streak: {h.streak ?? 0} {h.last_completed ? `• last: ${new Date(h.last_completed).toLocaleDateString()}` : ""}</div> </div> <div>
<button onClick={() => onMark(h.id)} className="px-2 py-1 bg-green-600 text-white rounded">Mark Done</button> </div> </li>
))} </ul> </div>
);
}

function markHabitLocal(habitId, setHabits) {
setHabits((h) =>
h.map((hb) => {
if (hb.id !== habitId) return hb;
const date = new Date().toISOString().slice(0, 10);
if ((hb.history || []).includes(date)) return hb;
const history = [...(hb.history || []), date];
const streak = calculateStreak(history);
return { ...hb, history, streak, last_completed: date };
})
);
}
function calculateStreak(history) {
const days = new Set(history);
let streak = 0;
let cursor = new Date();
while (days.has(cursor.toISOString().slice(0, 10))) {
streak++;
cursor.setDate(cursor.getDate() - 1);
}
return streak;
}
function getEmptyForm() {
const today = new Date().toISOString().slice(0, 10);
return { date: today, plannedTasks: "", completedTasks: "", tasksNotes: "", wins: "", challenges: "", mood: 3, tags: "", minutesFocused: "" };
}
