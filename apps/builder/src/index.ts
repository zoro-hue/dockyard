import { createClient } from "redis";
import { downloadProject, uploadProjectBuild } from "./storage";
import { buildProject } from "./build";
import dotenv from "dotenv";

dotenv.config();

const subscriber = createClient();
const publisher = createClient();

console.log("Connecting to Redis");

(async () => {
    await subscriber.connect();
    await publisher.connect();

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

            await publisher.hSet("status", projectId, "build-complete");
            publisher.publish(`deployment:${projectId}:builder:complete`, JSON.stringify({
                url: `http://${projectId}.localhost:4000`,
                publicUrl: `https://${projectId}.dockyard.app`,
            }));

        } catch (error) {
            console.error("Error processing message:", error);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
})();
