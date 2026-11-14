const base = process.env.AIRPORT_API ?? 'http://127.0.0.1:8080/api'
const request = async (path, init) => {
  const response = await fetch(`${base}${path}`, init)
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path} returned ${response.status}`)
  return response
}

await request('/simulation/reset', { method: 'POST' })
const results = await Promise.all(Array.from({ length: 40 }, () =>
  request('/simulation/step', { method: 'POST' }),
))
await Promise.all([
  request('/simulation/state'), request('/flights'), request('/runway'),
  request('/statistics'), request('/events'), request('/scenarios'),
])
const state = await request('/simulation/state').then(response => response.json())
const runway = await request('/runway').then(response => response.json())
if (results.length !== 40 || state.time !== 40 || !runway.safe || state.activeFlights > 1) {
  throw new Error(`Concurrency invariant failed: ${JSON.stringify({ time: state.time, runway })}`)
}
console.log(JSON.stringify({ concurrentSteps: results.length, finalTime: state.time, runwaySafe: runway.safe }))
