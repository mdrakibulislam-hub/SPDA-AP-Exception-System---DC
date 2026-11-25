import { Button } from "@SPDA-AP-Exception-System---DC/ui/components/button";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { localDate, monthAt, roles, statusOf } from "./model";
import { PageTitle, useWorkspace } from "./workspace";

type Point = { label: string; count: number };

function TrendChart({ points }: { points: Point[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const paint = () => {
      if (!canvas) return;
      const context = canvas.getContext("2d");
      const { width, height } = canvas.getBoundingClientRect();
      if (!context || !width || !height) return;
      const scale = window.devicePixelRatio;
      canvas.width = width * scale;
      canvas.height = height * scale;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      const css = getComputedStyle(canvas);
      const left = 30;
      const right = width - 20;
      const top = 16;
      const bottom = height - 25;
      const high = Math.max(3, ...points.map(point => point.count));
      const x = (index: number) => points.length === 1 ? (left + right) / 2 : left + index * (right - left) / (points.length - 1);
      const y = (value: number) => bottom - value * (bottom - top) / high;
      context.font = "12px Inter, system-ui, sans-serif";
      context.fillStyle = css.getPropertyValue("--spda-muted");
      context.strokeStyle = css.getPropertyValue("--spda-line");
      context.textAlign = "right";
      for (let value = 0; value <= high; value++) {
        context.beginPath();
        context.moveTo(left, y(value));
        context.lineTo(right, y(value));
        context.stroke();
        context.fillText(String(value), left - 9, y(value) + 4);
      }
      context.textAlign = "center";
      points.forEach((point, index) => {
        if (width >= 350 || index % 2 === 0 || index === points.length - 1) context.fillText(point.label, x(index), height - 5);
      });
      context.strokeStyle = context.fillStyle = css.getPropertyValue("--spda-brand");
      context.lineWidth = 2;
      context.beginPath();
      points.forEach((point, index) => context.lineTo(x(index), y(point.count)));
      context.stroke();
      points.forEach((point, index) => {
        context.beginPath();
        context.arc(x(index), y(point.count), 4, 0, 2 * Math.PI);
        context.fill();
      });
    };
    paint();
    const observer = new ResizeObserver(paint);
    if (canvas) observer.observe(canvas);
    return () => observer.disconnect();
  }, [points]);
  return <canvas ref={ref} className="spda-chart" role="img"
    aria-label={points.map(point => `${point.label}: ${point.count}`).join(", ")} />;
}

function Metrics({ items }: { items: [string, number | string][] }) {
  return <dl className="spda-metrics">{items.map(([label, value]) => <div key={label}>
    <dt>{label}</dt><dd>{value}</dd>
  </div>)}</dl>;
}

export function DashboardScreen() {
  const { role, visible } = useWorkspace();
  const [now] = useState(() => new Date());
  const [period, setPeriod] = useState("6");
  const [range, setRange] = useState({ from: localDate(monthAt(now, -5)), to: localDate(now) });
  const [error, setError] = useState("");
  const start = period === "custom" ? new Date(`${range.from}T00:00:00`) : monthAt(now, 1 - Number(period));
  const end = new Date(`${period === "custom" ? range.to : localDate(now)}T23:59:59.999`);
  const inRange = visible.filter(invoice => {
    const opened = new Date(invoice.opened);
    return opened >= start && opened <= end;
  });
  const points: Point[] = [];
  const monthName = new Intl.DateTimeFormat(undefined, { month: "short" });
  for (let bucket = monthAt(start, 0); bucket <= end; bucket = monthAt(bucket, 1)) {
    const next = monthAt(bucket, 1);
    points.push({ label: monthName.format(bucket), count: inRange.filter(invoice => new Date(invoice.opened) >= bucket && new Date(invoice.opened) < next).length });
  }

  const outcomes = inRange.filter(invoice => invoice.outcome);
  const meanDays = outcomes.length
    ? (outcomes.reduce((sum, invoice) => sum + (Date.parse(invoice.outcome!.when) - Date.parse(invoice.opened)) / 86400000, 0) / outcomes.length).toFixed(1)
    : null;
  const finance = role === "ap" || role === "controller";

  function changeDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const from = String(data.get("from"));
    const to = String(data.get("to"));
    if (from > to) {
      setError("Choose an end date on or after the start date.");
      return;
    }
    setError("");
    setRange({ from, to });
  }

  return (
    <>
      <PageTitle title={`${roles[role]} dashboard`} description="Outcomes for sample invoices opened in the selected period."
        actions={role !== "supplier" && <Link className="spda-link-button" to="/overview"><Sparkles size={16} aria-hidden="true" /> AI overview <ArrowRight size={15} aria-hidden="true" /></Link>} />
      <div className="spda-period">
        <label>Time period <select value={period} onChange={event => { setError(""); setPeriod(event.target.value); }}>
          <option value="1">This month</option>
          <option value="3">Last 3 months</option>
          <option value="6">Last 6 months</option>
          <option value="custom">Custom dates</option>
        </select></label>
        {period === "custom" && <form onSubmit={changeDates} className="spda-actions">
          <label>From <input type="date" name="from" defaultValue={range.from} min={localDate(monthAt(now, -5))} max={localDate(now)} required /></label>
          <label>To <input type="date" name="to" defaultValue={range.to} min={localDate(monthAt(now, -5))} max={localDate(now)} required /></label>
          <Button type="submit" variant="outline">Apply dates</Button>
        </form>}
        {error && <p role="alert" className="spda-error">{error}</p>}
      </div>
      <Metrics items={[
        ["Opened", inRange.length],
        ["Open now", inRange.length - outcomes.length],
        ["Approved", inRange.filter(invoice => statusOf(invoice) === "approved").length],
        ["Rejected", inRange.filter(invoice => statusOf(invoice) === "rejected").length],
      ]} />
      <section className="spda-panel spda-trend">
        <h2>Issues opened over time</h2>
        <p className="spda-muted">Illustrative dates from the seven sample invoices.</p>
        <TrendChart points={points} />
      </section>
      {finance && <>
        <section className="spda-section"><h2>Queue signals</h2><Metrics items={[
          ["Mismatches", inRange.filter(invoice => invoice.type === "Mismatch").length],
          ["Bank holds", inRange.filter(invoice => invoice.type === "Bank change" && invoice.bank !== "confirmed").length],
          ["Waiting for proof", inRange.filter(invoice => invoice.requests.some(request => !request.proof)).length],
          ["Avg. time to decision", meanDays ? `${meanDays} days` : "—"],
        ]} /></section>
        <section className="spda-panel"><h2>Business targets</h2><ul className="spda-bullets">
          <li>Resolve exceptions in 3 days on average, down from 9.</li>
          <li>Reduce duplicate or fraudulent payments to zero.</li>
          <li>Close the month in 5 working days, down from 8.</li>
          <li>Cut supplier status questions from about 300 a month to 150.</li>
        </ul></section>
      </>}
    </>
  );
}
