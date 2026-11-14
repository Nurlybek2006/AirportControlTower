# Airport Control Tower

## Scheduling policy

Simulation time is an integer count of deterministic one-minute ticks. The background runner is only a driver; the tick is the source of scheduling time. `POST /api/simulation/step` advances exactly one tick.

Waiting aircraft are re-evaluated on every tick. Ordering is: (1) severity-3 emergency arrivals, (2) other emergency arrivals, with least predicted fuel endurance first within that group, (3) emergency departures by severity descending, then (4) normal traffic. Normal traffic ages one priority level per 12 minutes of queue wait; ties are resolved by queue entry tick and then flight ID. New emergencies can reorder waiting aircraft, but never displace an aircraft already using the runway.

The runway service durations are two ticks for takeoff and three for landing, followed by one clearing tick. A single `active_` index owns the runway. Queue waiting is service start minus queue entry. Arrival and departure delay are the positive difference between service start and scheduled tick, averaged only over completed flights of the corresponding operation. Utilization is runway service ticks divided by elapsed simulation ticks. Comparisons run each fixed scenario to a 120 or 180 tick horizon with fixed seeds.

Fuel burns while waiting and during runway service. A normal flight reaching 15 fuel is escalated to emergency priority and logged. A flight at zero fuel is diverted and logged. Fuel is clamped at zero. Events are retained in memory and appended to `events.log`.

## Build

From a Visual Studio Developer PowerShell configured for x64:

```powershell
cmake -S . -B build -G "Visual Studio 18 2026" -A x64 -DCMAKE_TOOLCHAIN_FILE=C:/ENT/vcpkg/scripts/buildsystems/vcpkg.cmake
cmake --build build --config Release
./build/Release/airport-control-tower.exe
```

If the installed Visual Studio edition registers a different generator name, use `cmake -G` to select its x64 generator. Crow is consumed through the existing `x64-windows` vcpkg installation.

## API

The server listens on port 8080. Endpoints include health, state, start/pause/resume/reset/step/speed controls, flight listing and creation, runway, statistics, events, scenario listing/loading, and scenario comparison. JSON request examples:

```json
{"speed":5}
{"operation":"arrival","number":"KC204","aircraft":"A320","fuel":52,"emergency":true,"severity":3}
{"scenario":"overload"}
```
