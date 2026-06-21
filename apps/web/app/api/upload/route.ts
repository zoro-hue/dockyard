import { cloneAndUploadRepository } from "@/app/lib/upload";
import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
    repositoryUrl: z.string(),
});

function getRepoName(url: string): string {
    try {
        const cleaned = url.replace(/\/$/, "").replace(/\.git$/, "");
        const parts = cleaned.split("/");
        let name = parts[parts.length - 1] || "project";
        // Clean special characters to be safe for subdomains (only alphanumeric and hyphens)
        name = name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
        return name || "project";
    } catch {
        return "project";
    }
}

export async function POST(request: Request) {
    const body = await request.json();
    const parsedBody = requestSchema.parse(body);

    if (!parsedBody.repositoryUrl) {
        return NextResponse.json({ error: "Repository URL is required" }, { status: 400 });
    }

    const repoName = getRepoName(parsedBody.repositoryUrl);
    const shortId = crypto.randomUUID().split("-")[0].substring(0, 6);
    const id = `${repoName}-${shortId}`;

    cloneAndUploadRepository(id, parsedBody.repositoryUrl);

    return NextResponse.json({ message: "Repository URL received", id, }, { status: 200 });
}
