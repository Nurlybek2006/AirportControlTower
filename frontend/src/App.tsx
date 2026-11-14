import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import {
  Activity, AlertTriangle, ArrowDownLeft, ArrowUpRight, BarChart3, Bell, Check,
  ChevronDown, Clock3, Gauge, Plane, Play, Plus, Radio, RotateCcw,
  ShieldAlert, SlidersHorizontal, StepForward, TowerControl, X,
} from 'lucide-react'
import { api } from './services/api'
import type { Comparison, Event, Flight, GeneratorConfig, SimState } from './types'
import AirportMap from './components/AirportMap'
import './App.css'

const ScenarioChart = lazy(() => import('./components/ScenarioChart'))
const navigation = [
  { label: 'Overview', id: 'overview', icon: Activity },
  { label: 'Live airport', id: 'airport', icon: TowerControl },
  { label: 'Flight queue', id: 'queue', icon: Plane },
  { label: 'Emergency control', id: 'emergencies', icon: ShieldAlert },
  { label: 'Scenario analysis', id: 'analysis', icon: BarChart3 },
  { label: 'Event log', id: 'events', icon: Radio },
] as const
const initialState: SimState = {
  time: 0, running: false, speed: 1, scenario: 'normal', runway: 'FREE',
  activeFlights: 0, waitingFlights: 0, completedFlights: 0, emergencyCount: 0,
  statistics: {
    scenario: 'normal', time: 0, totalGenerated: 0, completed: 0, completedArrivals: 0,
    completedDepartures: 0, emergencyHandled: 0, averageWait: 0,
    averageDepartureDelay: 0, averageArrivalDelay: 0, averageServiceDelay: 0,
    maxWait: 0, queueLength: 0, maxQueueLength: 0, runwayUtilization: 0,
    diverted: 0, pending: 0,
  },
}
const initialGenerator: GeneratorConfig = {
  enabled: false, arrivalPercent: 50, fuelMin: 40, fuelMax: 100,
  emergencyPercent: 5, trafficInterval: 4, seed: 731,
}
const scenarioLabels: Record<string, string> = {
  normal: 'Normal operations', heavy: 'Heavy traffic', overload: 'Emergency overload',
}
const formatSimTime = (minutes: number) =>
  'T+' + String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0')
const titleCase = (value: string) =>
  value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const queueWait = (flight: Flight, time: number) => Math.max(0, (flight.serviceStart >= 0 ? flight.serviceStart : time) - flight.queueEntered)

function App() {
  const [simulation, setSimulation] = useState(initialState)
  const [flights, setFlights] = useState<Flight[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [comparison, setComparison] = useState<Comparison[]>([])
  const [generator, setGenerator] = useState(initialGenerator)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [activeNav, setActiveNav] = useState('overview')
  const [queueFilter, setQueueFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')
  const [showFlightForm, setShowFlightForm] = useState(false)
  const [showGenerator, setShowGenerator] = useState(false)
  const [notice, setNotice] = useState('')
  const polling = useRef(false)
  const noticeTimer = useRef<number | undefined>(undefined)

  const refresh = useCallback(async () => {
    if (polling.current) return
    polling.current = true
    try {
      const [nextState, nextFlights, nextEvents, nextGenerator] = await Promise.all([
        api.state(), api.flights(), api.events(), api.generator(),
      ])
      setSimulation(nextState)
      setFlights(nextFlights)
      setEvents(nextEvents)
      setGenerator(nextGenerator)
      setError('')
      setLoading(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Backend connection failed')
      setLoading(false)
    } finally {
      polling.current = false
    }
  }, [])

  useEffect(() => {
    const first = window.setTimeout(() => { void refresh() }, 0)
    const interval = window.setInterval(() => { void refresh() }, 900)
    return () => { window.clearTimeout(first); window.clearInterval(interval) }
  }, [refresh])

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  const runAction = async (name: string, operation: () => Promise<unknown>, success?: string) => {
    setBusyAction(name)
    try {
      await operation()
      await refresh()
      setError('')
      if (success) {
        setNotice(success)
        window.clearTimeout(noticeTimer.current)
        noticeTimer.current = window.setTimeout(() => setNotice(''), 2800)
      }
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The requested action failed')
      return false
    } finally {
      setBusyAction('')
    }
  }

  const jumpTo = (item: typeof navigation[number]) => {
    setActiveNav(item.id)
    document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const activeFlight = flights.find((flight) => flight.status === 'landing' || flight.status === 'taking_off')
  const waitingFlights = flights.filter((flight) => ['queued', 'approaching', 'ready', 'scheduled'].includes(flight.status))
  const emergencies = flights.filter((flight) => flight.emergency)
  const visibleQueue = waitingFlights.filter((flight) =>
    queueFilter === 'all' || (queueFilter === 'emergency' ? flight.emergency : flight.operation === queueFilter),
  )
  const visibleEvents = events.filter((event) => eventFilter === 'all' || event.severity === eventFilter)
  const chartData = useMemo(() => comparison.map(({ statistics }) => ({
    scenario: scenarioLabels[statistics.scenario] ?? titleCase(statistics.scenario),
    wait: statistics.averageWait,
    arrivalDelay: statistics.averageArrivalDelay,
    departureDelay: statistics.averageDepartureDelay,
    completed: statistics.completed,
    maxQueue: statistics.maxQueueLength,
    emergencies: statistics.emergencyHandled,
    utilization: statistics.runwayUtilization,
  })), [comparison])

  const compareScenarios = () => runAction(
    'compare', async () => setComparison(await api.compare()), 'Scenario comparison is ready',
  )
  const loadAndStart = (scenario: string) => runAction('scenario', async () => {
    await api.loadScenario(scenario)
    await api.control('start')
  }, (scenarioLabels[scenario] ?? 'Scenario') + ' started')

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" onClick={() => setActiveNav('overview')}>
          <span className="brand-mark"><TowerControl size={19} strokeWidth={1.8} /></span>
          <span className="brand-copy"><strong>Airport Control Tower</strong><small>SIMULATION · LIVE OPERATIONS</small></span>
        </a>
        <div className="airport-selector">
          <span className="airport-code">APT</span>
          <span className="airport-name"><strong>Simulation Airport</strong><small>Single runway · A / B</small></span>
          <ChevronDown size={14} aria-hidden="true" />
        </div>
        <div className="side-caption">OPERATIONS</div>
        <nav className="side-nav" aria-label="Operations sections">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <button
                type="button"
                key={item.id}
                className={'nav-item' + (activeNav === item.id ? ' selected' : '')}
                aria-current={activeNav === item.id ? 'page' : undefined}
                onClick={() => jumpTo(item)}
              >
                <Icon size={16} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.id === 'emergencies' && emergencies.length > 0 && <em>{emergencies.length}</em>}
              </button>
            )
          })}
          <button type="button" className="nav-item" onClick={() => setShowGenerator(true)}>
            <SlidersHorizontal size={16} strokeWidth={1.8} /><span>Settings</span>
          </button>
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-live"><span className="signal-dot" /> Simulation services online</div>
          <div className="sidebar-build">C++20 ENGINE <span>·</span> REST LINK ACTIVE</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>OPERATIONS</span><i>/</i><strong>{navigation.find((item) => item.id === activeNav)?.label.toUpperCase() ?? 'SETTINGS'}</strong></div>
          <div className="topbar-right">
            <div className="sim-clock"><span>SIMULATION TIME</span><strong>{formatSimTime(simulation.time)}</strong></div>
            <div className={'connection-pill' + (error ? ' disconnected' : '')} role="status">
              <span className="signal-dot" />{error ? 'RECONNECTING' : 'LIVE API'}
            </div>
            <button type="button" className="icon-button" aria-label="View emergency control" onClick={() => jumpTo(navigation[3])}>
              <Bell size={17} />{emergencies.length > 0 && <i />}
            </button>
          </div>
        </header>

        {error && (
          <div className="connection-banner" role="alert">
            <AlertTriangle size={16} /><span>{error}</span>
            <button type="button" onClick={() => { setError(''); void refresh() }}>Retry connection</button>
          </div>
        )}

        <div className="workspace" id="overview">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="signal-dot" /> AIR TRAFFIC MANAGEMENT <i>/</i> {titleCase(simulation.scenario).toUpperCase()}</div>
              <h1>Operations overview</h1>
              <p>Live runway status, flight sequencing and operational performance.</p>
            </div>
            <div className="primary-controls" aria-label="Simulation controls">
              <button type="button" className="button quiet-button" disabled={!!busyAction} onClick={() => void runAction('step', () => api.control('step'), 'Advanced one simulation minute')}>
                <StepForward size={15} /> Step
              </button>
              <button
                type="button"
                className={'button ' + (simulation.running ? 'pause-button' : 'primary-button')}
                disabled={!!busyAction}
                onClick={() => void runAction('simulation', () => api.control(simulation.running ? 'pause' : simulation.time > 0 ? 'resume' : 'start'), simulation.running ? 'Simulation paused' : simulation.time > 0 ? 'Simulation resumed' : 'Simulation started')}
              >
                {busyAction === 'simulation' ? <span className="button-spinner" /> : simulation.running ? <span className="pause-mark">Ⅱ</span> : <Play size={14} fill="currentColor" />}
                {busyAction === 'simulation' ? 'Updating…' : simulation.running ? 'Pause simulation' : simulation.time > 0 ? 'Resume simulation' : 'Start simulation'}
              </button>
            </div>
          </section>

          <section className="metric-grid" aria-label="Live operational metrics">
            <MetricCard icon={<Plane />} label="RUNWAY MOVEMENT" value={simulation.activeFlights} hint={activeFlight ? activeFlight.number + ' · ' + titleCase(activeFlight.operation) : 'No active operation'} tone="cyan" />
            <MetricCard icon={<Clock3 />} label="WAITING IN QUEUE" value={simulation.waitingFlights} hint={'Peak queue ' + simulation.statistics.maxQueueLength} tone="amber" />
            <MetricCard icon={<Check />} label="COMPLETED" value={simulation.completedFlights} hint={simulation.statistics.totalGenerated + ' flights generated'} tone="green" />
            <MetricCard icon={<Activity />} label="AVERAGE QUEUE WAIT" value={simulation.statistics.averageWait.toFixed(1) + ' min'} hint={'Maximum current wait ' + simulation.statistics.maxWait + ' min'} tone="blue" />
            <MetricCard icon={<Gauge />} label="RUNWAY UTILIZATION" value={simulation.statistics.runwayUtilization.toFixed(1) + '%'} hint="Service time / elapsed time" tone="violet" />
            <MetricCard icon={<ShieldAlert />} label="PRIORITY WATCH" value={simulation.emergencyCount} hint={simulation.statistics.emergencyHandled + ' emergencies handled'} tone="red" />
          </section>

          <section className="operations-grid">
            <div className="panel airfield-panel" id="airport">
              <div className="panel-heading">
                <div><span className="section-kicker">LIVE AIRFIELD</span><h2>Airport surface</h2></div>
                <div className={'runway-indicator ' + (simulation.runway === 'FREE' ? 'is-free' : 'is-active')}>
                  <span className="runway-lamp" />
                  <span><strong>{simulation.runway === 'FREE' ? 'RUNWAY AVAILABLE' : titleCase(simulation.runway.replace('OCCUPIED_', '').replace('_', ' '))}</strong><small>{activeFlight ? activeFlight.number + ' · ' + activeFlight.operation.toUpperCase() : 'Runway A / B'}</small></span>
                </div>
                <div className="live-label"><span className="signal-dot" /> LIVE</div>
              </div>
              <AirportMap flights={flights} simulationTime={simulation.time} runway={simulation.runway} loading={loading} />
            </div>

            <div className="panel queue-panel" id="queue">
              <div className="panel-heading">
                <div><span className="section-kicker">PRIORITY SEQUENCING</span><h2>Flight queue <span className="count-badge">{waitingFlights.length}</span></h2></div>
                <button type="button" className="icon-button add-flight" aria-label="Create a flight" title="Create a flight" onClick={() => setShowFlightForm(true)}><Plus size={18} /></button>
              </div>
              <div className="queue-filters" role="group" aria-label="Filter flight queue">
                {['all', 'arrival', 'departure', 'emergency'].map((filter) => (
                  <button type="button" key={filter} className={queueFilter === filter ? 'active' : ''} aria-pressed={queueFilter === filter} onClick={() => setQueueFilter(filter)}>
                    {filter === 'all' ? 'All traffic' : titleCase(filter)}
                  </button>
                ))}
              </div>
              <div className="flight-list" aria-live="polite">
                {visibleQueue.slice(0, 7).map((flight) => <FlightRow key={flight.id} flight={flight} time={simulation.time} />)}
                {visibleQueue.length === 0 && <div className="empty-state">{loading ? 'Loading flight data…' : 'No flights in this queue filter.'}</div>}
              </div>
              <div className="queue-foot"><span>Showing {Math.min(visibleQueue.length, 7)} of {visibleQueue.length} waiting flights</span><span>FIFO + priority aging</span></div>
            </div>
          </section>

          <section className="lower-grid">
            <div className="panel emergency-panel" id="emergencies">
              <div className="panel-heading">
                <div><span className="section-kicker">SAFETY & PRIORITY</span><h2>Emergency control</h2></div>
                <span className={'state-badge ' + (emergencies.length ? 'critical' : 'clear')}><span className="signal-dot" />{emergencies.length ? emergencies.length + ' ACTIVE' : 'ALL CLEAR'}</span>
              </div>
              <div className="emergency-list">
                {emergencies.slice(0, 4).map((flight) => <EmergencyRow key={flight.id} flight={flight} />)}
                {emergencies.length === 0 && <div className="calm-state"><ShieldAlert size={19} /><span>No active emergencies. Priority monitoring is on.</span></div>}
              </div>
              <div className="policy-note"><ShieldAlert size={15} /><span><strong>Dispatch policy</strong> · Critical arrivals first; then emergency arrivals by least endurance, emergency departures by severity, and aged normal traffic.</span></div>
              <button type="button" className="text-action" onClick={() => setShowFlightForm(true)}><Plus size={14} /> Create an emergency flight</button>
            </div>

            <div className="panel session-panel">
              <div className="panel-heading"><div><span className="section-kicker">SESSION PERFORMANCE</span><h2>Operational statistics</h2></div><span className="live-small">{formatSimTime(simulation.time)}</span></div>
              <div className="stat-list">
                <StatRow label="Completed arrivals" value={simulation.statistics.completedArrivals} />
                <StatRow label="Completed departures" value={simulation.statistics.completedDepartures} />
                <StatRow label="Average arrival delay" value={simulation.statistics.averageArrivalDelay.toFixed(1) + ' min'} />
                <StatRow label="Average departure delay" value={simulation.statistics.averageDepartureDelay.toFixed(1) + ' min'} />
                <StatRow label="Maximum queue wait" value={simulation.statistics.maxWait + ' min'} />
                <StatRow label="Diverted flights" value={simulation.statistics.diverted} alert={simulation.statistics.diverted > 0} />
                <StatRow label="Emergency flights handled" value={simulation.statistics.emergencyHandled} />
              </div>
              <div className="utilization-row"><span>RUNWAY SERVICE UTILIZATION</span><strong>{simulation.statistics.runwayUtilization.toFixed(1)}%</strong></div>
              <div className="utilization-track" aria-label={'Runway utilization ' + simulation.statistics.runwayUtilization.toFixed(1) + ' percent'}><span style={{ width: Math.max(0, Math.min(100, simulation.statistics.runwayUtilization)) + '%' }} /></div>
            </div>
          </section>

          <section className="panel analysis-panel" id="analysis">
            <div className="panel-heading analysis-heading">
              <div><span className="section-kicker">DETERMINISTIC DECISION SUPPORT</span><h2>Scenario comparison</h2><p>Fixed seeds · shared 180-minute horizon · C++-calculated results</p></div>
              <button type="button" className="button quiet-button" disabled={!!busyAction} onClick={() => void compareScenarios()}>
                {busyAction === 'compare' ? <span className="button-spinner" /> : <BarChart3 size={15} />}
                {busyAction === 'compare' ? 'Comparing…' : comparison.length ? 'Re-run comparison' : 'Compare scenarios'}
              </button>
            </div>
            <div className="scenario-grid">
              {[
                { id: 'normal', index: '01', title: 'Normal operations', note: 'Low traffic · 14 flights · seed 731' },
                { id: 'heavy', index: '02', title: 'Heavy traffic', note: 'Dense traffic · 30 flights · seed 1942' },
                { id: 'overload', index: '03', title: 'Emergency overload', note: 'Urgent arrivals · 24 flights · seed 5813' },
              ].map((scenario) => (
                <button type="button" key={scenario.id} className={'scenario-card' + (simulation.scenario === scenario.id ? ' current' : '')} disabled={!!busyAction} onClick={() => void loadAndStart(scenario.id)}>
                  <span className="scenario-index">{scenario.index}</span><span className="scenario-copy"><strong>{scenario.title}</strong><small>{scenario.note}</small></span><Play size={14} />
                </button>
              ))}
            </div>
            {comparison.length > 0 ? (
              <Suspense fallback={<div className="chart-loading">Loading comparison charts…</div>}>
                <div className="charts-grid">
                  <ScenarioChart title="Average queue wait" unit="min" data={chartData} series={[{ key: 'wait', label: 'Queue wait', color: '#58c7ef' }]} />
                  <ScenarioChart title="Average arrival & departure delay" unit="min" data={chartData} series={[{ key: 'arrivalDelay', label: 'Arrival', color: '#58c7ef' }, { key: 'departureDelay', label: 'Departure', color: '#d9a957' }]} />
                  <ScenarioChart title="Completed flights" unit="flights" data={chartData} series={[{ key: 'completed', label: 'Completed', color: '#63c99b' }]} />
                  <ScenarioChart title="Maximum queue length" unit="flights" data={chartData} series={[{ key: 'maxQueue', label: 'Peak queue', color: '#d9a957' }]} />
                  <ScenarioChart title="Emergency flights handled" unit="flights" data={chartData} series={[{ key: 'emergencies', label: 'Handled', color: '#f07872' }]} />
                  <ScenarioChart title="Runway utilization" unit="%" data={chartData} series={[{ key: 'utilization', label: 'Utilization', color: '#a991e8' }]} />
                </div>
              </Suspense>
            ) : (
              <div className="analysis-empty"><BarChart3 size={18} /><span>Run the comparison to see waiting time, delay, throughput, emergency handling and runway use.</span></div>
            )}
          </section>

          <section className="panel events-panel" id="events">
            <div className="panel-heading">
              <div><span className="section-kicker">AUDIT TRAIL</span><h2>Event log</h2></div>
              <label className="event-filter">SEVERITY
                <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}>
                  <option value="all">All events</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="success">Success</option><option value="info">Info</option>
                </select>
              </label>
              <span className="live-small">{visibleEvents.length} RECORDS</span>
            </div>
            <EventTable events={visibleEvents.slice(0, 10)} allEvents={events.length} loading={loading} />
          </section>

          <footer className="workspace-footer">
            <span><TowerControl size={14} /> AIRPORT CONTROL TOWER <i>·</i> C++20 SIMULATION ENGINE</span>
            <div className="speed-controls" aria-label="Simulation speed">
              <span>SPEED</span>
              {[1, 2, 5, 10].map((speed) => (
                <button type="button" key={speed} className={simulation.speed === speed ? 'selected' : ''} aria-pressed={simulation.speed === speed} disabled={!!busyAction} onClick={() => void runAction('speed', () => api.speed(speed), 'Simulation speed set to ' + speed + '×')}>{speed}×</button>
              ))}
            </div>
            <button type="button" className="reset-button" disabled={!!busyAction} onClick={() => void runAction('reset', () => api.control('reset'), 'Simulation reset')}><RotateCcw size={13} /> Reset</button>
          </footer>
        </div>
      </main>

      {notice && <div className="toast" role="status" aria-live="polite"><Check size={15} />{notice}</div>}
      {showFlightForm && (
        <FlightModal
          busy={busyAction === 'flight'}
          onClose={() => setShowFlightForm(false)}
          onSave={async (form) => {
            const saved = await runAction('flight', () => api.createFlight(form), form.emergency ? 'Emergency flight queued' : 'Flight added to queue')
            if (saved) setShowFlightForm(false)
            return saved
          }}
        />
      )}
      {showGenerator && (
        <GeneratorModal
          config={generator}
          busy={busyAction === 'generator'}
          onClose={() => setShowGenerator(false)}
          onGenerate={async () => runAction('generator', () => api.randomFlight(), 'Random flight generated')}
          onSave={async (next) => runAction('generator', async () => setGenerator(await api.configureGenerator(next)), 'Generator settings saved')}
        />
      )}
    </div>
  )
}

function MetricCard({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: string | number; hint: string; tone: string }) {
  return (
    <motion.article className="metric-card" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
      <div className={'metric-icon ' + tone}>{icon}</div><span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong><span className="metric-hint">{hint}</span>
    </motion.article>
  )
}

function FlightRow({ flight, time }: { flight: Flight; time: number }) {
  const isEmergency = flight.emergency
  const wait = flight.queueEntered >= 0 ? queueWait(flight, time) : 0
  const priority = isEmergency ? 'P' + String(4 - flight.severity) : 'NORMAL'
  return (
    <article className={'flight-row' + (isEmergency ? ' urgent-row' : '')}>
      <span className={'operation-icon ' + flight.operation}>{flight.operation === 'arrival' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}</span>
      <span className="flight-main"><strong>{flight.number}{isEmergency && <em>EMERGENCY</em>}</strong><small>{flight.airline} · {flight.aircraft}</small></span>
      <span className="fuel-cell"><strong className={flight.fuel <= 15 ? 'fuel-critical' : ''}>{Math.floor(flight.fuel)}%</strong><small>FUEL</small></span>
      <span className="priority-cell"><b className={isEmergency ? 'priority-emergency' : ''}>{priority}</b><small>{titleCase(flight.status)}</small></span>
      <span className="wait-cell">{wait}<small>MIN</small></span>
    </article>
  )
}

function EmergencyRow({ flight }: { flight: Flight }) {
  const fuelWidth = Math.max(0, Math.min(100, flight.fuel))
  return (
    <div className="emergency-row">
      <span className="emergency-symbol"><AlertTriangle size={15} /></span>
      <span className="emergency-copy"><strong>{flight.number}<small>{flight.aircraft}</small></strong><span>{titleCase(flight.operation)} · Severity {flight.severity}</span></span>
      <span className="fuel-gauge"><span><small>FUEL</small><b>{Math.floor(flight.fuel)}%</b></span><i><b style={{ width: fuelWidth + '%' }} /></i></span>
    </div>
  )
}

function StatRow({ label, value, alert = false }: { label: string; value: string | number; alert?: boolean }) {
  return <div className="stat-row"><span>{label}</span><strong className={alert ? 'stat-alert' : ''}>{value}</strong></div>
}

function EventTable({ events, allEvents, loading }: { events: Event[]; allEvents: number; loading: boolean }) {
  if (!events.length) return <div className="empty-state event-empty">{loading ? 'Loading event records…' : allEvents ? 'No events match this severity.' : 'No events have been recorded yet.'}</div>
  return (
    <div className="event-table">
      <div className="event-header"><span>SIM TIME</span><span>EVENT</span><span>FLIGHT</span><span>DESCRIPTION</span><span>SEVERITY</span></div>
      {events.map((event, index) => (
        <div className="event-row" key={event.time + event.flightId + event.type + index}>
          <span>{formatSimTime(event.time)}</span><span>{titleCase(event.type)}</span><span>{event.flightId || '—'}</span><span>{event.description}</span><b className={'severity ' + event.severity}>{event.severity}</b>
        </div>
      ))}
    </div>
  )
}

function FlightModal({ busy, onClose, onSave }: {
  busy: boolean
  onClose: () => void
  onSave: (flight: { operation: string; number: string; aircraft: string; fuel: number; emergency: boolean; severity: number }) => Promise<boolean>
}) {
  const [number, setNumber] = useState('')
  const [operation, setOperation] = useState('arrival')
  const [aircraft, setAircraft] = useState('A320')
  const [fuel, setFuel] = useState(65)
  const [emergency, setEmergency] = useState(false)
  const [severity, setSeverity] = useState(2)
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <form className="modal-card" onSubmit={async (event) => {
        event.preventDefault()
        await onSave({ number: number.trim().toUpperCase(), operation, aircraft, fuel, emergency, severity })
      }}>
        <div className="modal-heading"><div><span className="section-kicker">MANUAL DISPATCH</span><h2>Register a flight</h2></div><button type="button" className="icon-button" aria-label="Close flight form" onClick={onClose}><X size={17} /></button></div>
        <label>Flight number<input required maxLength={12} value={number} onChange={(event) => setNumber(event.target.value.toUpperCase())} placeholder="e.g. KC204" /></label>
        <div className="form-columns">
          <label>Operation<select value={operation} onChange={(event) => setOperation(event.target.value)}><option value="arrival">Arrival</option><option value="departure">Departure</option></select></label>
          <label>Aircraft<select value={aircraft} onChange={(event) => setAircraft(event.target.value)}><option>A320</option><option>B738</option><option>E190</option></select></label>
        </div>
        <label className="range-label">Fuel on board <strong>{fuel}%</strong><input type="range" min="1" max="100" value={fuel} onChange={(event) => setFuel(Number(event.target.value))} /></label>
        <label className="checkbox-label"><input type="checkbox" checked={emergency} onChange={(event) => setEmergency(event.target.checked)} /> Declare emergency</label>
        {emergency && <label>Emergency severity<select value={severity} onChange={(event) => setSeverity(Number(event.target.value))}><option value="1">1 · Low</option><option value="2">2 · High</option><option value="3">3 · Critical</option></select></label>}
        <div className="modal-actions"><button type="button" className="button quiet-button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="button primary-button" disabled={busy}>{busy ? <span className="button-spinner" /> : <Plus size={15} />}{busy ? 'Adding flight…' : 'Add to queue'}</button></div>
      </form>
    </div>
  )
}

function GeneratorModal({ config, busy, onClose, onGenerate, onSave }: {
  config: GeneratorConfig
  busy: boolean
  onClose: () => void
  onGenerate: () => Promise<boolean>
  onSave: (config: GeneratorConfig) => Promise<boolean>
}) {
  const [draft, setDraft] = useState(config)
  const edit = (patch: Partial<GeneratorConfig>) => setDraft((previous) => ({ ...previous, ...patch }))
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <form className="modal-card" onSubmit={async (event) => { event.preventDefault(); await onSave(draft) }}>
        <div className="modal-heading"><div><span className="section-kicker">TRAFFIC CONFIGURATION</span><h2>Flight generator</h2></div><button type="button" className="icon-button" aria-label="Close generator settings" onClick={onClose}><X size={17} /></button></div>
        <label className="checkbox-label"><input type="checkbox" checked={draft.enabled} onChange={(event) => edit({ enabled: event.target.checked })} /> Enable automatic flight generation</label>
        <div className="form-columns">
          <label className="range-label">Arrival share <strong>{draft.arrivalPercent}%</strong><input type="range" min="0" max="100" value={draft.arrivalPercent} onChange={(event) => edit({ arrivalPercent: Number(event.target.value) })} /></label>
          <label className="range-label">Emergency chance <strong>{draft.emergencyPercent}%</strong><input type="range" min="0" max="100" value={draft.emergencyPercent} onChange={(event) => edit({ emergencyPercent: Number(event.target.value) })} /></label>
        </div>
        <div className="form-columns">
          <label>Fuel minimum<input type="number" min="1" max={draft.fuelMax} value={draft.fuelMin} onChange={(event) => edit({ fuelMin: Number(event.target.value) })} /></label>
          <label>Fuel maximum<input type="number" min={draft.fuelMin} max="100" value={draft.fuelMax} onChange={(event) => edit({ fuelMax: Number(event.target.value) })} /></label>
        </div>
        <div className="form-columns">
          <label>Generation interval (ticks)<input type="number" min="1" max="60" value={draft.trafficInterval} onChange={(event) => edit({ trafficInterval: Number(event.target.value) })} /></label>
          <label>Deterministic seed<input type="number" min="0" value={draft.seed} onChange={(event) => edit({ seed: Number(event.target.value) })} /></label>
        </div>
        <div className="modal-actions split-actions"><button type="button" className="button quiet-button" disabled={busy} onClick={() => void onGenerate()}><Radio size={14} /> Generate one flight</button><button type="submit" className="button primary-button" disabled={busy}>{busy ? <span className="button-spinner" /> : <Check size={14} />}{busy ? 'Saving…' : 'Apply settings'}</button></div>
      </form>
    </div>
  )
}

export default App
