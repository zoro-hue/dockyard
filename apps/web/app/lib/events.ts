import { EventEmitter } from "events";

class DeploymentEventEmitter extends EventEmitter {
    private eventStore = new Map<string, Array<{ eventName: string; data: any }>>();

    public emitDeploymentEvent(payload: { deploymentId: string; eventName: string; data: any }) {
        if (!this.eventStore.has(payload.deploymentId)) {
            this.eventStore.set(payload.deploymentId, []);
        }
        this.eventStore.get(payload.deploymentId)!.push({ eventName: payload.eventName, data: payload.data });
        this.emit("event", payload);
    }

    public getEvents(deploymentId: string) {
        return this.eventStore.get(deploymentId) || [];
    }

    public clear(deploymentId: string) {
        this.eventStore.delete(deploymentId);
    }
}

// Global event bus instance attached to globalThis to ensure single instance across modules
const globalEventsKey = Symbol.for("dockyard.deployment.events");
const globalAny = globalThis as any;

if (!globalAny[globalEventsKey]) {
    globalAny[globalEventsKey] = new DeploymentEventEmitter();
    globalAny[globalEventsKey].setMaxListeners(100);
}

export const deploymentEvents: DeploymentEventEmitter = globalAny[globalEventsKey];
