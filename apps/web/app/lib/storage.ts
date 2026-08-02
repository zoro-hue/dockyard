import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname, resolve } from "path";
import { existsSync } from "fs";

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

/**
 * Upload a file to local simulated S3 bucket.
 */
export const uploadFile = async ({ key, filePath }: { key: string, filePath: string }) => {
    try {
        const destPath = join(LOCAL_S3_DIR, key);
        await mkdir(dirname(destPath), { recursive: true });
        const content = await readFile(filePath);
        await writeFile(destPath, content);
        console.log(`[Local-S3] Uploaded file: ${key}`);
    } catch (caught: any) {
        console.error(`[Local-S3] Error writing file to simulated S3: ${caught.message}`);
        throw caught;
    }
};
