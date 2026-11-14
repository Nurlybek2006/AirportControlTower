import { useMemo, useState } from 'react'
import { Minus, Plus, Scan, Wind } from 'lucide-react'
import type { Flight } from '../types'

type Point = { x: number; y: number; heading: number; progress: number }
const isActive = (status: string) => status === 'landing' || status === 'taking_off'
const safeProgress = (flight: Flight, time: number) => {
  const duration = Math.max(1, flight.serviceDuration || (flight.operation === 'arrival' ? 3 : 2))
  return Math.max(0, Math.min(1, (time - flight.serviceStart) / duration))
}

export default function AirportMap({ flights, simulationTime, runway, loading }: {
  flights: Flight[]
  simulationTime: number
  runway: string
  loading: boolean
}) {
  const [selectedId, setSelectedId] = useState('')
  const [zoom, setZoom] = useState(1)
  const liveFlights = useMemo(() => flights.filter((flight) => !['completed', 'diverted', 'cancelled'].includes(flight.status)), [flights])
  const active = liveFlights.filter((flight) => isActive(flight.status))
  const sorted = [...liveFlights].sort((a, b) => a.id.localeCompare(b.id))
  const slotById = new Map(sorted.map((flight, index) => [flight.id, index]))
  const selected = liveFlights.find((flight) => flight.id === selectedId)
  const runwayLights = Array.from({ length: 18 }, (_, index) => 341 + index * 21)

  const positionFor = (flight: Flight): Point => {
    if (isActive(flight.status)) {
      const parallelIndex = Math.max(0, active.findIndex((candidate) => candidate.id === flight.id))
      const progress = safeProgress(flight, simulationTime)
      return flight.status === 'landing'
        ? { x: 355 + progress * 178 + parallelIndex * 63, y: 226, heading: 0, progress }
        : { x: 515 + progress * 133 + parallelIndex * 63, y: 226, heading: 0, progress }
    }
    const slot = slotById.get(flight.id) ?? 0
    if (flight.operation === 'arrival') {
      const row = Math.floor(slot / 5)
      const x = flight.status === 'approaching' ? 108 + (slot % 5) * 43 : 125 + (slot % 5) * 43
      const y = flight.status === 'approaching' ? 112 + row * 27 : 169 + row * 27
      return { x, y, heading: 0, progress: 0 }
    }
    return { x: 138 + (slot % 8) * 54, y: 342 + Math.floor(slot / 8) * 32, heading: 0, progress: 0 }
  }

  return (
    <div className="airport-visual">
      <div className="airfield-meta">
        <span><Wind size={12} /> SIMULATION AIRFIELD <i>·</i> LIVE SURFACE</span>
        <span>SIM TICK {String(simulationTime).padStart(3, '0')} <i>·</i> {liveFlights.length} AIRCRAFT TRACKED</span>
      </div>
      <div className="map-canvas">
        <svg
          className="airfield-svg"
          viewBox={'0 0 ' + (1000 / zoom) + ' ' + (440 / zoom)}
          role="img"
          aria-label="Simulation airport live runway, taxiways and backend flight positions"
        >
          <defs>
            <pattern id="surface-grid" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M28 0H0V28" fill="none" stroke="#223544" strokeWidth=".7" />
            </pattern>
            <linearGradient id="runway-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#25333d" /><stop offset=".52" stopColor="#19262f" /><stop offset="1" stopColor="#24323c" />
            </linearGradient>
            <filter id="light-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="2.2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <rect width="1000" height="440" fill="#0a151e" />
          <rect width="1000" height="440" fill="url(#surface-grid)" opacity=".72" />

          <g className="terminal-block">
            <path d="M618 52h278v55H618z" /><path d="M638 52v-18h56v18m20 0V24h72v28m18 0V35h54v17" />
            <text x="638" y="84">TERMINAL · APRON 1</text><text x="642" y="96">GATES 01-08</text>
            <path d="M650 108v38m31-38v38m31-38v38m31-38v38m31-38v38m31-38v38m31-38v38" className="apron-stand" />
            <path d="M626 147h255" className="taxi-edge" />
          </g>

          <g className="taxiway-network">
            <path d="M42 289H953" className="taxiway-outline" />
            <path d="M42 289H953" className="taxiway-center" />
            <path d="M269 289C303 289 315 270 315 239V210" className="taxiway-outline" />
            <path d="M269 289C303 289 315 270 315 239V210" className="taxiway-center" />
            <path d="M735 226V268C735 282 746 289 766 289" className="taxiway-outline" />
            <path d="M735 226V268C735 282 746 289 766 289" className="taxiway-center" />
            <path d="M642 148V195C642 205 651 211 666 211" className="taxiway-outline" />
            <path d="M642 148V195C642 205 651 211 666 211" className="taxiway-center" />
          </g>

          <g className="runway">
            <rect x="318" y="197" width="423" height="58" rx="3" fill="url(#runway-fill)" stroke="#83919b" strokeWidth="1.1" />
            <path d="M332 204v44m-5-35 5-6 5 6m-5 23v-9m-5 13 5 7 5-7M725 204v44m-5-35 5-6 5 6m-5 23v-9m-5 13 5 7 5-7" className="runway-threshold" />
            <path d="M346 226H710" className="runway-centerline" />
            {runwayLights.map((x) => <g key={x}><circle cx={x} cy="195" r="1.65" className="runway-light" /><circle cx={x} cy="257" r="1.65" className="runway-light" /></g>)}
            <path d="M318 210h7m-7 8h7m-7 8h7m-7 8h7m-7 8h7M734 210h7m-7 8h7m-7 8h7m-7 8h7m-7 8h7" className="runway-edge-mark" />
            <text x="328" y="187" className="runway-designator">A</text>
            <text x="714" y="187" className="runway-designator">B</text>
            <text x="454" y="216" className="runway-caption">SINGLE ACTIVE RUNWAY</text>
            <text x="486" y="242" className="runway-length">SINGLE ACTIVE SURFACE</text>
          </g>

          <g className="holding-area">
            <path d="M172 312v-15h168v15m-168 0v-6h168v6" className="holding-line" />
            <path d="M185 306v-7m22 7v-7m22 7v-7m22 7v-7m22 7v-7m22 7v-7" className="holding-ticks" />
            <text x="174" y="329">DEPARTURE HOLD · A</text>
            <path d="M72 123c46-41 117-41 159 0m-159 0c43 39 116 39 159 0" className="approach-pattern" />
            <text x="46" y="77">FINAL APPROACH</text><text x="73" y="141">HOLDING FIX · A</text>
          </g>

          <g className="map-labels">
            <text x="47" y="380">TAXIWAY A</text><text x="785" y="316">TAXIWAY B</text>
            <text x="835" y="165">APRON 1</text>
            <path d="M43 360h912" className="sector-line" />
          </g>

          {active.length > 1 && (
            <g className="safety-warning"><rect x="386" y="267" width="282" height="29" rx="5" /><text x="527" y="286">RUNWAY OCCUPANCY SAFETY CHECK</text></g>
          )}

          {sorted.map((flight) => {
            const point = positionFor(flight)
            const emergency = flight.emergency
            const isSelected = selectedId === flight.id
            const statusText = flight.status.replaceAll('_', ' ')
            return (
              <g
                key={flight.id}
                className={'aircraft-marker ' + flight.operation + (emergency ? ' emergency' : '') + (isActive(flight.status) ? ' on-runway' : '') + (isSelected ? ' selected' : '')}
                transform={'translate(' + point.x + ' ' + point.y + ') rotate(' + point.heading + ')'}
                tabIndex={0}
                role="button"
                aria-label={flight.number + ', ' + flight.operation + ', ' + statusText + ', fuel ' + Math.floor(flight.fuel) + ' percent'}
                onClick={() => setSelectedId(isSelected ? '' : flight.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedId(isSelected ? '' : flight.id)
                  }
                }}
              >
                <title>{flight.number} · {flight.operation} · {statusText} · fuel {Math.floor(flight.fuel)}%</title>
                <circle className="marker-halo" r={emergency ? 19 : 15} />
                <path className="aircraft-shape" d="M-17 0-2-2 5-13 10-13 8-2 18 0 8 2 10 13 5 13-2 2Z" />
                {emergency && <path className="emergency-beacon" d="M0-22v-5m-5 0h10" />}
                <rect className="aircraft-label-bg" x="20" y="-9" width={Math.max(45, flight.number.length * 6 + 9)} height="16" rx="3" />
                <text className="aircraft-label" x="24" y="2">{flight.number}</text>
                {isActive(flight.status) && <text className="movement-label" x="22" y="20">{flight.status === 'landing' ? 'LANDING' : 'TAKEOFF'} · {Math.round(point.progress * 100)}%</text>}
                {emergency && <circle className="emergency-ring" r="22" />}
              </g>
            )
          })}
          {!liveFlights.length && !loading && <text x="500" y="414" textAnchor="middle" className="map-empty">No active aircraft · Select a scenario or add a flight</text>}
          {loading && <text x="500" y="414" textAnchor="middle" className="map-empty">Connecting to simulation telemetry…</text>}
        </svg>
        <div className="map-controls" role="group" aria-label="Airfield map zoom">
          <button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, Number((value - .15).toFixed(2))))}><Minus size={14} /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" title="Zoom in" disabled={zoom >= 1.45} onClick={() => setZoom((value) => Math.min(1.45, Number((value + .15).toFixed(2))))}><Plus size={14} /></button>
          <button type="button" aria-label="Reset map zoom" title="Reset map zoom" onClick={() => setZoom(1)}><Scan size={13} /></button>
        </div>
      </div>
      <div className="map-legend">
        <span><i className="legend-arrival" /> ARRIVAL</span><span><i className="legend-departure" /> DEPARTURE</span>
        <span><i className="legend-emergency" /> EMERGENCY</span><span><i className="legend-runway" /> RUNWAY LIGHTS</span>
        <span className="map-scale">MOVEMENT IS DRIVEN BY SIMULATION STATE</span>
      </div>
      <div className="map-selection" aria-live="polite">
        {selected ? (
          <>
            <span className={'selected-flight-icon ' + selected.operation}>{selected.operation === 'arrival' ? 'IN' : 'OUT'}</span>
            <span className="selected-flight-main"><strong>{selected.number}</strong><small>{selected.airline} · {selected.aircraft}</small></span>
            <span className="selected-flight-stat"><small>STATUS</small><strong>{selected.status.replaceAll('_', ' ')}</strong></span>
            <span className="selected-flight-stat"><small>FUEL</small><strong className={selected.fuel <= 15 ? 'fuel-critical' : ''}>{Math.floor(selected.fuel)}%</strong></span>
            <span className="selected-flight-stat"><small>QUEUE WAIT</small><strong>{Math.max(0, (selected.serviceStart >= 0 ? selected.serviceStart : simulationTime) - selected.queueEntered)} MIN</strong></span>
            {selected.emergency && <span className="selected-priority">EMERGENCY · SEVERITY {selected.severity}</span>}
          </>
        ) : (
          <span className="selection-hint">Select an aircraft to inspect its identifier, status, fuel and queue time.</span>
        )}
        <span className={'map-runway-state ' + (runway === 'FREE' ? 'free' : 'occupied')}>{runway === 'FREE' ? 'RWY FREE' : 'RWY ' + runway.replace('OCCUPIED_', '')}</span>
      </div>
    </div>
  )
}
