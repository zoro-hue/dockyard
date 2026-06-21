"use client"

import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useEffect, useState, useRef } from "react";
import { socket } from "@/lib/socket";
import Link from "next/link";

export default function ApplicationBuilder() {
    const [isConnected, setIsConnected] = useState(false);
    const [status, setStatus] = useState<null | string>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
    const [deployUrl, setDeployUrl] = useState<string>("");
    const [publicUrl, setPublicUrl] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);
    
    const terminalEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (socket.connected) {
            setIsConnected(true);
        }

        socket.on("connect", () => setIsConnected(true));
        socket.on("disconnect", () => setIsConnected(false));

        return () => {
            socket.off("connect");
            socket.off("disconnect");
        };
    }, []);

    useEffect(() => {
        if (terminalEndRef.current) {
            terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [uploadedFiles, status]);

    async function upload(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const repositoryUrl = formData.get("repositoryUrl");

        if (!repositoryUrl) return;

        setIsLoading(true);
        setStatus("initiating");
        setUploadProgress(0);
        setUploadedFiles([]);
        setDeployUrl("");
        setPublicUrl("");

        try {
            const response = await fetch("/api/upload", {
                method: "POST",
                body: JSON.stringify({ repositoryUrl }),
            });

            const responseData = await response.json();
            const deploymentId = responseData.id;

            socket.emit("subscribe:upload-progress", deploymentId);

            socket.on("uploader:upload-progress", (data) => {
                setStatus("uploading");
                setUploadProgress(data.percentage);
                setUploadedFiles(prev => [...prev, `[uploader] Uploaded: ${data.file}`]);
            });
            socket.on("builder:download", (data) => {
                setStatus("downloading");
                setUploadedFiles(prev => [...prev, `[builder] Cloned/Downloaded: ${data.file}`]);
            });
            socket.on("builder:build", (data) => {
                setStatus("building");
                setUploadedFiles(prev => [...prev, `[builder] Build Output: ${data.data}`]);
            });
            socket.on("builder:upload-output", (data) => {
                setStatus("publishing");
                setUploadedFiles(prev => [...prev, `[builder] Published: ${data.file}`]);
            });
            socket.on("DONE", (data) => {
                setStatus("complete");
                setDeployUrl(data?.url);
                setPublicUrl(data?.publicUrl);
                setIsLoading(false);
            });
        } catch (err: any) {
            setStatus("error");
            setUploadedFiles(prev => [...prev, `[error] Deployment failed: ${err.message}`]);
            setIsLoading(false);
        }
    }

    return (
        <div className="space-y-6">
            {/* Input Form */}
            <form onSubmit={upload} className="space-y-4">
                <div className="flex gap-2">
                    <Input 
                        name="repositoryUrl" 
                        placeholder="https://github.com/username/project" 
                        required
                        disabled={isLoading}
                        className="bg-black border border-zinc-800 focus:border-white focus:ring-0 text-white rounded-none px-4 py-3 placeholder:text-zinc-600 text-sm flex-1 transition"
                    />
                    <Button 
                        type="submit" 
                        disabled={isLoading}
                        className="bg-white hover:bg-zinc-200 text-black font-mono font-bold uppercase text-xs rounded-none px-6 py-3 tracking-widest transition disabled:opacity-50"
                    >
                        {isLoading ? "Deploying..." : "Deploy"}
                    </Button>
                </div>
            </form>

            {/* Terminal Logs & Progress */}
            {status && (
                <div className="border border-zinc-800 bg-zinc-950/50 p-4 font-mono text-xs text-zinc-400 space-y-4">
                    {/* Status and Progress Bar */}
                    <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${status === "complete" ? "bg-emerald-500" : status === "error" ? "bg-red-500" : "bg-yellow-500 animate-pulse"}`} />
                            <span className="uppercase text-[10px] tracking-wider text-white">Status: {status}</span>
                        </div>
                        {status === "uploading" && (
                            <span className="text-[10px] text-white font-bold">{uploadProgress}%</span>
                        )}
                    </div>

                    {/* Minimal Progress Line */}
                    {status === "uploading" && (
                        <div className="w-full bg-zinc-900 h-0.5 overflow-hidden">
                            <div 
                                className="bg-white h-full transition-all duration-300" 
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                    )}

                    {/* Scrollable Terminal Output */}
                    <div className="h-64 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-800 pr-2 select-text">
                        {uploadedFiles.length === 0 ? (
                            <div className="text-zinc-600 italic">Initializing build pipeline...</div>
                        ) : (
                            uploadedFiles.map((log, index) => (
                                <div key={index} className="leading-relaxed break-all whitespace-pre-wrap">
                                    {log}
                                </div>
                            ))
                        )}
                        <div ref={terminalEndRef} />
                    </div>
                </div>
            )}

            {/* Deployment Result Panel */}
            {publicUrl && (
                <div className="border border-zinc-800 bg-zinc-950/20 p-5 space-y-4">
                    <div className="flex items-center gap-2 text-white font-mono text-xs uppercase tracking-wider font-semibold">
                        <span>✔ Deployment Finished Successfully</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                        <div className="space-y-1">
                            <span className="text-zinc-500 block uppercase tracking-widest text-[9px]">Production URL</span>
                            <Link 
                                href={publicUrl} 
                                target="_blank" 
                                className="text-white hover:underline hover:text-zinc-300 transition break-all block"
                            >
                                {publicUrl}
                            </Link>
                        </div>
                        <div className="space-y-1">
                            <span className="text-zinc-500 block uppercase tracking-widest text-[9px]">Local Access URL</span>
                            <Link 
                                href={deployUrl} 
                                target="_blank" 
                                className="text-white hover:underline hover:text-zinc-300 transition break-all block"
                            >
                                {deployUrl}
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
