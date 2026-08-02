import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { cwd } from "process";

const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const buildPath = join(cwd(), "builds", id);
    const indexPath = join(buildPath, "index.html");

    if (!existsSync(indexPath)) {
        return new NextResponse("Project index.html not found", { status: 404 });
    }

    try {
        const fileContent = await readFile(indexPath);
        return new NextResponse(fileContent, {
            headers: { "Content-Type": "text/html" }
        });
    } catch {
        return new NextResponse("Error loading project", { status: 500 });
    }
}
