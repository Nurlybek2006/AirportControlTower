# Airport Control Tower

## Scheduling policy

Simulation time is an integer count of deterministic one-minute ticks. The background runner is only a driver; the tick is the source of scheduling time. `POST /api/simulation/step` advances exactly one tick.

Waiting aircraft are re-evaluated on every tick. Before dispatch, a `std::priority_queue` is rebuilt from current waiting state so changing fuel and age priorities cannot leave stale heap keys. Ordering is: (1) severity-3 emergency arrivals, (2) other emergency arrivals, with least predicted fuel endurance first when two emergency arrivals compete, (3) emergency departures by severity descending, then (4) normal traffic. Normal traffic ages one priority level per 12 minutes of queue wait and reaches the shared second tier after 24 minutes; oldest queue entry wins within an aging tier. Critical arrivals remain strictly first. New emergencies can reorder waiting aircraft, but never displace an aircraft already using the runway.

The runway service durations are two ticks for takeoff and three for landing, followed by one clearing tick. A single `active_` index owns the runway. Queue waiting is service start minus queue entry. Arrival and departure delay are the positive difference between service start and scheduled tick, averaged only over completed flights of the corresponding operation. Utilization is runway service ticks divided by elapsed simulation ticks. Comparisons run each fixed scenario to a 120 or 180 tick horizon with fixed seeds.

## Built-in generation presets

The deterministic random generator uses `std::mt19937`; the scenario seeds, generated traffic volumes, and inter-flight spacing are fixed:

| Scenario | Seed | Flights | Scheduled spacing | Emergency chance | Fuel range |
| --- | ---: | ---: | ---: | ---: | ---: |
| Normal operations | 731 | 14 | 3 min | 1 in 16 | 70–99 points |
| Heavy traffic | 1942 | 30 | 2 min | 1 in 8 | 70–99 points |
| Emergency overload | 5813 | 24 | 2 min, first five simultaneous | First seven emergency | 35–79 points |

Arrival and departure operations alternate, producing an even ratio in the presets. Users can add a manual arrival or departure, select one of the three traffic levels, and choose its emergency status and severity.

The Settings navigation opens generator controls. Automatic generation is off by default; when enabled, configured flights are created at the selected tick interval with the requested arrival share, fuel range, emergency probability, and seed. `POST /api/flights/random` adds one generated flight on demand. `GET /api/generator` and `POST /api/generator/config` read and update these settings. Scenario comparisons temporarily use only their fixed preset traffic and leave the live generator settings and simulation state intact.

Fuel is measured in fuel points; the configured burn rate consumes points per simulation minute while queued or approaching. A normal flight reaching 15 fuel points is escalated to emergency priority and logged. A flight at zero fuel is diverted and logged. Fuel is clamped at zero. Events are retained in memory and appended to `events.log`.

## Build

From a Visual Studio Developer PowerShell configured for x64:

```powershell
cmake -S . -B build-vs18 -G "Visual Studio 18 2026" -A x64 -DCMAKE_TOOLCHAIN_FILE=C:/ENT/vcpkg/scripts/buildsystems/vcpkg.cmake
cmake --build build-vs18 --config Release
./build-vs18/Release/airport-control-tower.exe
```

If the installed Visual Studio edition registers a different generator name, use `cmake -G` to select its x64 generator. Crow is consumed through the existing `x64-windows` vcpkg installation.

## API

The server listens on port 8080:

- `GET /api/health`, `/api/simulation/state`, `/api/flights`, `/api/runway`, `/api/statistics`, `/api/events`, `/api/scenarios`, `/api/generator`
- `POST /api/simulation/start`, `/pause`, `/resume`, `/reset`, `/step`, `/speed`
- `POST /api/flights`, `/api/flights/random`, `/api/generator/config`, `/api/scenarios/load`, `/api/scenarios/compare`

JSON request examples:

```json
{"speed":5}
{"operation":"arrival","number":"KC204","aircraft":"A320","fuel":52,"emergency":true,"severity":3}
{"scenario":"overload"}
```
