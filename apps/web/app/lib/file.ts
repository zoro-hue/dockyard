import { readdir, stat } from "fs/promises";
import { join } from "path";

export const getAllFiles = async (path: string) => {
    const result: string[] = [];

    const files = await readdir(path);
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
