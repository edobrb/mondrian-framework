import { rest, graphql } from './api'
import { module } from './core'
import { opentelemetry } from './opentelemetry'
import { fastify } from 'fastify'

async function main() {
  opentelemetry.setup(module.instance.name, module.instance.version)
  const server = fastify()
  const startTime = new Date().getTime()
  rest.startServer(server)
  const partialTime = new Date().getTime()
  graphql.startServer(server)
  const finishTime = new Date().getTime()
  const address = await server.listen({ port: 4000 })
  console.log(`Rest    server started in ${partialTime - startTime}ms -> ${address}/openapi`)
  console.log(`Graphql server started in ${finishTime - partialTime}ms -> ${address}/graphql`)
}

main().then()
