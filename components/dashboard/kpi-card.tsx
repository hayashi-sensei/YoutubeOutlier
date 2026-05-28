type KpiCardProps = {
  label: string;
  value: string;
  note: string;
};

export function KpiCard({ label, note, value }: KpiCardProps) {
  return (
    <section className="yt-kpi">
      <p className="yt-kpi-label">{label}</p>
      <p className="yt-kpi-value">{value}</p>
      <p className="yt-kpi-note">{note}</p>
    </section>
  );
}
