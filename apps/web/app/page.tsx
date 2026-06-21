"use client";

import ApplicationBuilder from "../components/ApplicationBuilder";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black font-sans antialiased flex flex-col justify-between">
      {/* Top Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center font-mono font-black text-black text-xs">
            D
          </div>
          <span className="font-mono tracking-wider font-bold text-sm uppercase">Dockyard</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest">Local Server Online</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-12 flex flex-col justify-center">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Deploy Frontend Projects</h1>
          <p className="text-zinc-400 text-sm">
            Enter a public GitHub repository link to build, compile, and host your static frontend application on Dockyard's serverless simulation.
          </p>
        </div>

        <ApplicationBuilder />
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 px-6 py-4 text-center">
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
          © {new Date().getFullYear()} Dockyard. All rights reserved.
        </span>
      </footer>
    </div>
  );
}
