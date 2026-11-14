import type { Comparison, Event, Flight, SimState, Statistics } from '../types'

async function request<T>(path:string, init?:RequestInit):Promise<T>{
  const response=await fetch(`/api${path}`,{...init,headers:{'Content-Type':'application/json',...init?.headers}})
  if(!response.ok){const body=await response.json().catch(()=>({error:'API request failed'}));throw new Error(body.error??`Request failed (${response.status})`)}
  return response.json() as Promise<T>
}
const post=(path:string,body?:unknown)=>request<SimState>(path,{method:'POST',body:body===undefined?undefined:JSON.stringify(body)})
export const api={
 state:()=>request<SimState>('/simulation/state'), flights:()=>request<Flight[]>('/flights'), events:()=>request<Event[]>('/events'), stats:()=>request<Statistics>('/statistics'),
 control:(action:'start'|'pause'|'resume'|'reset'|'step')=>post(`/simulation/${action}`), speed:(speed:number)=>post('/simulation/speed',{speed}),
 loadScenario:(scenario:string)=>post('/scenarios/load',{scenario}), compare:()=>request<Comparison[]>('/scenarios/compare',{method:'POST'}),
 createFlight:(flight:{operation:string;number:string;aircraft:string;fuel:number;emergency:boolean;severity:number})=>request<Flight[]>('/flights',{method:'POST',body:JSON.stringify(flight)}),
}
