import { join, dirname, resolve } from "path";
import { cwd } from "process";
import { mkdir, readdir, stat, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { createClient } from "redis";

function getLocalS3Dir(): string {
    if (process.env.LOCAL_S3_DIR) return process.env.LOCAL_S3_DIR;
    let curr = process.cwd();
    while (curr && curr !== resolve(curr, "..")) {
        if (existsSync(join(curr, "turbo.json"))) {
            return join(curr, "local-s3-bucket");
        }
        curr = resolve(curr, "..");
    }
    return join(process.cwd(), "local-s3-bucket");
}

const LOCAL_S3_DIR = getLocalS3Dir();
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const publisher = createClient({ url: redisUrl });
publisher.on('error', (err) => console.warn('[Storage Publisher Warning]', err.message));

// Recursive helper to get files in simulated S3
const getFilesRecursive = async (dir: string): Promise<string[]> => {
    let results: string[] = [];
    try {
        const list = await readdir(dir);
        for (const file of list) {
            const filePath = join(dir, file);
            const stats = await stat(filePath);
            if (stats.isDirectory()) {
                results = results.concat(await getFilesRecursive(filePath));
            } else {
                results.push(filePath);
            }
        }
    } catch (e) {}
    return results;
};

export const downloadProject = async (projectId: string) => {
    if (!publisher.isOpen) {
        await publisher.connect();
    }

    const s3Prefix = join("outputs", projectId);
    const sourceDir = join(LOCAL_S3_DIR, s3Prefix);

    const files = await getFilesRecursive(sourceDir);

    if (files.length === 0) {
        throw new Error("No contents found in simulated S3 for project: " + projectId);
    }

    let uploadedFiles = 0;
    const totalFiles = files.length;

    for (const file of files) {
        // Key relative to LOCAL_S3_DIR
        const relativeKey = file.substring(LOCAL_S3_DIR.length + 1).replace(/\\/g, "/");
        console.log(relativeKey);

        let localPathArray = relativeKey.split("/");
        localPathArray.shift(); // remove "outputs"
        localPathArray.unshift("downloads");
        const localPath = localPathArray.join("/");

        const localFilePath = join(cwd(), localPath);

        await mkdir(dirname(localFilePath), { recursive: true });

        const data = await readFile(file);
        await writeFile(localFilePath, data);

        console.log(`Downloaded ${localFilePath}`);
        await publisher.publish(`deployment:${projectId}:builder:download`, JSON.stringify({
            file: localFilePath,
            current: ++uploadedFiles,
            total: totalFiles,
            percentage: Math.round((uploadedFiles / totalFiles) * 100)
        }));
    }
};

export const uploadProjectBuild = async (projectId: string) => {
    if (!publisher.isOpen) {
        await publisher.connect();
    }

    const files = await getAllFiles(join(cwd(), `builds/${projectId}`));

    const totalFiles = files.length;
    let uploadedFiles = 0;

    for (const file of files) {
        // Key is builds/${projectId}/...
        const key = file.slice(cwd().length + 1).replace(/\\/g, "/");
        const destPath = join(LOCAL_S3_DIR, key);

        await mkdir(dirname(destPath), { recursive: true });
        const content = await readFile(file);
        await writeFile(destPath, content);

        await publisher.publish(`deployment:${projectId}:builder:upload-output`, JSON.stringify({
            file: file,
            current: ++uploadedFiles,
            total: totalFiles,
            percentage: Math.round((uploadedFiles / totalFiles) * 100)
        }));
        console.log(`Uploaded ${file}`);
    }
};

const getAllFiles = async (path: string) => {
    const files = await readdir(path);
    const result: string[] = [];
    for (const file of files) {
        const filePath = join(path, file);
        const stats = await stat(filePath);
        if (stats.isDirectory()) {
            result.push(...(await getAllFiles(filePath)));
        } else {
            result.push(filePath);
        }
    }
    return result;
};
