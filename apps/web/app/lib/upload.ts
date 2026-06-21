import { join, resolve } from "path";
import { cwd } from "process";
import { getAllFiles } from "./file";
import { uploadFile } from "./storage";
import simpleGit from "simple-git";
import { createClient } from "redis";
const publisher = createClient();

export async function cloneAndUploadRepository(id: string, repositoryUrl: string) {
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

        await publisher.publish(`deployment:${id}:uploader:upload-progress`, JSON.stringify({
            file: file,
            current: ++uploadedFiles,
            total: totalFiles,
            percentage: Math.round((uploadedFiles / totalFiles) * 100)
        }));
    }

    await publisher.hSet("status", id, "uploading");

    await publisher.lPush("build-queue", id);

    await publisher.disconnect();
}