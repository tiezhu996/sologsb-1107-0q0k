import type { PaperSample } from '../types/paper-sample'
import type { RecheckRecord, RecheckStatus, RecheckTicket } from '../types/recheck'
import type { SheetRun } from '../types/sheet-run'
import { GAP_TOLERANCE_MM, isGapOutOfTolerance } from './stripe'

export const RECHECK_OVERDUE_DAYS = 7

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// 进入样本页即判定：匀度不是“均匀”，或关联工序帘纹偏差绝对值超过 0.2 mm。
export function sampleNeedsRecheck(sample: PaperSample, run?: SheetRun): boolean {
  return sample.evenness !== '均匀' || (run ? isGapOutOfTolerance(run.deviation) : false)
}

export function recheckTriggers(sample: PaperSample, run?: SheetRun): string[] {
  const reasons: string[] = []
  if (sample.evenness !== '均匀') reasons.push(`匀度为“${sample.evenness}”`)
  if (run && isGapOutOfTolerance(run.deviation)) {
    reasons.push(`帘纹偏差 ${run.deviation > 0 ? '+' : ''}${run.deviation.toFixed(2)} mm，超过 ±${GAP_TOLERANCE_MM} mm`)
  }
  return reasons
}

export function latestRecord(ticket: RecheckTicket): RecheckRecord | undefined {
  return ticket.records.length ? ticket.records[ticket.records.length - 1] : undefined
}

// 历史保留，当前状态与结论始终以最新一条复检记录为准。
export function deriveStatus(records: RecheckRecord[]): RecheckStatus {
  const latest = records.length ? records[records.length - 1] : undefined
  if (!latest) return '待复检'
  return latest.conclusion === '继续观察' ? '观察中' : '已闭环'
}

// 下一次复检日期：观察中取最新记录补登的下次日期；从未复检则从建项日起算。
export function nextDueDate(ticket: RecheckTicket): string | undefined {
  const latest = latestRecord(ticket)
  if (latest?.nextDate) return latest.nextDate
  if (!latest) return ticket.createdAt
  return undefined
}

export function isOverdue(ticket: RecheckTicket, reference: string = todayIso()): boolean {
  if (ticket.status === '已闭环') return false
  const due = nextDueDate(ticket)
  return Boolean(due && due < reference)
}

// 超七天未检：建项或上次复检后超过七天仍无新记录（闭环不再统计）。
export function daysSinceLastAction(ticket: RecheckTicket, reference: string = todayIso()): number | undefined {
  if (ticket.status === '已闭环') return undefined
  const latest = latestRecord(ticket)
  const anchor = latest?.date ?? ticket.createdAt
  const anchorTime = new Date(`${anchor}T00:00:00`).getTime()
  const refTime = new Date(`${reference}T00:00:00`).getTime()
  if (Number.isNaN(anchorTime) || Number.isNaN(refTime)) return undefined
  return Math.floor((refTime - anchorTime) / 86400000)
}

export function isOverSevenDays(ticket: RecheckTicket, reference: string = todayIso()): boolean {
  const days = daysSinceLastAction(ticket, reference)
  return days !== undefined && days > RECHECK_OVERDUE_DAYS
}

// 工作台排序：超七天未检优先，其次按下一次到期日，再按建项时间，最紧急在前。
export function urgencyRank(ticket: RecheckTicket): number {
  const days = daysSinceLastAction(ticket)
  if (days !== undefined && days > RECHECK_OVERDUE_DAYS) return 0
  const due = nextDueDate(ticket)
  if (due) return new Date(`${due}T00:00:00`).getTime()
  return new Date(`${ticket.createdAt}T00:00:00`).getTime()
}
