import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// ── Stale-client guard ───────────────────────────────────────────────────────
// A long-running dev server can hold a PrismaClient that was generated BEFORE
// the latest `prisma generate` (e.g. an additive schema push added a model
// while the server was already running). Node's require cache then keeps the
// old client alive even after files recompile. To make new models like
// RevisionSession reachable WITHOUT a server restart, we compare the running
// client against the model list in the generated schema ON DISK and, when a
// delegate is missing, purge the cached Prisma packages and re-require them
// (synchronous, once per process, verified by the smoke tests).

function diskModelNames(): string[] {
  try {
    const src = fs.readFileSync(path.join(process.cwd(), 'node_modules/.prisma/client/schema.prisma'), 'utf8')
    return [...src.matchAll(/^model\s+([A-Za-z0-9_]+)/gm)].map((m) => m[1]!)
  } catch {
    return [] // cannot read the generated schema → skip the guard entirely
  }
}

function clientHasAllModels(client: object, models: string[]): boolean {
  return models.every((m) => {
    const delegate = m.charAt(0).toLowerCase() + m.slice(1)
    return typeof (client as Record<string, unknown>)[delegate] !== 'undefined'
  })
}

function createClient(Ctor: typeof PrismaClient): PrismaClient {
  return new Ctor({ log: ['query'] })
}

function resolveClient(): PrismaClient {
  const models = diskModelNames()
  const cached = globalForPrisma.prisma
  if (cached && (models.length === 0 || clientHasAllModels(cached, models))) return cached

  // Fast path: this process's require cache is current.
  const direct = createClient(PrismaClient)
  if (models.length === 0 || clientHasAllModels(direct, models)) {
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = direct
    return direct
  }

  // Stale require cache — purge Prisma packages and re-require from disk.
  try {
    const req = createRequire(process.cwd() + '/package.json')
    for (const key of Object.keys(req.cache)) {
      if (key.includes('.prisma') || key.includes('@prisma')) delete req.cache[key]
    }
    const fresh = req('@prisma/client') as typeof PrismaClient extends never ? never : { PrismaClient: typeof PrismaClient }
    const refreshed = createClient(fresh.PrismaClient)
    if (clientHasAllModels(refreshed, models)) {
      if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = refreshed
      return refreshed
    }
  } catch (err) {
    console.error('Prisma client refresh failed — keeping the current client:', err)
  }
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = direct
  return direct
}

export const db = resolveClient()
