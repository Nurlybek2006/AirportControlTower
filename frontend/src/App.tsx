import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity, AlertTriangle, ArrowDownLeft, ArrowUpRight, BarChart3, Bell, CalendarDays, Check,
  ChevronDown, CircleHelp, Clock3, Gauge, ListOrdered, Plane, Play, Plus, Radar, Radio, RotateCcw, Search,
  Settings2, ShieldAlert, Siren, StepForward, TowerControl, X,
} from 'lucide-react'
import { api } from './services/api'
import type { Comparison, Event, ExperimentResult, Flight, GeneratorConfig, QueueEntry, SimState } from './types'
import AirportMap from './components/AirportMap'
import LocalizedMarkup from './components/LocalizedMarkup'
import { changeLanguage, savedLanguage, savedTheme, translate, type Language, type Theme } from './i18n'
import { downloadCsv } from './services/export'
import './App.css'

const ScenarioChart = lazy(() => import('./components/ScenarioChart'))
const OperationalPages = lazy(() => import('./components/OperationalPages'))
const navigation = [
  { label: 'Operations overview', id: 'dashboard', icon: Activity },
  { label: 'Live airport surface', id: 'airport', icon: TowerControl },
  { label: 'Radar simulation', id: 'radar', icon: Radar },
  { label: 'Flight management', id: 'flights', icon: Plane },
  { label: 'Priority queue', id: 'queue', icon: ListOrdered },
  { label: 'Emergency command', id: 'emergencies', icon: Siren },
  { label: 'Runway control', id: 'runway', icon: TowerControl },
  { label: 'Scenario laboratory', id: 'scenarios', icon: BarChart3 },
  { label: 'Analytics', id: 'analytics', icon: Activity },
  { label: 'Event history', id: 'events', icon: Radio },
  { label: 'Flight schedule', id: 'schedule', icon: CalendarDays },
  { label: 'Settings', id: 'settings', icon: Settings2 },
  { label: 'Help and documentation', id: 'help', icon: CircleHelp },
] as const
const routeFromPath = (pathname:string) => {
  const id = pathname.replace(/^\/+|\/+$/g, '')
  return navigation.some((item) => item.id === id) ? id : 'dashboard'
}
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
  emergencyPercent: 5, trafficInterval: 4, seed: 731, landingDuration: 3, takeoffDuration: 2, clearingDuration: 1,
}
const scenarioLabels: Record<string, string> = {
  normal: 'Normal operations', heavy: 'Heavy traffic', overload: 'Emergency overload',
}
const formatSimTime = (minutes: number) =>
  'T+' + String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0')
const titleCase = (value: string) =>
  value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const queueWait = (flight: Flight, time: number) => Math.max(0, (flight.serviceStart >= 0 ? flight.serviceStart : time) - flight.queueEntered)

function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const activeNav = routeFromPath(location.pathname)
  const [simulation, setSimulation] = useState(initialState)
  const [flights, setFlights] = useState<Flight[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [comparison, setComparison] = useState<Comparison[]>([])
  const [experiment, setExperiment] = useState<ExperimentResult | null>(null)
  const [queue, setQueue] = useState<QueueEntry[]>([])
  const [generator, setGenerator] = useState(initialGenerator)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [language, setLanguage] = useState<Language>(savedLanguage)
  const [theme, setTheme] = useState<Theme>(savedTheme)
  const [queueFilter, setQueueFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')
  const [eventQuery, setEventQuery] = useState('')
  const [showFlightForm, setShowFlightForm] = useState(false)
  const [showGenerator, setShowGenerator] = useState(false)
  const [showCommand, setShowCommand] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [notice, setNotice] = useState('')
  const polling = useRef(false)
  const noticeTimer = useRef<number | undefined>(undefined)

  const refresh = useCallback(async () => {
    if (polling.current) return
    polling.current = true
    try {
      const [nextState, nextFlights, nextEvents, nextGenerator, nextQueue] = await Promise.all([
        api.state(), api.flights(), api.events(), api.generator(), api.queue(),
      ])
      setSimulation(nextState)
      setFlights(nextFlights)
      setEvents(nextEvents)
      setGenerator(nextGenerator)
      setQueue(nextQueue)
      setError('')
      setLoading(false)
    } catch {
      setError('Connection interrupted')
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

  useEffect(() => {
    localStorage.setItem('skyline.language', language)
    void changeLanguage(language)
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    localStorage.setItem('skyline.theme', theme)
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const update = () => { document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'light' : 'dark') : theme }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [theme])

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  useEffect(() => {
    const onKey = (event:KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setShowCommand(true) }
      if (event.key === 'Escape') { setShowCommand(false); setShowFlightForm(false); setShowGenerator(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const runAction = async (name: string, operation: () => Promise<unknown>, success?: string) => {
    setBusyAction(name)
    try {
      await operation()
      await refresh()
      setError('')
      if (success) {
        setNotice(t(success))
        window.clearTimeout(noticeTimer.current)
        noticeTimer.current = window.setTimeout(() => setNotice(''), 2800)
      }
      return true
    } catch {
      setError('Action failed')
      return false
    } finally {
      setBusyAction('')
    }
  }

  const jumpTo = (item: typeof navigation[number]) => {
    navigate('/' + item.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const activeFlight = flights.find((flight) => flight.status === 'landing' || flight.status === 'taking_off')
  const waitingFlights = flights.filter((flight) => ['queued', 'approaching', 'ready', 'scheduled'].includes(flight.status))
  const emergencies = flights.filter((flight) => flight.emergency)
  const visibleQueue = waitingFlights.filter((flight) =>
    queueFilter === 'all' || (queueFilter === 'emergency' ? flight.emergency : flight.operation === queueFilter),
  )
  const visibleEvents = events.filter((event) => (eventFilter === 'all' || event.severity === eventFilter) && (!eventQuery || `${event.type} ${event.flightId} ${event.description}`.toLowerCase().includes(eventQuery.toLowerCase())))
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
  const t = (key:string) => translate(language,key)
  const dashboard = activeNav === 'dashboard'

  const compareScenarios = () => runAction(
    'compare', async () => setComparison(await api.compare()), 'Scenario comparison is ready',
  )
  const loadAndStart = (scenario: string) => runAction('scenario', async () => {
    await api.loadScenario(scenario)
    await api.control('start')
  }, t(scenarioLabels[scenario] ?? 'Scenario') + ' ' + t('started'))

  return (
    <LocalizedMarkup language={language}><div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/dashboard" onClick={(event) => { event.preventDefault(); jumpTo(navigation[0]) }}>
          <span className="brand-mark"><TowerControl size={19} strokeWidth={1.8} /></span>
          <span className="brand-copy"><strong>SKYLINE ATC</strong><small>SIMULATION · LIVE OPERATIONS</small></span>
        </a>
        <div className="airport-selector">
          <span className="airport-code">APT</span>
          <span className="airport-name"><strong>{t('Simulation airport')}</strong><small>Single runway · A / B</small></span>
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
                <span>{t(item.label)}</span>
                {item.id === 'emergencies' && emergencies.length > 0 && <em>{emergencies.length}</em>}
              </button>
            )
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-live"><span className="signal-dot" /> Simulation services online</div>
          <div className="sidebar-build">C++20 ENGINE <span>·</span> REST LINK ACTIVE</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>SKYLINE ATC</span><i>/</i><strong>{t(navigation.find((item) => item.id === activeNav)?.label ?? 'Operations overview').toUpperCase()}</strong></div>
          <div className="topbar-right">
            <label className="locale-picker" aria-label="Interface language"><select value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="kk">KK</option><option value="ru">RU</option><option value="en">EN</option></select></label>
            <label className="locale-picker theme-picker" aria-label="Color theme"><select value={theme} onChange={(event) => setTheme(event.target.value as Theme)}><option value="system">SYS</option><option value="light">LIGHT</option><option value="dark">DARK</option></select></label>
            <div className="sim-clock"><span>{t('Simulation time').toUpperCase()}</span><strong>{formatSimTime(simulation.time)}</strong></div>
            <div className={'connection-pill' + (error ? ' disconnected' : '')} role="status">
              <span className="signal-dot" />{error ? 'RECONNECTING' : 'LIVE API'}
            </div>
            <button type="button" className="command-trigger" onClick={() => setShowCommand(true)} title="Quick navigation (Ctrl+K)"><Search size={13}/><span>Ctrl K</span></button>
            {!dashboard && <button type="button" className={'button '+(simulation.running?'pause-button':'primary-button')} disabled={!!busyAction} onClick={() => void runAction('simulation',()=>api.control(simulation.running?'pause':simulation.time>0?'resume':'start'),'Simulation control updated')}>
              {simulation.running?'Pause':simulation.time>0?'Resume':'Start'}
            </button>}
            <button type="button" className="icon-button" aria-label="View emergency control" onClick={() => jumpTo(navigation[5])}>
              <Bell size={17} />{emergencies.length > 0 && <i />}
            </button>
          </div>
        </header>

        {error && (
          <div className="connection-banner" role="alert">
            <AlertTriangle size={16} /><span><strong>{t('Connection interrupted')}</strong><small>{t('The simulation API is unavailable. Check that the C++ service is running.')}</small></span>
            <button type="button" onClick={() => { setError(''); void refresh() }}>{t('Retry connection')}</button>
          </div>
        )}

        <div className={'workspace route-' + activeNav}>
          {dashboard && <>
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="signal-dot" /> {t('Air traffic management')} <i>/</i> {t(scenarioLabels[simulation.scenario] ?? titleCase(simulation.scenario)).toUpperCase()}</div>
              <h1>{t('Operations overview')}</h1>
              <p>{t('Live runway status, flight sequencing and operational performance.')}</p>
            </div>
            <div className="primary-controls" aria-label="Simulation controls">
              <button type="button" className="button quiet-button" disabled={!!busyAction} onClick={() => void runAction('step', () => api.control('step'), 'Advanced one simulation minute')}>
                <StepForward size={15} /> {t('Step')}
              </button>
              <button
                type="button"
                className={'button ' + (simulation.running ? 'pause-button' : 'primary-button')}
                disabled={!!busyAction}
                onClick={() => void runAction('simulation', () => api.control(simulation.running ? 'pause' : simulation.time > 0 ? 'resume' : 'start'), simulation.running ? 'Simulation paused' : simulation.time > 0 ? 'Simulation resumed' : 'Simulation started')}
              >
                {busyAction === 'simulation' ? <span className="button-spinner" /> : simulation.running ? <span className="pause-mark">в…Ў</span> : <Play size={14} fill="currentColor" />}
                {busyAction === 'simulation' ? t('Updating…') : t(simulation.running ? 'Pause simulation' : simulation.time > 0 ? 'Resume simulation' : 'Start simulation')}
              </button>
            </div>
          </section>
          </>}

          {dashboard && <section className="metric-grid" aria-label="Live operational metrics">
            <MetricCard icon={<Plane />} label={t('Runway movement')} value={simulation.activeFlights} hint={activeFlight ? activeFlight.number + ' · ' + t(titleCase(activeFlight.operation)) : t('No active operation')} tone="cyan" />
            <MetricCard icon={<Clock3 />} label={t('Waiting in queue')} value={simulation.waitingFlights} hint={t('Peak queue') + ' ' + simulation.statistics.maxQueueLength} tone="amber" />
            <MetricCard icon={<Check />} label={t('Completed')} value={simulation.completedFlights} hint={simulation.statistics.totalGenerated + ' ' + t('Flights generated').toLowerCase()} tone="green" />
            <MetricCard icon={<Activity />} label={t('Average queue wait')} value={simulation.statistics.averageWait.toFixed(1) + ' ' + t('min')} hint={t('Maximum current wait') + ' ' + simulation.statistics.maxWait + ' ' + t('min')} tone="blue" />
            <MetricCard icon={<Gauge />} label={t('Runway utilization')} value={simulation.statistics.runwayUtilization.toFixed(1) + '%'} hint={t('Service time / elapsed time')} tone="violet" />
            <MetricCard icon={<ShieldAlert />} label={t('Priority watch')} value={simulation.emergencyCount} hint={simulation.statistics.emergencyHandled + ' ' + t('Emergency flights handled').toLowerCase()} tone="red" />
          </section>}

          {activeNav === 'airport' && <header className="route-heading"><span className="section-kicker">SKYLINE ATC / {t('Airport surface').toUpperCase()}</span><h1>{t('Live airport surface')}</h1><p>{t('Aircraft state and service progress are synchronized to backend simulation ticks.')}</p></header>}
          {activeNav === 'events' && <header className="route-heading"><span className="section-kicker">SKYLINE ATC / {t('Event history').toUpperCase()}</span><h1>{t('Event history')}</h1><p>{t('Timestamped events reported by the simulation engine.')}</p></header>}
          {(dashboard || activeNav === 'airport') && <section className={'operations-grid' + (dashboard ? '' : ' airport-route-grid')}>
            <div className="panel airfield-panel" id="airport">
              <div className="panel-heading">
                <div><span className="section-kicker">{t('Live airfield').toUpperCase()}</span><h2>{t('Airport surface')}</h2></div>
                <div className={'runway-indicator ' + (simulation.runway === 'FREE' ? 'is-free' : 'is-active')}>
                  <span className="runway-lamp" />
                  <span><strong>{simulation.runway === 'FREE' ? t('Runway available') : t(titleCase(simulation.runway.replace('OCCUPIED_', '').replace('_', ' ')))}</strong><small>{activeFlight ? activeFlight.number + ' · ' + t(titleCase(activeFlight.operation)) : t('Runway A / B')}</small></span>
                </div>
                <div className="live-label"><span className="signal-dot" /> LIVE</div>
              </div>
              <AirportMap flights={flights} simulationTime={simulation.time} runway={simulation.runway} loading={loading} language={language} />
            </div>

            {dashboard && <div className="panel queue-panel" id="queue">
              <div className="panel-heading">
                <div><span className="section-kicker">PRIORITY SEQUENCING</span><h2>{t('Flight queue')} <span className="count-badge">{waitingFlights.length}</span></h2></div>
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
                {visibleQueue.slice(0, 7).map((flight) => <FlightRow key={flight.id} flight={flight} time={simulation.time} language={language} />)}
                {visibleQueue.length === 0 && <div className="empty-state">{loading ? 'Loading flight data…' : 'No flights in this queue filter.'}</div>}
              </div>
              <div className="queue-foot"><span>Showing {Math.min(visibleQueue.length, 7)} of {visibleQueue.length} waiting flights</span><span>FIFO + priority aging</span></div>
            </div>}
          </section>
          }

          {dashboard && <section className="lower-grid">
            <div className="panel emergency-panel" id="emergencies">
              <div className="panel-heading">
                <div><span className="section-kicker">SAFETY & PRIORITY</span><h2>{t('Emergency control')}</h2></div>
                <span className={'state-badge ' + (emergencies.length ? 'critical' : 'clear')}><span className="signal-dot" />{emergencies.length ? emergencies.length + ' ACTIVE' : 'ALL CLEAR'}</span>
              </div>
              <div className="emergency-list">
                {emergencies.slice(0, 4).map((flight) => <EmergencyRow key={flight.id} flight={flight} language={language} />)}
                {emergencies.length === 0 && <div className="calm-state"><ShieldAlert size={19} /><span>No active emergencies. Priority monitoring is on.</span></div>}
              </div>
              <div className="policy-note"><ShieldAlert size={15} /><span><strong>Dispatch policy</strong> · Critical arrivals first; then emergency arrivals by least endurance, emergency departures by severity, and aged normal traffic.</span></div>
              <button type="button" className="text-action" onClick={() => setShowFlightForm(true)}><Plus size={14} /> Create an emergency flight</button>
            </div>

            <div className="panel session-panel">
              <div className="panel-heading"><div><span className="section-kicker">SESSION PERFORMANCE</span><h2>{t('Operational statistics')}</h2></div><span className="live-small">{formatSimTime(simulation.time)}</span></div>
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
          </section>}

          {dashboard && <section className="panel analysis-panel" id="analysis">
            <div className="panel-heading analysis-heading">
              <div><span className="section-kicker">DETERMINISTIC DECISION SUPPORT</span><h2>{t('Scenario comparison')}</h2><p>Fixed seeds · shared 180-minute horizon · C++-calculated results</p></div>
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
          </section>}

          {(dashboard || activeNav === 'events') && <section className="panel events-panel" id="events">
            <div className="panel-heading">
              <div><span className="section-kicker">AUDIT TRAIL</span><h2>{t('Event log')}</h2></div>
              {activeNav === 'events' && <input className="event-search" value={eventQuery} onChange={(event)=>setEventQuery(event.target.value)} placeholder="Search events" aria-label="Search events"/>}
              <label className="event-filter">SEVERITY
                <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}>
                  <option value="all">All events</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="success">Success</option><option value="info">Info</option>
                </select>
              </label>
              {activeNav === 'events' && <button className="button quiet-button" onClick={()=>downloadCsv('skyline-events.csv',visibleEvents.map(event=>({time:event.time,type:event.type,severity:event.severity,flightId:event.flightId,description:event.description})))}>Export CSV</button>}
              <span className="live-small">{visibleEvents.length} RECORDS</span>
            </div>
            <EventTable events={visibleEvents.slice(0, activeNav === 'events' ? 100 : 10)} allEvents={events.length} loading={loading} language={language} />
          </section>
          }

          {!['dashboard','airport','events'].includes(activeNav) && <Suspense fallback={<div className="panel chart-loading">Loading workspace…</div>}><OperationalPages
            page={activeNav} flights={flights} queue={queue} events={events} comparison={comparison} experiment={experiment} simulation={simulation}
            language={language} theme={theme} busy={!!busyAction} generator={generator}
            setLanguage={setLanguage} setTheme={setTheme} onAddFlight={() => setShowFlightForm(true)} onSettings={() => setShowGenerator(true)}
            onEmergency={(flight,severity)=>{if(window.confirm(t('Declare emergency')+' '+flight.number+' · '+t('Severity')+' '+severity+'?'))void runAction('emergency',()=>api.declareEmergency(flight.id,severity),t('Emergency declared')+': '+flight.number)}}
            onScenario={(scenario) => void loadAndStart(scenario)} onCompare={() => void compareScenarios()}
            onExperiment={(config) => void runAction('experiment', async () => setExperiment(await api.experiment(config)), 'Custom experiment complete')}
            onSpeed={(speed) => void runAction('speed', () => api.speed(speed), 'Speed updated')}
            onReset={() => void runAction('reset', () => api.control('reset'), 'Simulation reset')}
          /></Suspense>}

          <footer className="workspace-footer">
            <span><TowerControl size={14} /> AIRPORT CONTROL TOWER <i>·</i> C++20 SIMULATION ENGINE</span>
            <div className="speed-controls" aria-label="Simulation speed">
              <span>SPEED</span>
              {[1, 2, 5, 10].map((speed) => (
                <button type="button" key={speed} className={simulation.speed === speed ? 'selected' : ''} aria-pressed={simulation.speed === speed} disabled={!!busyAction} onClick={() => void runAction('speed', () => api.speed(speed), 'Simulation speed set to ' + speed + 'Г—')}>{speed}Г—</button>
              ))}
            </div>
            <button type="button" className="reset-button" disabled={!!busyAction} onClick={() => void runAction('reset', () => api.control('reset'), 'Simulation reset')}><RotateCcw size={13} /> Reset</button>
          </footer>
        </div>
        <Outlet />
      </main>

      {notice && <div className="toast" role="status" aria-live="polite"><Check size={15} />{notice}</div>}
      {showFlightForm && (
        <FlightModal
          language={language}
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
          language={language}
          config={generator}
          busy={busyAction === 'generator'}
          onClose={() => setShowGenerator(false)}
          onGenerate={async () => runAction('generator', () => api.randomFlight(), 'Random flight generated')}
          onSave={async (next) => runAction('generator', async () => setGenerator(await api.configureGenerator(next)), 'Generator settings saved')}
        />
      )}
      {showCommand && <CommandPalette language={language} query={commandQuery} setQuery={setCommandQuery} onClose={() => {setShowCommand(false);setCommandQuery('')}} onRoute={(item) => {setShowCommand(false);setCommandQuery('');jumpTo(item)}} onAction={(action) => {setShowCommand(false);setCommandQuery('');if(action==='flight')setShowFlightForm(true);else if(action==='settings')setShowGenerator(true);else if(action==='step')void runAction('step',()=>api.control('step'),'Advanced one tick');else if(action==='reset')void runAction('reset',()=>api.control('reset'),'Simulation reset');else void runAction('simulation',()=>api.control(simulation.running?'pause':simulation.time>0?'resume':'start'),'Simulation control updated')}} />}
    </div></LocalizedMarkup>
  )
}

function CommandPalette({language,query,setQuery,onClose,onRoute,onAction}:{language:Language;query:string;setQuery:(q:string)=>void;onClose:()=>void;onRoute:(item:typeof navigation[number])=>void;onAction:(action:string)=>void}){
  const t=(key:string)=>translate(language,key)
  const routes=navigation.filter(item=>t(item.label).toLowerCase().includes(query.toLowerCase()))
  const commands=[{id:'simulation',label:'Start / pause simulation'},{id:'step',label:'Advance one simulation tick'},{id:'flight',label:'Create a flight'},{id:'settings',label:'Open traffic generator settings'},{id:'reset',label:'Reset current simulation'}].filter(item=>t(item.label).toLowerCase().includes(query.toLowerCase()))
  return <LocalizedMarkup language={language}><div className="command-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><section className="command-palette" role="dialog" aria-modal="true" aria-label={t('Quick navigation')}><div className="command-search"><Search size={17}/><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder={t('Search pages and actions…')} onKeyDown={event=>{if(event.key==='Escape')onClose();if(event.key==='Enter'&&routes[0])onRoute(routes[0])}}/><kbd>ESC</kbd></div><div className="command-section"><span>WORKSPACES</span>{routes.map(item=><button type="button" key={item.id} onClick={()=>onRoute(item)}><item.icon size={15}/>{t(item.label)}<kbd>↵</kbd></button>)}{!routes.length&&<small>No matching pages</small>}</div><div className="command-section"><span>SIMULATION ACTIONS</span>{commands.map(item=><button type="button" key={item.id} onClick={()=>onAction(item.id)}><span className="command-dot"/>{t(item.label)}<kbd>↵</kbd></button>)}</div></section></div></LocalizedMarkup>
}

function MetricCard({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: string | number; hint: string; tone: string }) {
  return (
    <motion.article className="metric-card" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
      <div className={'metric-icon ' + tone}>{icon}</div><span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong><span className="metric-hint">{hint}</span>
    </motion.article>
  )
}

function FlightRow({ flight, time, language }: { flight: Flight; time: number; language: Language }) {
  const isEmergency = flight.emergency
  const wait = flight.queueEntered >= 0 ? queueWait(flight, time) : 0
  const priority = isEmergency ? 'P' + String(4 - flight.severity) : 'NORMAL'
  return (
    <LocalizedMarkup language={language}><article className={'flight-row' + (isEmergency ? ' urgent-row' : '')}>
      <span className={'operation-icon ' + flight.operation}>{flight.operation === 'arrival' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}</span>
      <span className="flight-main"><strong>{flight.number}{isEmergency && <em>EMERGENCY</em>}</strong><small>{flight.airline} · {flight.aircraft}</small></span>
      <span className="fuel-cell"><strong className={flight.fuel <= 15 ? 'fuel-critical' : ''}>{Math.floor(flight.fuel)}%</strong><small>FUEL</small></span>
      <span className="priority-cell"><b className={isEmergency ? 'priority-emergency' : ''}>{priority}</b><small>{titleCase(flight.status)}</small></span>
      <span className="wait-cell">{wait}<small>MIN</small></span>
    </article></LocalizedMarkup>
  )
}

function EmergencyRow({ flight, language }: { flight: Flight; language: Language }) {
  const fuelWidth = Math.max(0, Math.min(100, flight.fuel))
  return (
    <LocalizedMarkup language={language}><div className="emergency-row">
      <span className="emergency-symbol"><AlertTriangle size={15} /></span>
      <span className="emergency-copy"><strong>{flight.number}<small>{flight.aircraft}</small></strong><span>{titleCase(flight.operation)} · Severity {flight.severity}</span></span>
      <span className="fuel-gauge"><span><small>FUEL</small><b>{Math.floor(flight.fuel)}%</b></span><i><b style={{ width: fuelWidth + '%' }} /></i></span>
    </div></LocalizedMarkup>
  )
}

function StatRow({ label, value, alert = false }: { label: string; value: string | number; alert?: boolean }) {
  return <div className="stat-row"><span>{label}</span><strong className={alert ? 'stat-alert' : ''}>{value}</strong></div>
}

function EventTable({ events, allEvents, loading, language }: { events: Event[]; allEvents: number; loading: boolean; language: Language }) {
  if (!events.length) return <LocalizedMarkup language={language}><div className="empty-state event-empty">{loading ? 'Loading event records…' : allEvents ? 'No events match this severity.' : 'No events have been recorded yet.'}</div></LocalizedMarkup>
  return (
    <LocalizedMarkup language={language}><div className="event-table">
      <div className="event-header"><span>SIM TIME</span><span>EVENT</span><span>FLIGHT</span><span>DESCRIPTION</span><span>SEVERITY</span></div>
      {events.map((event, index) => (
        <div className="event-row" key={event.time + event.flightId + event.type + index}>
          <span>{formatSimTime(event.time)}</span><span>{titleCase(event.type)}</span><span>{event.flightId || '—'}</span><span>{event.description}</span><b className={'severity ' + event.severity}>{event.severity}</b>
        </div>
      ))}
    </div></LocalizedMarkup>
  )
}

function FlightModal({ language, busy, onClose, onSave }: {
  language: Language
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
    <LocalizedMarkup language={language}><div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
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
    </div></LocalizedMarkup>
  )
}

function GeneratorModal({ language, config, busy, onClose, onGenerate, onSave }: {
  language: Language
  config: GeneratorConfig
  busy: boolean
  onClose: () => void
  onGenerate: () => Promise<boolean>
  onSave: (config: GeneratorConfig) => Promise<boolean>
}) {
  const [draft, setDraft] = useState(config)
  const edit = (patch: Partial<GeneratorConfig>) => setDraft((previous) => ({ ...previous, ...patch }))
  return (
    <LocalizedMarkup language={language}><div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
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
        <div className="form-columns">
          <label>Landing duration (ticks)<input type="number" min="1" max="10" value={draft.landingDuration} onChange={(event) => edit({ landingDuration: Number(event.target.value) })} /></label>
          <label>Takeoff duration (ticks)<input type="number" min="1" max="10" value={draft.takeoffDuration} onChange={(event) => edit({ takeoffDuration: Number(event.target.value) })} /></label>
        </div>
        <label>Runway clearing (ticks)<input type="number" min="1" max="5" value={draft.clearingDuration} onChange={(event) => edit({ clearingDuration: Number(event.target.value) })} /></label>
        <div className="modal-actions split-actions"><button type="button" className="button quiet-button" disabled={busy} onClick={() => void onGenerate()}><Radio size={14} /> Generate one flight</button><button type="submit" className="button primary-button" disabled={busy}>{busy ? <span className="button-spinner" /> : <Check size={14} />}{busy ? 'Saving…' : 'Apply settings'}</button></div>
      </form>
    </div></LocalizedMarkup>
  )
}

function RouteOutlet() { return <Outlet /> }

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route element={<AppShell />}>
        {navigation.map((item) => <Route key={item.id} path={item.id} element={<RouteOutlet />} />)}
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
