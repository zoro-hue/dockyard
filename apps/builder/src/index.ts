import { createClient } from "redis";
import { downloadProject, uploadProjectBuild } from "./storage";
import { buildProject } from "./build";
import dotenv from "dotenv";

dotenv.config();

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

            const projectId = queueItem.element;

            await downloadProject(projectId);
            await buildProject(projectId);
            await uploadProjectBuild(projectId);

            const baseUrl = process.env.BASE_URL || "http://localhost:4000";
            const publicBaseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3001";

            await publisher.hSet("status", projectId, "build-complete");
            publisher.publish(`deployment:${projectId}:builder:complete`, JSON.stringify({
                url: `${baseUrl}/deployments/${projectId}`,
                publicUrl: `${publicBaseUrl}/api/serve/${projectId}`,
            }));

        } catch (error) {
            console.error("Error processing message:", error);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
})();
