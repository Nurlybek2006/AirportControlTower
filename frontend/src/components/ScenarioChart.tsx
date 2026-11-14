import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Series = { key: string; label: string; color: string }
type Props = { title: string; unit: string; data: Record<string, string | number>[]; series: Series[] }

export default function ScenarioChart({ title, unit, data, series }: Props) {
  return (
    <article className="chart-card">
      <div className="chart-heading"><strong>{title}</strong><span>{unit}</span></div>
      <ResponsiveContainer width="100%" height={184}>
        <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: -19 }} barGap={4}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="scenario" tick={{ fill: 'var(--chart-axis)', fontSize: 9 }} axisLine={{ stroke: 'var(--line-strong)' }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: 'var(--chart-axis)', fontSize: 9 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'var(--chart-cursor)' }}
            contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line-strong)', borderRadius: 7, color: 'var(--chart-text)', fontSize: 11 }}
            formatter={(value, key) => [Number(value).toFixed(unit === 'min' || unit === '%' ? 1 : 0) + ' ' + unit, series.find((item) => item.key === key)?.label ?? String(key)]}
          />
          {series.map((item) => <Bar key={item.key} dataKey={item.key} name={item.label} fill={item.color} radius={[3, 3, 0, 0]} maxBarSize={28} />)}
        </BarChart>
      </ResponsiveContainer>
      <div className="chart-legend">{series.map((item) => <span key={item.key}><i style={{ backgroundColor: item.color }} />{item.label}</span>)}</div>
    </article>
  )
}
