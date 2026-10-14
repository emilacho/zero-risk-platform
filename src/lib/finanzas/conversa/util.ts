/** F8 · huella de un artefacto (JSON canónico → sha256). Pura. */
import { canonico } from '../firma'
import crypto from 'node:crypto'

export const sha256 = (v: unknown): string => crypto.createHash('sha256').update(canonico(v)).digest('hex')
