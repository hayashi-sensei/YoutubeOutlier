type PanelProps = {
  children: React.ReactNode;
  title: string;
  action?: React.ReactNode;
};

export function Panel({ action, children, title }: PanelProps) {
  return (
    <section className="yt-panel">
      <div className="yt-panel-head">
        <h2 className="yt-panel-title">{title}</h2>
        {action}
      </div>
      <div className="yt-panel-body">{children}</div>
    </section>
  );
}
