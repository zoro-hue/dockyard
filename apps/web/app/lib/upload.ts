import { join, resolve } from "path";
import { cwd } from "process";
import { getAllFiles } from "./file";
import { uploadFile } from "./storage";
import simpleGit from "simple-git";
import { createClient } from "redis";
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const publisher = createClient({ url: redisUrl });
publisher.on('error', (err) => console.warn('[Upload Publisher Warning]', err.message));

import { deploymentEvents } from "./events";

export async function cloneAndUploadRepository(id: string, repositoryUrl: string) {
    try {
        console.log(`[Uploader] Starting clone for ${id} from ${repositoryUrl}`);
        await simpleGit().clone(repositoryUrl, join(cwd(), "outputs", id));

        const files = await getAllFiles(join(cwd(), "outputs", id));

        if (!publisher.isOpen) {
            await publisher.connect();
        }

        const totalFiles = files.length;
        let uploadedFiles = 0;

        for (const file of files) {
            const key = file.slice(cwd().length + 1);
            await uploadFile({ key, filePath: file });

            const payload = {
                file: file,
                current: ++uploadedFiles,
                total: totalFiles,
                percentage: Math.round((uploadedFiles / totalFiles) * 100)
            };

            deploymentEvents.emitDeploymentEvent({ deploymentId: id, eventName: 'uploader:upload-progress', data: payload });
            await publisher.publish(`deployment:${id}:uploader:upload-progress`, JSON.stringify(payload));
        }

        await publisher.hSet("status", id, "uploading");
        await publisher.lPush("build-queue", id);
    } catch (err) {
        console.error(`[Uploader Error] Failed processing repo ${id}:`, err);
    }
}