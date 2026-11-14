# AirportControlTower

AirportControlTower is a university simulation project for **6-топ. Airport Control Tower — Әуежай диспетчері**. It models arrivals and departures sharing one runway, fuel use, emergency handling, event logging, and priority-based dispatch. The dashboard reads live state and statistics from the C++ engine.

## Technologies

- C++20 simulation engine, Crow HTTP API, `std::priority_queue`, `std::mt19937`, mutex and condition variable
- CMake and vcpkg (`Crow`, `x64-windows`)
- React 19, TypeScript, Vite, React Router, i18next/react-i18next, Recharts, Motion, Lucide
- CTest for deterministic C++ scheduling and integration tests

## Architecture

```text
backend/include/simulation.hpp     Simulation state, scheduling, scenarios, statistics
backend/src/main.cpp               Crow HTTP API and background runner
backend/tests/                     C++ tests and API concurrency check
frontend/src/services/api.ts       Typed HTTP client
frontend/src/App.tsx               React Router shell, live dashboard, controls and global command palette
frontend/src/components/AirportMap.tsx  Backend-state airport visualization
frontend/src/components/OperationalPages.tsx  Radar, flight, queue, runway, scenario, analytics, settings and help workspaces
docs/ALGORITHMS.md                 Implemented scheduling and statistic definitions
docs/DEFENSE_GUIDE_KK.md           Kazakh-language presentation guide
```

The simulation engine owns the source of truth. The React client polls the API; the airport map derives aircraft status and movement progress from flight status, service start, duration, and simulation time. It does not create independent flight motion.

## Features

- Live arrival/departure queue, fuel levels, emergency severity, runway status, and event history
- Start, pause, resume, single-tick step, reset, and 1×/2×/5×/10× speed controls
- Manual flight and emergency creation, configurable random traffic, and three reproducible scenarios
- Scenario comparisons with average wait, operation-specific delay, completed flights, queue peak, emergency handling, and runway utilization
- Interactive airport schematic with runway markings, taxiways, holding areas, aircraft selection, status details, and zoom
- Responsive dark operations dashboard with filters, loading/error feedback, and keyboard-operable controls
- Thirteen routed workspaces, browser-persisted Light/Dark/System theme, Kazakh-default language selection, and Ctrl+K command palette
- C++-provided scheduler rationale and explicitly synthetic radar projection fields
- Deterministic custom experiment endpoint with configurable horizon, seed, traffic rates, fuel range, service durations, and clearing duration

## Priority queue and emergency policy

The dispatcher rebuilds a C++ `std::priority_queue` from the current eligible queue before each runway dispatch. This recalculates aging and fuel-based urgency every tick. Severity-3 emergency arrivals rank first. Other emergency arrivals rank next, ordered by lower predicted fuel endurance (`fuel / burn rate`). Emergency departures follow, ordered by severity descending. Normal flights age one tier per 12 minutes and reach the shared emergency-arrival tier after 24 minutes. Ties use earlier queue entry, then stable flight ID. See [docs/ALGORITHMS.md](docs/ALGORITHMS.md) for exact ordering and edge cases.

An emergency may reorder waiting traffic but cannot interrupt a landing or takeoff already in progress. A single active-flight index owns the runway. The runway passes through a clearing state before the next dispatch.

## Statistics

- **Average waiting time:** mean of `serviceStart - queueEntered` for completed flights.
- **Average arrival/departure delay:** mean of `max(0, serviceStart - scheduledTime)` for completed flights of that operation.
- **Completed flights:** flights whose runway service completed.
- **Queue length:** queued, approaching, and ready flights; scheduled and active flights are excluded.
- **Maximum queue length:** highest eligible waiting count sampled by the simulation.
- **Runway utilization:** occupied service ticks divided by elapsed simulation ticks; clearing ticks are excluded.
- **Emergency flights handled:** completed flights marked emergency.
- **Diversions:** aircraft diverted after fuel endurance reached zero while waiting.

Empty averages and utilization return zero, so the API does not emit NaN or Infinity. Definitions and denominators are documented in [docs/ALGORITHMS.md](docs/ALGORITHMS.md).

## Scenarios

Each comparison runs for the same 180 simulation-minute horizon using fixed seeds.

| Scenario | Seed | Flights | Traffic profile |
| --- | ---: | ---: | --- |
| Normal operations | 731 | 14 | 3-minute schedule spacing; 1-in-16 emergency chance |
| Heavy traffic | 1942 | 30 | 2-minute spacing; 1-in-8 emergency chance |
| Emergency overload | 5813 | 24 | Seven emergency flights; first five share the initial schedule time |

Arrival and departure traffic alternates in preset data. Scenario comparisons run on a temporary simulation snapshot and restore the live simulation afterward.

## Requirements

- Windows with Visual Studio 2026 C++ workload (or a compatible C++20 compiler and CMake generator)
- CMake 3.25 or newer
- vcpkg with Crow installed for `x64-windows`
- Node.js and npm

The commands below use the existing vcpkg checkout at `C:/ENT/vcpkg`; update the path if yours differs.

## Build and run the backend

From an x64 Visual Studio Developer PowerShell at the repository root:

```powershell
cmake -S . -B build-vs18 -G "Visual Studio 18 2026" -A x64 -DCMAKE_TOOLCHAIN_FILE=C:/ENT/vcpkg/scripts/buildsystems/vcpkg.cmake
cmake --build build-vs18 --config Release
ctest --test-dir build-vs18 -C Release --output-on-failure
./build-vs18/Release/airport-control-tower.exe
```

The backend listens on `http://127.0.0.1:8080`. If your Visual Studio installation registers another generator name, select it with `cmake -G` while keeping the x64 architecture and vcpkg toolchain.

## Run the frontend

In a second terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). Vite proxies `/api` to the local backend. For a production bundle, run `npm run build`; `npm run lint` checks the frontend source.

## API

All endpoints are served from port 8080. The frontend client contract is in [frontend/src/services/api.ts](frontend/src/services/api.ts); request validation is implemented in `backend/src/main.cpp`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Liveness and engine identity |
| GET | `/api/simulation/state` | Time, running state, speed, runway, live counts, statistics |
| POST | `/api/simulation/start`, `/pause`, `/resume`, `/reset`, `/step` | Simulation controls |
| POST | `/api/simulation/speed` | Set speed to 1, 2, 5, or 10 |
| GET / POST | `/api/flights` | Read live flights / add a flight |
| GET | `/api/queue/explain` | C++ priority order, tier, wait, endurance, and scheduling rationale |
| POST | `/api/flights/random` | Generate a flight from configured random traffic |
| GET | `/api/runway` | Runway state, active count, and safety invariant |
| GET | `/api/statistics` | Current backend statistics |
| GET | `/api/events` | Event log |
| GET | `/api/scenarios` | Scenario metadata |
| POST | `/api/scenarios/load` | Load `normal`, `heavy`, or `overload` |
| POST | `/api/scenarios/compare` | Run deterministic 180-minute comparison |
| POST | `/api/scenarios/experiment` | Run an isolated custom deterministic experiment; live state is restored afterward |
| GET / POST | `/api/generator`, `/api/generator/config` | Read / configure random traffic |

Example request bodies:

```json
{"speed":5}
{"operation":"arrival","number":"KC204","aircraft":"A320","fuel":52,"emergency":true,"severity":3}
{"scenario":"overload"}
```

## Tests

The C++ suite is registered with CTest and covers priority ordering, emergency and fuel escalation, tie-breaking, aging fairness, runway occupancy and clearing, pause/resume/reset/speed, deterministic scenarios, statistics, generation, queue explanations, custom experiment isolation, and concurrent requests.

```powershell
cmake --build build-vs18 --config Release
ctest --test-dir build-vs18 -C Release --output-on-failure
cd frontend
npm run lint
npm run build
cd ..
node backend/tests/api_concurrency.mjs
```

The API concurrency check requires the backend to be running. More detail on the scheduling rules is in [docs/ALGORITHMS.md](docs/ALGORITHMS.md); the Kazakh defense outline is in [docs/DEFENSE_GUIDE_KK.md](docs/DEFENSE_GUIDE_KK.md).
