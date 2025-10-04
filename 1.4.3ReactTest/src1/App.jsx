import React, { useState, useEffect, useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

// Single-file React component for a Daily Progress Tracker
// Usage: place this file as src/App.jsx in a Vite/CRA React project.
// Dependencies: recharts (npm i recharts). Tailwind CSS classes used for styling.

const STORAGE_KEY = "daily-progress-tracker-v1";
const COLORS = ["#4ade80", "#f59e0b", "#f97316", "#ef4444", "#60a5fa"];

export default function App() {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(getEmptyForm());
  const [query, setQuery] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setEntries(JSON.parse(raw));
      } catch (e) {
        console.error("failed to parse stored entries", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

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
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      minutesFocused: Number(form.minutesFocused) || 0,
      createdAt: new Date().toISOString(),
    };

    setEntries((s) => [newEntry, ...s]);
    setForm(getEmptyForm());
  }

  function removeEntry(id) {
    if (!confirm("Delete this entry?")) return;
    setEntries((s) => s.filter((e) => e.id !== id));
  }

  function exportCSV() {
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
      `"${(r.tasksNotes || "").replace(/\"/g, '""')}"`,
      `"${(r.wins || "").replace(/\"/g, '""')}"`,
      `"${(r.challenges || "").replace(/\"/g, '""')}"`,
      r.mood,
      r.minutesFocused,
      `"${(r.tags || []).join(", ")}"`,
      r.createdAt,
    ]);

    const csv = [header, ...rows]
      .map((r) => r.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `progress-export-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (query) {
        const lower = query.toLowerCase();
        if (
          !(e.tasksNotes || "").toLowerCase().includes(lower) &&
          !(e.wins || "").toLowerCase().includes(lower) &&
          !(e.challenges || "").toLowerCase().includes(lower) &&
          !(e.tags || []).join(", ").toLowerCase().includes(lower)
        )
          return false;
      }
      if (filterTag) {
        if (!(e.tags || []).includes(filterTag)) return false;
      }
      if (dateRange.from) {
        if (new Date(e.date) < new Date(dateRange.from)) return false;
      }
      if (dateRange.to) {
        if (new Date(e.date) > new Date(dateRange.to)) return false;
      }
      return true;
    });
  }, [entries, query, filterTag, dateRange]);

  const analytics = useMemo(() => {
    const days = entries.length || 0;
    const totalPlanned = entries.reduce((s, r) => s + (r.plannedTasks || 0), 0);
    const totalCompleted = entries.reduce((s, r) => s + (r.completedTasks || 0), 0);
    const avgTasksPerDay = days ? +(totalCompleted / days).toFixed(2) : 0;
    const successRate = totalPlanned ? +((totalCompleted / totalPlanned) * 100).toFixed(1) : null;
    const avgMood = days ? +(entries.reduce((s, r) => s + (r.mood || 0), 0) / days).toFixed(2) : null;
    const totalFocus = entries.reduce((s, r) => s + (r.minutesFocused || 0), 0);

    // tag frequency
    const tagCounts = {};
    entries.forEach((r) => (r.tags || []).forEach((t) => (tagCounts[t] = (tagCounts[t] || 0) + 1)));
    const tagData = Object.entries(tagCounts).map(([name, value]) => ({ name, value }));

    // tasks trend (last 14 days)
    const trend = [...entries]
      .slice(0, 30)
      .reverse()
      .map((r) => ({ date: r.date, completed: r.completedTasks }))
      .slice(-30);

    return { days, totalPlanned, totalCompleted, avgTasksPerDay, successRate, avgMood, totalFocus, tagData, trend };
  }, [entries]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold">Daily Progress Tracker</h1>
          <p className="text-sm text-gray-600">Log what you planned, what you completed, wins, challenges and get instant analysis.</p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="col-span-1 lg:col-span-2">
            <form onSubmit={addEntry} className="p-4 bg-white rounded-2xl shadow">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700">Date</label>
                  <input
                    required
                    value={form.date}
                    onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))}
                    type="date"
                    className="mt-1 w-full rounded p-2 border"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700">Mood (1-5)</label>
                  <input
                    value={form.mood}
                    onChange={(e) => setForm((s) => ({ ...s, mood: e.target.value }))}
                    min={1}
                    max={5}
                    type="number"
                    className="mt-1 w-full rounded p-2 border"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700">Planned tasks</label>
                  <input
                    value={form.plannedTasks}
                    onChange={(e) => setForm((s) => ({ ...s, plannedTasks: e.target.value }))}
                    type="number"
                    className="mt-1 w-full rounded p-2 border"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700">Completed tasks</label>
                  <input
                    value={form.completedTasks}
                    onChange={(e) => setForm((s) => ({ ...s, completedTasks: e.target.value }))}
                    type="number"
                    className="mt-1 w-full rounded p-2 border"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700">Task notes (what you did)</label>
                  <textarea
                    value={form.tasksNotes}
                    onChange={(e) => setForm((s) => ({ ...s, tasksNotes: e.target.value }))}
                    rows={3}
                    className="mt-1 w-full rounded p-2 border"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700">Wins</label>
                  <input
                    value={form.wins}
                    onChange={(e) => setForm((s) => ({ ...s, wins: e.target.value }))}
                    placeholder="Small wins you want to remember"
                    className="mt-1 w-full rounded p-2 border"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700">Challenges</label>
                  <input
                    value={form.challenges}
                    onChange={(e) => setForm((s) => ({ ...s, challenges: e.target.value }))}
                    placeholder="What got in the way"
                    className="mt-1 w-full rounded p-2 border"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700">Minutes focused</label>
                  <input
                    value={form.minutesFocused}
                    onChange={(e) => setForm((s) => ({ ...s, minutesFocused: e.target.value }))}
                    type="number"
                    className="mt-1 w-full rounded p-2 border"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700">Tags (comma separated)</label>
                  <input
                    value={form.tags}
                    onChange={(e) => setForm((s) => ({ ...s, tags: e.target.value }))}
                    placeholder="e.g. coding, chores, health"
                    className="mt-1 w-full rounded p-2 border"
                  />
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button className="px-4 py-2 rounded bg-blue-600 text-white">Save entry</button>
                <button
                  type="button"
                  onClick={() => setForm(getEmptyForm())}
                  className="px-4 py-2 rounded bg-gray-200"
                >
                  Reset
                </button>
                <button type="button" onClick={exportCSV} className="ml-auto px-4 py-2 rounded bg-green-500 text-white">
                  Export CSV
                </button>
              </div>
            </form>

            <div className="mt-6 p-4 bg-white rounded-2xl shadow">
              <h2 className="font-semibold mb-2">Journal entries</h2>

              <div className="flex gap-2 mb-3">
                <input
                  placeholder="search notes, wins, challenges or tags"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 p-2 border rounded"
                />
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange((s) => ({ ...s, from: e.target.value }))}
                  className="p-2 border rounded"
                />
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange((s) => ({ ...s, to: e.target.value }))}
                  className="p-2 border rounded"
                />
                <input
                  placeholder="filter tag"
                  value={filterTag}
                  onChange={(e) => setFilterTag(e.target.value)}
                  className="p-2 border rounded"
                />
                <button onClick={() => { setQuery(""); setFilterTag(""); setDateRange({ from: "", to: "" }); }} className="px-3 py-2 rounded bg-gray-200">Clear</button>
              </div>

              {filtered.length === 0 ? (
                <p className="text-sm text-gray-500">No entries match the filters.</p>
              ) : (
                <div className="space-y-3">
                  {filtered.map((r) => (
                    <article key={r.id} className="p-3 border rounded flex flex-col md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-sm text-gray-500">{r.date} • mood {r.mood} • {r.minutesFocused}m focus</div>
                        <div className="font-medium">Planned: {r.plannedTasks} • Completed: {r.completedTasks}</div>
                        <div className="mt-1 text-sm text-gray-700">{r.tasksNotes}</div>
                        <div className="mt-2 text-xs text-green-700">Wins: {r.wins}</div>
                        <div className="mt-1 text-xs text-red-600">Challenges: {r.challenges}</div>
                        <div className="mt-2 text-xs text-gray-600">Tags: {(r.tags || []).join(", ")}</div>
                      </div>

                      <div className="mt-3 md:mt-0 md:ml-4 flex gap-2">
                        <button onClick={() => removeEntry(r.id)} className="px-3 py-1 border rounded">Delete</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          <aside className="col-span-1">
            <div className="p-4 bg-white rounded-2xl shadow mb-4">
              <h3 className="font-semibold">Quick analytics</h3>
              <div className="mt-2 text-sm text-gray-600">
                <div>Days logged: <strong>{analytics.days}</strong></div>
                <div>Completed tasks total: <strong>{analytics.totalCompleted}</strong></div>
                <div>Avg completed / day: <strong>{analytics.avgTasksPerDay}</strong></div>
                <div>Avg mood: <strong>{analytics.avgMood ?? "—"}</strong></div>
                <div>Total focused minutes: <strong>{analytics.totalFocus}</strong></div>
                <div>Success rate: <strong>{analytics.successRate === null ? "—" : analytics.successRate + "%"}</strong></div>
              </div>

              <div className="mt-3">
                {analytics.successRate !== null && analytics.successRate < 50 && (
                  <div className="p-2 rounded bg-yellow-50 text-yellow-800 text-xs">Your success rate is below 50%. Suggestion: reduce planned tasks, prioritize the top 1–3, and track distractions.</div>
                )}

                {analytics.successRate !== null && analytics.successRate >= 50 && analytics.successRate < 80 && (
                  <div className="p-2 rounded bg-blue-50 text-blue-800 text-xs">You're doing fairly well. Suggestion: identify repeated challenges and convert one into an experiment to improve.</div>
                )}

                {analytics.successRate !== null && analytics.successRate >= 80 && (
                  <div className="p-2 rounded bg-green-50 text-green-800 text-xs">Great consistency — try stretching targets slightly or adding a challenge task.</div>
                )}
              </div>
            </div>

            <div className="p-4 bg-white rounded-2xl shadow mb-4">
              <h3 className="font-semibold">Tags</h3>
              <div className="mt-2">
                {analytics.tagData.length === 0 ? (
                  <div className="text-sm text-gray-500">No tags yet.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {analytics.tagData.map((t) => (
                      <button key={t.name} onClick={() => setFilterTag(t.name)} className="text-left p-2 border rounded text-sm">{t.name} • {t.value}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-white rounded-2xl shadow">
              <h3 className="font-semibold">Charts</h3>
              <div style={{ width: "100%", height: 200 }} className="mt-2">
                {analytics.tagData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={analytics.tagData} dataKey="value" nameKey="name" outerRadius={65} fill="#8884d8">
                        {analytics.tagData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-sm text-gray-500">Add entries with tags to see tag distribution.</div>
                )}
              </div>

              <div style={{ width: "100%", height: 160 }} className="mt-4">
                {analytics.trend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={analytics.trend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="completed" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-sm text-gray-500">Complete entries to populate trends.</div>
                )}
              </div>
            </div>

            <div className="mt-4 text-xs text-gray-600">
              <div className="mb-2">Quick improvement ideas (auto-generated):</div>
              <ul className="list-disc pl-4 space-y-1">
                <li>Focus on 1–3 priority tasks per day.</li>
                <li>Record minutes focused — aim for small, consistent blocks (25min).</li>
                <li>Turn a frequent challenge into an experiment with a single change for a week.</li>
                <li>Celebrate wins — review weekly and copy what worked.</li>
              </ul>
            </div>

          </aside>
        </main>

        <footer className="mt-8 text-sm text-gray-500 text-center">Data is stored locally in your browser's localStorage. Export CSV to keep backups.</footer>
      </div>
    </div>
  );
}

function getEmptyForm() {
  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10);
  return {
    date: isoDate,
    plannedTasks: "",
    completedTasks: "",
    tasksNotes: "",
    wins: "",
    challenges: "",
    mood: 3,
    tags: "",
    minutesFocused: "",
  };
}
