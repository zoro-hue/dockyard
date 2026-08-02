import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { cwd } from "process";

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

function findIndexPath(id: string): string | null {
    for (const baseDir of getCandidateBuildPaths(id)) {
        if (!existsSync(baseDir)) continue;
        if (existsSync(join(baseDir, "index.html"))) return join(baseDir, "index.html");
        if (existsSync(join(baseDir, "dist", "index.html"))) return join(baseDir, "dist", "index.html");
        if (existsSync(join(baseDir, "build", "index.html"))) return join(baseDir, "build", "index.html");
        if (existsSync(join(baseDir, "out", "index.html"))) return join(baseDir, "out", "index.html");
    }
    return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const indexPath = findIndexPath(id);

    if (!indexPath) {
        return new NextResponse(`Project ${id} index.html not found in build outputs.`, { status: 404 });
    }

    try {
        const fileContent = await readFile(indexPath);
        return new NextResponse(fileContent, {
            headers: { "Content-Type": "text/html" }
        });
    } catch {
        return new NextResponse("Error loading project index.html", { status: 500 });
    }
}
