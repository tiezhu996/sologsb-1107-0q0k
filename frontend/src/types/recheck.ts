export const RECHECK_RESULTS = ['继续观察', '复检合格', '复检不合格'] as const
export type RecheckResult = (typeof RECHECK_RESULTS)[number]

/** 待复检事项的当前状态，由历次复检结论推导。 */
export const RECHECK_STATUSES = ['待复检', '观察中', '已合格', '不合格'] as const
export type RecheckStatus = (typeof RECHECK_STATUSES)[number]

export const RECHECK_STATUS_FILTERS = ['全部', ...RECHECK_STATUSES, '超七天未检'] as const
export type RecheckStatusFilter = (typeof RECHECK_STATUS_FILTERS)[number]

/** 一次复检登记，全部保留形成历史。 */
export interface RecheckEntry {
  id?: number
  checkDate: string
  handler: string
  result: RecheckResult
  note: string
  nextDate?: string
  createdAt: number
}

/** 样本进入样本页时自动建立、重复进入不新增的待复检事项。 */
export interface RecheckItem {
  id?: number
  sampleId: number
  raisedDate: string
  status: RecheckStatus
  currentConclusion: string
  nextDate?: string
  entries: RecheckEntry[]
  createdAt: number
}

export interface RecheckEntryInput {
  checkDate: string
  handler: string
  result: RecheckResult
  note: string
  nextDate?: string
}
