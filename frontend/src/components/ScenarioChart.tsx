import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Props={title:string;data:Record<string,string|number>[];dataKey:string;unit:string;color:string}

export default function ScenarioChart({title,data,dataKey,unit,color}:Props){
 return <div className="chart-box"><div className="chart-title">{title}</div><ResponsiveContainer width="100%" height={180}><BarChart data={data} margin={{top:14,right:10,bottom:0,left:-18}}><CartesianGrid stroke="#243544" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="scenario" tick={{fill:'#8193a3',fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:'#718393',fontSize:9}} axisLine={false} tickLine={false}/><Tooltip cursor={{fill:'#172a38'}} contentStyle={{background:'#0c1822',border:'1px solid #2c4150',borderRadius:6,color:'#e1edf5',fontSize:11}} formatter={v=>[`${Number(v).toFixed(1)} ${unit}`,title]}/><Bar dataKey={dataKey} fill={color} radius={[3,3,0,0]} maxBarSize={38}/></BarChart></ResponsiveContainer></div>
}
