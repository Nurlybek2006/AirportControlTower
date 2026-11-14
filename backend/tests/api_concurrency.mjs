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
const queue = await request('/queue/explain').then(response => response.json())
const flights = await request('/flights').then(response => response.json())
const markable = flights.find(flight => flight.status !== 'landing' && flight.status !== 'taking_off')
if (markable) {
  await request('/flights/emergency', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flightId: markable.id, severity: 3 }) })
}
const custom = await request('/scenarios/experiment', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ seed: 4431, duration: 60, arrivalPercent: 65, emergencyPercent: 12, fuelMin: 25, fuelMax: 75, trafficInterval: 3, landingDuration: 4, takeoffDuration: 3, clearingDuration: 2 }),
}).then(response => response.json())
const comparisonA = await request('/scenarios/compare', { method: 'POST' }).then(response => response.json())
const comparisonB = await request('/scenarios/compare', { method: 'POST' }).then(response => response.json())
const restored = await request('/simulation/state').then(response => response.json())
if (results.length !== 40 || state.time !== 40 || !runway.safe || state.activeFlights > 1) {
  throw new Error(`Concurrency invariant failed: ${JSON.stringify({ time: state.time, runway })}`)
}
if (!Array.isArray(queue) || custom.duration !== 60 || custom.statistics.time !== 60 || restored.time !== state.time) {
  throw new Error(`Queue explanation or isolated experiment contract failed: ${JSON.stringify({ queue, custom, restored: restored.time })}`)
}
if (JSON.stringify(comparisonA) !== JSON.stringify(comparisonB) || comparisonA.length !== 3 || new Set(comparisonA.map(result => result.statistics.time)).size !== 1) {
  throw new Error('Preset scenario comparison is not deterministic or does not use a shared duration')
}
console.log(JSON.stringify({ concurrentSteps: results.length, finalTime: state.time, runwaySafe: runway.safe, queueExplanation: true, emergencyMutation: Boolean(markable), customExperiment: custom.statistics.time, deterministicScenarios: comparisonA.length, stateRestored: restored.time === state.time }))
