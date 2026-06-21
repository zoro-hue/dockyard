"use client"

import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";
import { string } from "zod";
import Link from "next/link";

export default function ApplicationBuilder() {
    const [isConnected, setIsConnected] = useState(false);
    const [transport, setTransport] = useState("N/A");
    const [status, setStatus] = useState<null | string>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
    const [deployUrl, setDeployUrl] = useState<string>("");
    const [publicUrl, setPublicUrl] = useState<string>("");


    useEffect(() => {
        if (socket.connected) {
            onConnect();
        }

        function onConnect() {
            setIsConnected(true);
            setTransport(socket.io.engine.transport.name);

            socket.io.engine.on("upgrade", (transport) => {
                setTransport(transport.name);
            });
        }

        function onDisconnect() {
            setIsConnected(false);
            setTransport("N/A");
        }

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);

        return () => {
            socket.off("connect", onConnect);
            socket.off("disconnect", onDisconnect);
        };
    }, []);

    async function upload(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const repositoryUrl = formData.get("repositoryUrl");

        if (!repositoryUrl) return;

        const response = await fetch("/api/upload", {
            method: "POST",
            body: JSON.stringify({ repositoryUrl }),
        });

        const responseData = await response.json();

        console.log("responseData");
        console.log(responseData);

        const deploymentId = responseData.id;

        socket.emit("subscribe:upload-progress", deploymentId);

        socket.on("uploader:upload-progress", (data) => {
            setStatus("uploading");
            setUploadProgress(data.percentage);
            setUploadedFiles(prevUploadedFiles => [...prevUploadedFiles, data.file])
        });
        socket.on("builder:download", (data) => {
            setStatus("Builder downloading");
            // setUploadProgress(data.percentage);
            setUploadedFiles(prevUploadedFiles => [...prevUploadedFiles, data.file])
        });
        socket.on("builder:build", (data) => {
            setStatus("Build complete");
            // setUploadProgress(data.percentage);
            setUploadedFiles(prevUploadedFiles => [...prevUploadedFiles, data.data])
        });
        socket.on("builder:upload-output", (data) => {
            setStatus("Uploading build output");
            // setUploadProgress(data.percentage);
            setUploadedFiles(prevUploadedFiles => [...prevUploadedFiles, data.file])
        });
        socket.on("DONE", (data) => {
            setStatus(`Project deployed!`);
            setDeployUrl(data?.url);
            setPublicUrl(data?.publicUrl);
        });
    }


    return (
        <div>
            <form onSubmit={upload}>
                <div className="flex gap-4">
                    <Input name="repositoryUrl" />
                    <Button>Upload</Button>
                </div>
            </form>
            <div>
                {publicUrl && (
                    <div className="mt-4 p-4 border border-green-500 rounded bg-green-950/30 flex flex-col gap-2">
                        <div className="font-bold text-green-400">🚀 Project Deployed Successfully!</div>
                        <div>
                            <span className="font-semibold">Public URL: </span>
                            <Link href={publicUrl} className="underline text-blue-400 font-mono" target="_blank">
                                {publicUrl}
                            </Link>
                        </div>
                        <div>
                            <span className="font-semibold">Local Preview URL: </span>
                            <Link href={deployUrl} className="underline text-blue-400 font-mono" target="_blank">
                                {deployUrl}
                            </Link>
                        </div>
                    </div>
                )}
            </div>
            {
                status && <>
                    <div>
                        Current Status - {status}
                    </div>
                    <div>
                        Uploading progress - {uploadProgress} %
                    </div>
                    {uploadedFiles.map((uploadedFile: string) => (
                        <div>
                            {uploadedFile}
                        </div>
                    ))}
                </>
            }
        </div>
    );
}
