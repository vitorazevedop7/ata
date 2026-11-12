import { ipcMain } from 'electron'
import { readFile } from 'fs/promises'
import type { SearchHit, Summary, Transcript } from '../shared/types'
import { summaryFile, transcriptFile } from './paths'
import { listIds } from './store'

/** Matches shown per recording, so one long meeting doesn't bury the others. */
const HITS_PER_RECORDING = 8
const MAX_HITS = 200
/** Characters of context kept on each side of the match. */
const CONTEXT = 60

interface Folded {
  text: string
  /** Index in the original string for each code unit of the folded one. */
  map: number[]
}

/** Lowercases and strips accents, so "reuniao" finds "Reunião". */
function fold(text: string): Folded {
  let folded = ''
  const map: number[] = []
  let index = 0
  for (const char of text) {
    const plain = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    for (let k = 0; k < plain.length; k++) map.push(index)
    folded += plain
    index += char.length
  }
  return { text: folded, map }
}

function normalizeQuery(query: string): string {
  return fold(query.trim().replace(/\s+/g, ' ')).text
}

/** Finds the query in the text and returns an excerpt around the first match. */
function excerpt(raw: string, query: string): Pick<SearchHit, 'snippet' | 'match'> | null {
  const text = raw.trim()
  const folded = fold(text)
  const at = folded.text.indexOf(query)
  if (at === -1) return null

  const start = folded.map[at]
  const last = folded.map[at + query.length - 1]
  let end = last + ((text.codePointAt(last) ?? 0) > 0xffff ? 2 : 1)
  // Keep combining accents written as separate characters with their letter.
  while (end < text.length && /\p{M}/u.test(text[end])) end++

  let from = Math.max(0, start - CONTEXT)
  let to = Math.min(text.length, end + CONTEXT)
  // Cut at word boundaries so the excerpt doesn't start or end mid-word.
  if (from > 0) {
    const space = text.indexOf(' ', from)
    if (space !== -1 && space < start) from = space + 1
  }
  if (to < text.length) {
    const space = text.lastIndexOf(' ', to)
    if (space >= end) to = space
  }

  const prefix = from > 0 ? '…' : ''
  const suffix = to < text.length ? '…' : ''
  const offset = prefix.length - from
  return {
    snippet: prefix + text.slice(from, to) + suffix,
    match: [start + offset, end + offset]
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

function summaryTexts(summary: Summary): string[] {
  return [
    summary.overview,
    ...summary.decisions,
    ...summary.actionItems.map((item) => item.task),
    ...summary.keyPoints,
    ...summary.openQuestions
  ]
}

async function searchRecording(id: string, query: string): Promise<SearchHit[]> {
  const [transcript, summary] = await Promise.all([
    readJson<Transcript>(transcriptFile(id)),
    readJson<Summary>(summaryFile(id))
  ])
  const hits: SearchHit[] = []

  for (const text of summary ? summaryTexts(summary) : []) {
    if (hits.length >= HITS_PER_RECORDING) return hits
    const found = typeof text === 'string' ? excerpt(text, query) : null
    if (found) hits.push({ id, source: 'summary', ...found })
  }

  for (const segment of transcript?.segments ?? []) {
    if (hits.length >= HITS_PER_RECORDING) return hits
    const found = excerpt(segment.text, query)
    if (found) {
      hits.push({
        id,
        source: 'transcript',
        ...found,
        startMs: segment.startMs,
        channel: segment.channel
      })
    }
  }
  return hits
}

/**
 * Plain-text search over every transcript and summary, newest recording first.
 * Reads the JSON files on each call: fine for a personal history; an index
 * (e.g. SQLite FTS5) can replace this if it grows.
 */
export async function search(text: string): Promise<SearchHit[]> {
  const query = normalizeQuery(String(text ?? ''))
  if (!query) return []
  const ids = (await listIds()).sort((a, b) => b.localeCompare(a))
  const perRecording = await Promise.all(ids.map((id) => searchRecording(id, query)))
  return perRecording.flat().slice(0, MAX_HITS)
}

export function registerSearchIpc(): void {
  ipcMain.handle('search:query', (_event, text: string) => search(text))
}
