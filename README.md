# Airport Control Tower

A C++20 discrete-time single-runway scheduling simulation with a React operations dashboard.

## Run

Build and start the backend using the commands in [docs/architecture.md](docs/architecture.md). Then open another terminal:

```powershell
cd frontend
npm run dev
```

The Vite development server proxies `/api` to `http://127.0.0.1:8080`. Backend endpoints are documented in [docs/architecture.md](docs/architecture.md).
