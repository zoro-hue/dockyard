import { createClient } from "redis";
import { deploymentEvents } from "./events";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const publisher = createClient({ url: redisUrl });
publisher.on('error', (err) => console.warn('[Upload Publisher Warning]', err.message));

export async function pushToBuildQueue(id: string, repositoryUrl: string) {
    try {
        if (!publisher.isOpen) {
            await publisher.connect();
        }
        await publisher.hSet("status", id, "queued");

        const payload = {
            file: `Build queued for ${repositoryUrl}`,
            current: 1,
            total: 1,
            percentage: 100
        };

        deploymentEvents.emitDeploymentEvent({ deploymentId: id, eventName: 'uploader:upload-progress', data: payload });
        await publisher.publish(`deployment:${id}:uploader:upload-progress`, JSON.stringify(payload));

        await publisher.lPush("build-queue", JSON.stringify({ id, repositoryUrl }));
        console.log(`[Upload Queue] Pushed project ${id} to build-queue`);
    } catch (err) {
        console.error(`[Upload Queue Error]`, err);
    }
}

export async function cloneAndUploadRepository(id: string, repositoryUrl: string) {
    return pushToBuildQueue(id, repositoryUrl);
}