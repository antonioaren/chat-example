import { createServer } from 'node:http'
import { yoga } from './app.js'

const port = Number(process.env.PORT ?? 4000)
const server = createServer(yoga)

server.on('error', (error) => {
  console.error('Failed to start GraphQL server:', error)
  process.exitCode = 1
})

server.listen(port, () => {
  console.info(
    `GraphQL server running at http://localhost:${port}${yoga.graphqlEndpoint}`,
  )
})
