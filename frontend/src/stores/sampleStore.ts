import { create } from 'zustand'
import type { PaperSample, PaperSampleInput } from '../types/paper-sample'
import type { RecheckRecordInput, RecheckTicket } from '../types/recheck'
import type { SheetRun } from '../types/sheet-run'
import { db, plain } from '../utils/db'
import { deriveStatus, sampleNeedsRecheck, todayIso } from '../utils/recheck'

interface SampleStore {
  paperSamples: PaperSample[]
  recheckTickets: RecheckTicket[]
  isLoading: boolean
  loaded: boolean
  error: string | null
  loadSamples: () => Promise<void>
  loadTickets: () => Promise<void>
  addSample: (input: PaperSampleInput) => Promise<PaperSample | null>
  // 进入样本页时按匀度与关联工序偏差补建待复检事项，已存在事项的样本不重复建立。
  ensureRecheckTickets: (runs: SheetRun[]) => Promise<void>
  addRecheckRecord: (ticketId: number, input: RecheckRecordInput) => Promise<void>
}

const CURRENT_SCHEMA_REV = 3

export const useSampleStore = create<SampleStore>((set, get) => ({
  paperSamples: [],
  recheckTickets: [],
  isLoading: false,
  loaded: false,
  error: null,
  loadSamples: async () => {
    if (get().loaded) return
    set({ isLoading: true, error: null })
    try {
      const paperSamples = await db.paperSamples.orderBy('sampleNo').toArray()
      set({ paperSamples, isLoading: false, loaded: true })
    } catch {
      set({ isLoading: false, error: '样本档案读取失败，请检查浏览器存储权限' })
    }
  },
  loadTickets: async () => {
    try {
      const recheckTickets = await db.recheckTickets.toArray()
      set({ recheckTickets })
    } catch {
      set({ error: '复检记录读取失败，请检查浏览器存储权限' })
    }
  },
  addSample: async (input) => {
    set({ error: null })
    try {
      const payload = plain(input)
      const id = Number(await db.paperSamples.add(payload))
      const created: PaperSample = { ...payload, id, schemaRev: CURRENT_SCHEMA_REV }
      set((state) => ({ paperSamples: [created, ...state.paperSamples] }))
      return created
    } catch {
      set({ error: '样本登记失败，请检查样本编号是否重复' })
      return null
    }
  },
  ensureRecheckTickets: async (runs) => {
    const { paperSamples } = get()
    if (paperSamples.length === 0) return
    const runById = new Map<number, SheetRun>(runs.map((run) => [run.id as number, run]))
    const neededSamples = paperSamples.filter(
      (sample) => sample.id !== undefined && sampleNeedsRecheck(sample, runById.get(sample.runId)),
    )
    if (neededSamples.length === 0) return
    const neededIds = neededSamples.map((sample) => sample.id as number)
    try {
      let created: RecheckTicket[] = []
      // 在读写事务内复查已有事项，避免重复进入或并发时为同一样本建立多张待复检单。
      await db.transaction('rw', db.recheckTickets, async () => {
        const existingKeys = await db.recheckTickets.where('sampleId').anyOf(neededIds).uniqueKeys()
        const existingIds = new Set(existingKeys.map((key) => Number(key)))
        const now = todayIso()
        const pending = neededSamples.filter((sample) => !existingIds.has(sample.id as number))
        if (pending.length === 0) return
        const toAdd: RecheckTicket[] = pending.map((sample) => ({
          sampleId: sample.id as number,
          createdAt: now,
          status: '待复检',
          records: [],
          schemaRev: CURRENT_SCHEMA_REV,
        }))
        const ids = await db.recheckTickets.bulkAdd(plain(toAdd), { allKeys: true })
        created = toAdd.map((ticket, index) => ({ ...ticket, id: Number(ids[index]) }))
      })
      if (created.length) {
        set((state) => ({ recheckTickets: [...state.recheckTickets, ...created], error: null }))
      }
    } catch {
      set({ error: '待复检事项建立失败，请稍后重试' })
    }
  },
  addRecheckRecord: async (ticketId, input) => {
    const ticket = get().recheckTickets.find((item) => item.id === ticketId)
    if (!ticket) return
    set({ error: null })
    const record = { ...plain(input), id: ticket.records.length ? ticket.records[ticket.records.length - 1].id + 1 : 1 }
    const records = [...ticket.records, record]
    const status = deriveStatus(records)
    const nextTicket: RecheckTicket = { ...ticket, records, status, schemaRev: CURRENT_SCHEMA_REV }
    try {
      await db.recheckTickets.put(plain(nextTicket))
      set((state) => ({
        recheckTickets: state.recheckTickets.map((item) => (item.id === ticketId ? nextTicket : item)),
      }))
    } catch {
      set({ error: '复检结果登记失败，请稍后重试' })
    }
  },
}))
