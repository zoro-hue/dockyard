import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { createClient } from 'redis'

import { deploymentEvents } from "./app/lib/events.js";

const hostname = 'localhost';
const port = parseInt(process.env.PORT || "3001", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handler = app.getRequestHandler();
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const subscriber = createClient({ url: redisUrl });
subscriber.on('error', (err) => console.warn('[Redis Subscriber Warning]', err.message));

(async () => {
    try {
        if (!subscriber.isOpen) {
            await subscriber.connect();
        }
    } catch (err: any) {
        console.warn('[Redis Connect Warning]', err.message);
    }
})();

app.prepare().then(() => {
    const httpServer = createServer(async (req, res) => {
        try {
            const parsedUrl = parse(req.url!, true);
            await handler(req, res, parsedUrl);
        } catch (err) {
            console.error("Error handling request:", req.url, err);
            res.statusCode = 500;
            res.end("Internal Server Error");
        }
    });
    const io = new Server(httpServer);

    io.on("connection", (socket) => {
        const subClient = subscriber.duplicate();
        subClient.on('error', (err) => console.warn('[Redis SubClient Warning]', err.message));

        let activeDeploymentId = "";
        const onLocalEvent = (payload: { deploymentId: string; eventName: string; data: any }) => {
            if (activeDeploymentId === payload.deploymentId) {
                socket.emit(payload.eventName, payload.data);
            }
        };

        deploymentEvents.on("event", onLocalEvent);

        socket.on("subscribe:upload-progress", async (deploymentId) => {
            activeDeploymentId = deploymentId;
            console.log(`Socket ${socket.id} subscribed to deployment: ${deploymentId}`);

            // Replay buffered events to eliminate subscription race conditions
            const history = deploymentEvents.getEvents(deploymentId);
            for (const item of history) {
                socket.emit(item.eventName, item.data);
            }
            try {
                if (!subClient.isOpen) {
                    await subClient.connect();
                }

                const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || "https://dockyard-web.onrender.com";

                const status = await subscriber.hGet("status", deploymentId);
                if (status === "build-complete") {
                    socket.emit("DONE", {
                        url: `${publicBaseUrl}/api/serve/${deploymentId}`,
                        publicUrl: `${publicBaseUrl}/api/serve/${deploymentId}`
                    });
                }

                await subClient.subscribe(`deployment:${deploymentId}:uploader:upload-progress`, (message) => {
                    socket.emit("uploader:upload-progress", JSON.parse(message));
                });
                await subClient.subscribe(`deployment:${deploymentId}:builder:download`, (message) => {
                    socket.emit("builder:download", JSON.parse(message));
                });
                await subClient.subscribe(`deployment:${deploymentId}:builder:build`, (message) => {
                    socket.emit("builder:build", JSON.parse(message));
                });
                await subClient.subscribe(`deployment:${deploymentId}:builder:upload-output`, (message) => {
                    socket.emit("builder:upload-output", JSON.parse(message));
                });
                await subClient.subscribe(`deployment:${deploymentId}:builder:complete`, (message) => {
                    socket.emit("DONE", JSON.parse(message));
                });
            } catch (err: any) {
                console.warn('[Redis Subscription Warning]', err.message);
            }
        });

        socket.on('disconnect', async () => {
            deploymentEvents.off("event", onLocalEvent);
            if (subClient.isOpen) {
                await subClient.disconnect();
            }
        });
    });

    httpServer
        .once("error", (err) => {
            console.error(err);
            process.exit(1);
        })
        .listen(port, () => {
            console.log(`> Ready on http://${hostname}:${port}`);
        });
});