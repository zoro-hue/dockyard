import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "path";

const LOCAL_S3_DIR = "d:\\XboxGames\\vercel-main\\local-s3-bucket";

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
