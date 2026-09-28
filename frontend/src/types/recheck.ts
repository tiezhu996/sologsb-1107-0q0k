// 成纸样本的透光复检结论：末条为“继续观察”时保持开放并补下次复检日期，其余结论即闭环。
export const RECHECK_CONCLUSIONS = ['复检合格', '降级使用', '退回重检', '继续观察'] as const
export type RecheckConclusion = (typeof RECHECK_CONCLUSIONS)[number]

// 待复检事项状态：待复检（尚无记录）、观察中（最近一次为继续观察）、已闭环（已有终结结论）。
export const RECHECK_STATUSES = ['待复检', '观察中', '已闭环'] as const
export type RecheckStatus = (typeof RECHECK_STATUSES)[number]

export interface RecheckRecord {
  id: number
  date: string
  handler: string
  conclusion: RecheckConclusion
  note?: string
  nextDate?: string
}

export interface RecheckTicket {
  id?: number
  sampleId: number
  createdAt: string
  status: RecheckStatus
  records: RecheckRecord[]
  schemaRev?: number
}

export interface RecheckRecordInput {
  date: string
  handler: string
  conclusion: RecheckConclusion
  note?: string
  nextDate?: string
}
