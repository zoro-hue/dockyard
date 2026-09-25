import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync, readdirSync } from "fs";
import { join, extname } from "path";
import { cwd } from "process";

const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".jsx": "text/javascript",
    ".ts": "text/plain",
    ".tsx": "text/plain",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".ico": "image/x-icon",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".eot": "application/vnd.ms-fontobject",
    ".otf": "font/otf",
    ".wasm": "application/wasm",
    ".map": "application/json",
    ".webmanifest": "application/manifest+json",
    ".txt": "text/plain",
    ".xml": "application/xml",
    ".pdf": "application/pdf"
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

function searchHtmlRecursive(dir: string, depth = 0): string | null {
    if (depth > 3 || !existsSync(dir)) return null;
    try {
        const items = readdirSync(dir, { withFileTypes: true });

        // 1. Direct index.html or index.htm
        for (const item of items) {
            if (item.isFile() && (item.name.toLowerCase() === "index.html" || item.name.toLowerCase() === "index.htm")) {
                return join(dir, item.name);
            }
        }

        // 2. Check prioritized subdirectories: dist, build, out, public, web, client, src
        const priorityDirs = ["dist", "build", "out", "public", "web", "client", "src"];
        for (const pDir of priorityDirs) {
            const sub = join(dir, pDir);
            if (existsSync(sub)) {
                const found = searchHtmlRecursive(sub, depth + 1);
                if (found) return found;
            }
        }

        // 3. Check any other subdirectories
        for (const item of items) {
            if (item.isDirectory() && !priorityDirs.includes(item.name) && item.name !== "node_modules" && item.name !== ".git") {
                const found = searchHtmlRecursive(join(dir, item.name), depth + 1);
                if (found) return found;
            }
        }

        // 4. Fallback to any .html file in current directory
        for (const item of items) {
            if (item.isFile() && item.name.toLowerCase().endsWith(".html")) {
                return join(dir, item.name);
            }
        }
    } catch {}
    return null;
}

function findIndexPath(id: string): string | null {
    for (const baseDir of getCandidateBuildPaths(id)) {
        if (!existsSync(baseDir)) continue;
        const found = searchHtmlRecursive(baseDir);
        if (found) return found;
    }
    return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
    const { id, path } = await params;
    const relativeFilePath = path.join("/");
    let filePath = findAssetPath(id, relativeFilePath);

    // Single-Page Application (SPA) Fallback: if no exact file match, fallback to index.html for client-side routing
    if (!filePath && !extname(relativeFilePath)) {
        filePath = findIndexPath(id);
    }

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
