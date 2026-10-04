// ─── UNDERSTAND LIBRARY REGISTRY ───
// Single aggregate of the living-scene catalog shared by the Understand view
// and the Topic Hub (PRODUCT 02) — pure client-safe data.

import { BASE_TOPICS } from './understand-catalog-base'
import { CATALOG_B } from './understand-catalog-b'
import { CATALOG_C } from './understand-catalog-c'
import type { UnderstandTopic } from './understand-types'

export const ALL_UNDERSTAND: UnderstandTopic[] = [...BASE_TOPICS, ...CATALOG_B, ...CATALOG_C]
