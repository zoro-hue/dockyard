import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { createClient } from 'redis'

const hostname = 'localhost';
const port = parseInt(process.env.PORT || "3001", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handler = app.getRequestHandler();
const subscriber = createClient();

(async () => {
    if (!subscriber.isOpen) {
        await subscriber.connect();
    }
})()

app.prepare().then(() => {
    const httpServer = createServer(handler);
    const io = new Server(httpServer);

    io.on("connection", (socket) => {

        socket.on("subscribe:upload-progress", async (deploymentId) => {
            console.log("SUBSCRIBED!")
            await subscriber.pSubscribe(`deployment:${deploymentId}:uploader:upload-progress`, (message) => {
                socket.emit("uploader:upload-progress", JSON.parse(message));
            });
            await subscriber.pSubscribe(`deployment:${deploymentId}:builder:download`, (message) => {
                socket.emit("builder:download", JSON.parse(message));
            });
            await subscriber.pSubscribe(`deployment:${deploymentId}:builder:build`, (message) => {
                socket.emit("builder:build", JSON.parse(message));
            });
            await subscriber.pSubscribe(`deployment:${deploymentId}:builder:upload-output`, (message) => {
                socket.emit("builder:upload-output", JSON.parse(message));
            });
            await subscriber.pSubscribe(`deployment:${deploymentId}:builder:complete`, (message) => {
                socket.emit("DONE", JSON.parse(message));
            });
        })

        socket.on('disconnect', () => {
            subscriber.unsubscribe()
        })
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