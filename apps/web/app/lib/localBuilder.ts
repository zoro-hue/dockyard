import { mkdir, readdir, stat, copyFile, existsSync } from "fs";
import { mkdir as mkdirAsync, readdir as readdirAsync, stat as statAsync, copyFile as copyFileAsync } from "fs/promises";
import { exec } from "child_process";
import { join } from "path";
import { cwd } from "process";
import { deploymentEvents } from "./events";

import { resolve } from "path";

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

async function copyDir(src: string, dest: string) {
    await mkdirAsync(dest, { recursive: true });
    const items = await readdirAsync(src);
    for (const item of items) {
        if (item === "node_modules" || item === ".git") continue;
        const srcItem = join(src, item);
        const destItem = join(dest, item);
        const stats = await statAsync(srcItem);
        if (stats.isDirectory()) {
            await copyDir(srcItem, destItem);
        } else {
            await copyFileAsync(srcItem, destItem);
        }
    }
}

export async function processLocalBuild(projectId: string) {
    const projectPath = join(cwd(), "outputs", projectId);
    const buildPath = join(cwd(), "builds", projectId);
    const s3BuildPath = join(LOCAL_S3_DIR, "builds", projectId);

    try {
        deploymentEvents.emitDeploymentEvent({
            deploymentId: projectId,
            eventName: "builder:download",
            data: { file: `Downloaded project sources into workspace: ${projectId}` }
        });

        await mkdirAsync(buildPath, { recursive: true });
        await mkdirAsync(s3BuildPath, { recursive: true });

        const packageJsonPath = join(projectPath, "package.json");

        if (existsSync(packageJsonPath)) {
            deploymentEvents.emitDeploymentEvent({
                deploymentId: projectId,
                eventName: "builder:build",
                data: { data: `[Builder] Found package.json for ${projectId}. Running npm install & build...` }
            });

            await new Promise<void>((resolve) => {
                const child = exec("npm install && npm run build", { cwd: projectPath, shell: process.env.ComSpec || true } as any);

                child.stdout?.on("data", (data) => {
                    deploymentEvents.emitDeploymentEvent({
                        deploymentId: projectId,
                        eventName: "builder:build",
                        data: { data: data.toString() }
                    });
                });

                child.stderr?.on("data", (data) => {
                    deploymentEvents.emitDeploymentEvent({
                        deploymentId: projectId,
                        eventName: "builder:build",
                        data: { data: data.toString() }
                    });
                });

                child.on("close", () => resolve());
            });

            let outFolder = "";
            if (existsSync(join(projectPath, "dist"))) outFolder = "dist";
            else if (existsSync(join(projectPath, "build"))) outFolder = "build";
            else if (existsSync(join(projectPath, "out"))) outFolder = "out";

            const sourceDir = outFolder ? join(projectPath, outFolder) : projectPath;

            deploymentEvents.emitDeploymentEvent({
                deploymentId: projectId,
                eventName: "builder:upload-output",
                data: { file: `Publishing compiled assets from ${outFolder || "root"}...` }
            });

            await copyDir(sourceDir, buildPath);
            await copyDir(sourceDir, s3BuildPath);
        } else {
            deploymentEvents.emitDeploymentEvent({
                deploymentId: projectId,
                eventName: "builder:build",
                data: { data: "[Builder] No package.json found. Serving as static site." }
            });

            deploymentEvents.emitDeploymentEvent({
                deploymentId: projectId,
                eventName: "builder:upload-output",
                data: { file: "Publishing static assets to deployment target..." }
            });

            await copyDir(projectPath, buildPath);
            await copyDir(projectPath, s3BuildPath);
        }

        const publicUrl = `http://localhost:3001/api/serve/${projectId}`;
        const deployUrl = `http://localhost:4000/deployments/${projectId}`;

        deploymentEvents.emitDeploymentEvent({
            deploymentId: projectId,
            eventName: "DONE",
            data: {
                url: deployUrl,
                publicUrl: publicUrl
            }
        });
    } catch (err: any) {
        console.error(`[LocalBuilder Error] ${projectId}:`, err);
        deploymentEvents.emitDeploymentEvent({
            deploymentId: projectId,
            eventName: "builder:build",
            data: { data: `[ERROR] Build failed: ${err.message}` }
        });
    }
}
