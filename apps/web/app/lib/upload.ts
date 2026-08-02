import { createClient } from "redis";
import { deploymentEvents } from "./events";
import { processLocalBuild } from "./localBuilder";
import simpleGit from "simple-git";
import { join } from "path";
import { cwd } from "process";
import { mkdir } from "fs/promises";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const publisher = createClient({ url: redisUrl });
publisher.on('error', (err) => console.warn('[Upload Publisher Warning]', err.message));

export async function cloneAndUploadRepository(id: string, repositoryUrl: string) {
    try {
        console.log(`[Upload] Starting git clone for project ${id} from ${repositoryUrl}`);
        const outputPath = join(cwd(), "outputs", id);
        await mkdir(outputPath, { recursive: true });

        await simpleGit().clone(repositoryUrl, outputPath);

        const payload = {
            file: `Repository cloned successfully: ${repositoryUrl}`,
            current: 1,
            total: 1,
            percentage: 100
        };

        deploymentEvents.emitDeploymentEvent({ deploymentId: id, eventName: 'uploader:upload-progress', data: payload });

        if (!publisher.isOpen) {
            await publisher.connect();
        }
        await publisher.publish(`deployment:${id}:uploader:upload-progress`, JSON.stringify(payload));
        await publisher.lPush("build-queue", JSON.stringify({ id, repositoryUrl }));

        // Instantly trigger building pipeline
        processLocalBuild(id);
    } catch (err: any) {
        console.error(`[Upload Error] ${id}:`, err);
        const errPayload = {
            file: `[ERROR] Failed to clone repository: ${err.message}`,
            percentage: 0
        };
        deploymentEvents.emitDeploymentEvent({ deploymentId: id, eventName: 'uploader:upload-progress', data: errPayload });
    }
}