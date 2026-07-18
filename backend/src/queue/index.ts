// Barrel for the worker process entrypoint.

import { createMessageWorker } from "./messageWorker.js";
import { createStatusWorker } from "./statusWorker.js";
import type { Worker } from "bullmq";

export function startWorkers(): Worker[] {
	return [createMessageWorker(), createStatusWorker()];
}
