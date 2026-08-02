import { createClient } from "redis";
import { downloadProject, uploadProjectBuild } from "./storage";
import { buildProject } from "./build";
import { createServer } from "http";
import dotenv from "dotenv";
import simpleGit from "simple-git";
import { join } from "path";
import { mkdir } from "fs/promises";

dotenv.config();

const port = parseInt(process.env.PORT || "8080", 10);
createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Dockyard Builder Worker active");
}).listen(port, () => {
    console.log(`Builder status server listening on port ${port}`);
});

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const subscriber = createClient({ url: redisUrl });
const publisher = createClient({ url: redisUrl });

subscriber.on('error', (err) => console.warn('[Builder Subscriber Warning]', err.message));
publisher.on('error', (err) => console.warn('[Builder Publisher Warning]', err.message));

console.log("Connecting to Redis at", redisUrl);

(async () => {
    while (true) {
        try {
            if (!subscriber.isOpen) await subscriber.connect();
            if (!publisher.isOpen) await publisher.connect();
            break;
        } catch (err: any) {
            console.warn("Failed to connect to Redis, retrying in 3s...", err.message);
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
    }

    while (true) {
        try {
            const queueItem = await subscriber.brPop("build-queue", 0);

            if (!queueItem) {
                continue;
            }

            let projectId = queueItem.element;
            let repositoryUrl = "";

            try {
                const parsed = JSON.parse(queueItem.element);
                if (parsed.id) {
                    projectId = parsed.id;
                    repositoryUrl = parsed.repositoryUrl || "";
                }
            } catch {
                // Fallback to plain string ID
            }

            console.log(`[Builder] Processing build for project: ${projectId}`);
            await publisher.hSet("status", projectId, "building");

            const projectPath = join(process.cwd(), "downloads", projectId);
            await mkdir(projectPath, { recursive: true });

            if (repositoryUrl) {
                console.log(`[Builder] Direct cloning ${repositoryUrl} to ${projectPath}...`);
                await simpleGit().clone(repositoryUrl, projectPath);
            } else {
                try {
                    await downloadProject(projectId);
                } catch (e: any) {
                    console.warn(`[Builder Download Warning] ${e.message}`);
                }
            }

            await publisher.publish(`deployment:${projectId}:builder:download`, JSON.stringify({
                file: "Repository prepared",
                current: 100,
                total: 100,
                percentage: 100
            }));

            await buildProject(projectId);
            await uploadProjectBuild(projectId);

            const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || "https://dockyard-web.onrender.com";
            const requestHandlerUrl = process.env.REQUEST_HANDLER_URL || "https://dockyard-request-handler.onrender.com";

            await publisher.hSet("status", projectId, "build-complete");

            const completionPayload = {
                url: `${requestHandlerUrl}/deployments/${projectId}`,
                publicUrl: `${publicBaseUrl}/api/serve/${projectId}`,
            };

            await publisher.publish(`deployment:${projectId}:builder:complete`, JSON.stringify(completionPayload));
            console.log(`[Builder] Build complete for ${projectId}. Published DONE event.`);

        } catch (error) {
            console.error("Error processing message:", error);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
})();
