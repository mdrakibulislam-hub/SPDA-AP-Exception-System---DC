import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { localDate, monthAt, roles, statusOf } from "./model";
import { useWorkspace } from "./workspace";
import "./dashboard.css";

type Point = { label: string; count: number };

function TrendChart({ points }: { points: Point[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1076);
  const gradient = useId().replace(/:/g, "");
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const high = Math.max(3, ...points.map(point => point.count));
  const left = 24, right = Math.max(60, width - 8), top = 20, bottom = 204;
  const coords = points.map((p, i) => ({ x: points.length === 1 ? (left + right) / 2 : left + i * (right - left) / (points.length - 1), y: bottom - p.count * (bottom - top) / high }));
  const deltas = coords.slice(1).map((p, i) => (p.y - coords[i].y) / (p.x - coords[i].x));
  const tangents = coords.map((_, i) => i === 0 ? deltas[0] ?? 0 : i === coords.length - 1 ? deltas[i - 1] ?? 0
    : deltas[i - 1] * deltas[i] <= 0 ? 0 : 2 / (1 / deltas[i - 1] + 1 / deltas[i]));
  let path = coords.length ? "M " + coords[0].x + " " + coords[0].y : "";
  coords.slice(1).forEach((p, index) => {
    const previous = coords[index], dx = (p.x - previous.x) / 3;
    path += " C " + (previous.x + dx) + " " + (previous.y + dx * tangents[index]) + " " + (p.x - dx) + " " + (p.y - dx * tangents[index + 1]) + " " + p.x + " " + p.y;
  });
  const last = coords[coords.length - 1];
  const area = last ? path + " L " + last.x + " " + bottom + " L " + coords[0].x + " " + bottom + " Z" : "";
  const ticks = Array.from({ length: Math.min(high, 6) + 1 }, (_, i) => high * i / Math.min(high, 6));
  return <div ref={ref} className="spda-chart-frame">
    <svg width={width} height="240" viewBox={"0 0 " + width + " 240"} role="img" aria-label={"Issues opened over time. " + points.map(p => p.label + ": " + p.count).join(", ")}>
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#116956" stopOpacity=".18" /><stop offset="100%" stopColor="#116956" stopOpacity=".025" /></linearGradient></defs>
      {ticks.map(value => { const y = bottom - value * (bottom - top) / high; return <g key={value}><line x1={left} x2={right} y1={y} y2={y} stroke="#d5e3df" strokeWidth="1" /><text x="15" y={y + 4} textAnchor="end">{Number.isInteger(value) ? value : value.toFixed(1)}</text></g>; })}
      <path d={area} fill={"url(#" + gradient + ")"} />
      <path d={path} fill="none" stroke="#116956" strokeWidth="1.6" />
      {coords.map((p, i) => <g key={points[i].label}><circle cx={p.x} cy={p.y} r="3.5" fill="#116956"><title>{points[i].label + ": " + points[i].count + " opened"}</title></circle>{(width > 500 || i % 2 === 0 || i === coords.length - 1) && <text x={p.x} y="229" textAnchor={coords.length > 1 && i === coords.length - 1 ? "end" : "middle"}>{points[i].label}</text>}</g>)}
    </svg>
  </div>;
}

function Metrics({ items }: { items: [string, number | string][] }) {
  return <dl className="spda-dashboard-metrics">{items.map(([label, value]) => <div key={label}>
    <dt>{label}</dt><dd>{typeof value === "number" ? String(value).padStart(value ? 2 : 1, "0") : value}</dd>
  </div>)}</dl>;
}

export function DashboardScreen() {
  const { role, visible } = useWorkspace();
  const [now] = useState(() => new Date());
  const [period, setPeriod] = useState("6");
  const [range, setRange] = useState({ from: localDate(monthAt(now, -5)), to: localDate(now) });
  const [error, setError] = useState("");
  const start = period === "custom" ? new Date(range.from + "T00:00:00") : monthAt(now, 1 - Number(period));
  const end = new Date((period === "custom" ? range.to : localDate(now)) + "T23:59:59.999");
  const inRange = visible.filter(invoice => { const opened = new Date(invoice.opened); return opened >= start && opened <= end; });
  const points: Point[] = [];
  const monthName = new Intl.DateTimeFormat(undefined, { month: "short" });
  for (let bucket = monthAt(start, 0); bucket <= end; bucket = monthAt(bucket, 1)) {
    const next = monthAt(bucket, 1);
    points.push({ label: monthName.format(bucket), count: inRange.filter(invoice => new Date(invoice.opened) >= bucket && new Date(invoice.opened) < next).length });
  }
  const outcomes = inRange.filter(invoice => invoice.outcome);
  const meanDays = outcomes.length ? (outcomes.reduce((sum, invoice) => sum + (Date.parse(invoice.outcome!.when) - Date.parse(invoice.opened)) / 86400000, 0) / outcomes.length).toFixed(1) : null;
  function changeDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const from = String(data.get("from")), to = String(data.get("to"));
    if (from > to) { setError("Choose an end date on or after the start date."); return; }
    setError(""); setRange({ from, to });
  }
  return <div className="spda-dashboard">
    <h1 className="sr-only">{roles[role]} dashboard</h1>
    <div className="spda-dashboard-period"><label>Time period<span className="spda-period-select"><select aria-label="Time period" value={period} onChange={event => { setError(""); setPeriod(event.target.value); }}><option value="1">This month</option><option value="3">Last 3 months</option><option value="6">Last 6 months</option><option value="custom">Custom dates</option></select><img src="/design/dashboard-arrow-down01.svg" width="16" height="16" alt="" /></span></label></div>
    {period === "custom" && <form className="spda-dashboard-date-range" onSubmit={changeDates}><label>From<input className="spda-input" type="date" name="from" defaultValue={range.from} max={localDate(now)} required /></label><label>To<input className="spda-input" type="date" name="to" defaultValue={range.to} max={localDate(now)} required /></label><button type="submit" className="spda-button">Apply dates</button>{error && <p className="spda-error" role="alert">{error}</p>}</form>}
    <Metrics items={[["Assigned", inRange.filter(invoice => invoice.assignment && !invoice.outcome).length], ["Open now", inRange.length - outcomes.length], ["Approved", inRange.filter(invoice => statusOf(invoice) === "approved").length], ["Rejected", inRange.filter(invoice => statusOf(invoice) === "rejected").length]]} />
    <section className="spda-dashboard-trend"><div><h2>Issues opened over time</h2><p>Opened</p></div><TrendChart points={points} /></section>
    <section className="spda-dashboard-signals"><h2>Queue signals</h2><Metrics items={[["Mismatches", inRange.filter(invoice => invoice.type === "Mismatch").length], ["Bank holds", inRange.filter(invoice => invoice.type === "Bank change" && invoice.bank !== "confirmed").length], ["Waiting for proof", inRange.filter(invoice => invoice.requests.some(request => !request.proof)).length], ["Avg. time to decision", meanDays ? meanDays + " days" : "—"]]} /></section>
    <section className="spda-dashboard-targets"><h2>Business targets</h2><ol><li>Resolve exceptions in 3 days on average, down from 9.</li><li>Reduce duplicate or fraudulent payments to zero.</li><li>Close the month in 5 working days, down from 8.</li><li>Cut supplier status questions from about 300 a month to 150.</li></ol><img src="/design/dashboard-mascot.svg" width="276" height="170" alt="" /></section>
  </div>;
}
