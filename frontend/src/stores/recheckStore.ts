import { create } from 'zustand'
import type { RecheckEntry, RecheckEntryInput, RecheckItem } from '../types/recheck'
import { db, plain, syncRecheckItems } from '../utils/db'
import { deriveRecheckStatus } from '../utils/recheck'

function describeLatest(entry: RecheckEntry): string {
  return entry.note.trim() ? `${entry.result}：${entry.note.trim()}` : entry.result
}

interface RecheckStore {
  rechecks: RecheckItem[]
  isLoading: boolean
  loaded: boolean
  error: string | null
  loadRechecks: () => Promise<void>
  /** 进入样本页时调用：为需要复检的样本补建事项，重复调用不新增。 */
  syncRechecks: () => Promise<number>
  addRecheckEntry: (itemId: number, input: RecheckEntryInput) => Promise<boolean>
}

export const useRecheckStore = create<RecheckStore>((set, get) => ({
  rechecks: [],
  isLoading: false,
  loaded: false,
  error: null,
  loadRechecks: async () => {
    if (get().loaded) return
    set({ isLoading: true, error: null })
    try {
      const rechecks = await db.rechecks.orderBy('raisedDate').toArray()
      set({ rechecks, isLoading: false, loaded: true })
    } catch {
      set({ isLoading: false, error: '复检事项读取失败，请检查浏览器存储权限' })
    }
  },
  syncRechecks: async () => {
    set({ error: null })
    try {
      const before = get().rechecks.length
      await syncRecheckItems()
      const rechecks = await db.rechecks.orderBy('raisedDate').toArray()
      set({ rechecks, loaded: true, isLoading: false })
      return rechecks.length - before
    } catch {
      set({ error: '复检事项建立失败，请稍后重试' })
      return 0
    }
  },
  addRecheckEntry: async (itemId, input) => {
    set({ error: null })
    try {
      const item = await db.rechecks.get(itemId)
      if (!item) {
        set({ error: '复检事项不存在或已被移除' })
        return false
      }
      const nextEntryId = item.entries.reduce((max, entry) => Math.max(max, entry.id ?? 0), 0) + 1
      const entry: RecheckEntry = {
        id: nextEntryId,
        checkDate: input.checkDate,
        handler: input.handler.trim(),
        result: input.result,
        note: input.note.trim(),
        nextDate: input.result === '继续观察' && input.nextDate ? input.nextDate : undefined,
        createdAt: Date.now(),
      }
      const entries = [...item.entries, entry]
      const patch: Partial<RecheckItem> = {
        entries: plain(entries),
        status: deriveRecheckStatus({ entries }),
        currentConclusion: describeLatest(entry),
        nextDate: entry.nextDate,
      }
      await db.rechecks.update(itemId, patch)
      set((state) => ({
        rechecks: state.rechecks.map((existing) => (existing.id === itemId ? { ...existing, ...patch } : existing)),
      }))
      return true
    } catch {
      set({ error: '复检登记失败，请稍后重试' })
      return false
    }
  },
}))
