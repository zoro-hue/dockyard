import { mkdir as mkdirAsync, readdir as readdirAsync, stat as statAsync, copyFile as copyFileAsync } from "fs/promises";
import { existsSync } from "fs";
import { exec } from "child_process";
import { join, resolve } from "path";
import { cwd } from "process";
import { deploymentEvents } from "./events";

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
            data: { file: `Repository downloaded: ${projectId}` }
        });

        await mkdirAsync(buildPath, { recursive: true });
        await mkdirAsync(s3BuildPath, { recursive: true });

        // Find working directory with package.json (root or subfolder)
        let workingDir = projectPath;
        if (!existsSync(join(projectPath, "package.json"))) {
            try {
                const subdirs = await readdirAsync(projectPath);
                for (const sub of subdirs) {
                    const subPath = join(projectPath, sub);
                    const subStats = await statAsync(subPath);
                    if (subStats.isDirectory() && existsSync(join(subPath, "package.json"))) {
                        workingDir = subPath;
                        console.log(`[LocalBuilder] Found package.json in subfolder: ${sub}`);
                        break;
                    }
                }
            } catch (e) {}
        }

        const packageJsonPath = join(workingDir, "package.json");

        if (existsSync(packageJsonPath)) {
            deploymentEvents.emitDeploymentEvent({
                deploymentId: projectId,
                eventName: "builder:build",
                data: { data: `[Builder] Installing dependencies & building project at ${workingDir}...` }
            });

            await new Promise<void>((resolve) => {
                const child = exec("npm install --legacy-peer-deps && npm run build", { cwd: workingDir } as any);

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
            if (existsSync(join(workingDir, "dist"))) outFolder = "dist";
            else if (existsSync(join(workingDir, "build"))) outFolder = "build";
            else if (existsSync(join(workingDir, "out"))) outFolder = "out";

            const sourceDir = outFolder ? join(workingDir, outFolder) : workingDir;

            deploymentEvents.emitDeploymentEvent({
                deploymentId: projectId,
                eventName: "builder:upload-output",
                data: { file: `Publishing compiled static assets from ${outFolder || "root"}...` }
            });

            await copyDir(sourceDir, buildPath);
            await copyDir(sourceDir, s3BuildPath);
        } else {
            deploymentEvents.emitDeploymentEvent({
                deploymentId: projectId,
                eventName: "builder:build",
                data: { data: "[Builder] No package.json found. Serving as static HTML site." }
            });

            deploymentEvents.emitDeploymentEvent({
                deploymentId: projectId,
                eventName: "builder:upload-output",
                data: { file: "Publishing static assets to target..." }
            });

            await copyDir(projectPath, buildPath);
            await copyDir(projectPath, s3BuildPath);
        }

        const host = process.env.RENDER_EXTERNAL_URL || "https://dockyard-web.onrender.com";
        const requestHandlerUrl = process.env.REQUEST_HANDLER_URL || "https://dockyard-request-handler.onrender.com";

        deploymentEvents.emitDeploymentEvent({
            deploymentId: projectId,
            eventName: "DONE",
            data: {
                url: `${requestHandlerUrl}/deployments/${projectId}`,
                publicUrl: `${host}/api/serve/${projectId}`
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
