# Dockyard - Frontend Deployment Platform

Dockyard is a modern, frontend deployment platform that **builds, hosts, and streams real-time logs** for web applications. Users can submit a public GitHub repository link; the platform automatically clones the source code, triggers the compilation pipeline, and serves the build outputs via unique local and production-grade URLs.

## Features

- **Instant Deployment**: Submit a repository link to trigger automated build processes.
- **Real-Time Terminal Streaming**: Watch clone, install, compile, and upload stages execute live in a monospace web terminal.
- **Local S3 Simulation**: Zero AWS credential dependencies. Deployments are stored and served from a local mocked filesystem bucket.
- **Flexible Path Routing**: Access deployed websites via custom subdomain routing (`*.localhost:4000`) or clean path-based routing (`localhost:4000/deployments/{id}`).

## Tech Stack

- **Frontend/Backend**: Next.js 15 (React 19)
- **Log Subscriptions**: Redis Pub/Sub, Socket.IO
- **Process Orchestration**: Turborepo Monorepo
- **Storage Layer**: Local simulated S3 directory bucket

---

## System Architecture

```mermaid
graph TD
    User([Developer UI]) -->|1. Submit Repo Link| Web[Web Service: Port 3001]
    Web -->|2. Clone & Stage Output| LocalS3[(Local S3 Folder)]
    Web -->|3. Push Task to Queue| Redis[(Redis Broker)]
    Redis -->|4. Pull Build Task| Builder[Builder Service]
    Builder -->|5. Install & Run Build| Builder
    Builder -->|6. Write Output & Logs| LocalS3
    Builder -->|7. Publish Complete Event| Redis
    Redis -->|8. Stream Logs via Sockets| User
    Handler[Request Handler: Port 4000] -->|9. Serve Static Build Files| LocalS3
```

---

## Local Setup

1. **Clone the Repository**
2. **Install Workspace Dependencies**
   ```bash
   npm install
   ```
3. **Launch Redis Server**
   Ensure a local Redis instance is running on port `6379`. (If using our portable Redis bin, start it via `redis-bin/redis-server.exe`).
4. **Run Dev Environment**
   ```bash
   npm run dev
   ```
5. **Access the platform**:
   - Dashboard: `http://localhost:3001`
   - Request Handler: `http://localhost:4000`

---

## Project Screenshots

### 1. Dashboard Landing (Empty State)
![Dashboard Landing](docs/images/dockyard-screenshot-1.png)

### 2. Live Build Terminal Logs & Status
![Live Build Logs](docs/images/dockyard-screenshot-2.png)

### 3. Deployed App (Light Mode Preview)
![Light Mode Preview](docs/images/dockyard-screenshot-3.png)

### 4. Deployed App (Dark Mode Preview)
![Dark Mode Preview](docs/images/dockyard-screenshot-4.png)
