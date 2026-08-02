import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, extname } from "path";
import { cwd } from "process";

const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
};

function getCandidateBuildPaths(id: string): string[] {
    const candidates = [
        join(cwd(), "builds", id),
        join(cwd(), "outputs", id),
    ];
    if (process.env.LOCAL_S3_DIR) {
        candidates.push(join(process.env.LOCAL_S3_DIR, "builds", id));
        candidates.push(join(process.env.LOCAL_S3_DIR, "outputs", id));
    }
    return candidates;
}

function findAssetPath(id: string, relativeFilePath: string): string | null {
    for (const baseDir of getCandidateBuildPaths(id)) {
        if (!existsSync(baseDir)) continue;

        const direct = join(baseDir, relativeFilePath);
        if (existsSync(direct)) return direct;

        const inDist = join(baseDir, "dist", relativeFilePath);
        if (existsSync(inDist)) return inDist;

        const inBuild = join(baseDir, "build", relativeFilePath);
        if (existsSync(inBuild)) return inBuild;

        const inOut = join(baseDir, "out", relativeFilePath);
        if (existsSync(inOut)) return inOut;
    }
    return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
    const { id, path } = await params;
    const relativeFilePath = path.join("/");
    const filePath = findAssetPath(id, relativeFilePath);

    if (!filePath) {
        return new NextResponse("File not found", { status: 404 });
    }

    try {
        const fileContent = await readFile(filePath);
        const ext = extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || "application/octet-stream";

        return new NextResponse(fileContent, {
            headers: { "Content-Type": contentType }
        });
    } catch {
        return new NextResponse("Error loading asset", { status: 500 });
    }
}
