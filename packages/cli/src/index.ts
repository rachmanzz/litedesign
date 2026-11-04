#!/usr/bin/env node
import { run } from './cli.js'

run(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\n  error: ${message}\n`)
  process.exit(1)
})
