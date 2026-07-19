// Separate worker process: run alongside the GraphQL server (`pnpm dev:worker`).

import { ensureTableExists } from './db/bootstrap.js'
import { startWorkers } from './queue/index.js'

await ensureTableExists()
startWorkers()

console.info('Worker process started: send-message, message-status')
