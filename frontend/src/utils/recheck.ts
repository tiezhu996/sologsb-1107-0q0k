import type { PaperSample } from '../types/paper-sample'
import type { RecheckItem, RecheckStatus } from '../types/recheck'
import type { SheetRun } from '../types/sheet-run'
import { isGapOutOfTolerance } from './stripe'

/** 样本匀度不是“均匀”，或关联工序偏差超过 0.2 mm 时需要复检。 */
export function needsRecheck(sample: PaperSample, run?: SheetRun): boolean {
  return sample.evenness !== '均匀' || (run ? isGapOutOfTolerance(run.deviation) : false)
}

export function recheckReasons(sample: PaperSample, run?: SheetRun): string[] {
  const reasons: string[] = []
  if (sample.evenness !== '均匀') reasons.push(`匀度为“${sample.evenness}”`)
  if (run && isGapOutOfTolerance(run.deviation)) {
    reasons.push(`工序 ${run.runNo} 帘纹偏差 ${run.deviation > 0 ? '+' : ''}${run.deviation.toFixed(2)} mm，超出 ±0.2 mm`)
  }
  return reasons
}

export function deriveRecheckStatus(item: Pick<RecheckItem, 'entries'>): RecheckStatus {
  const latest = item.entries.reduce<RecheckItem['entries'][number] | null>(
    (newest, entry) => (newest === null || entry.createdAt >= newest.createdAt ? entry : newest),
    null,
  )
  if (!latest) return '待复检'
  if (latest.result === '继续观察') return '观察中'
  if (latest.result === '复检合格') return '已合格'
  return '不合格'
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00`).getTime()
  const to = new Date(`${toIso}T00:00:00`).getTime()
  return Math.floor((to - from) / 86_400_000)
}

/**
 * 超七天未检：尚无复检记录且建项超过 7 天，或最近一次要求继续观察并安排了下次复检日期，
 * 该日期距今超过 7 天仍未补登记。
 */
export function isRecheckOverdue(item: RecheckItem, todayIso: string): boolean {
  if (item.status === '已合格' || item.status === '不合格') return false
  if (item.entries.length === 0) {
    return daysBetween(item.raisedDate, todayIso) > 7
  }
  if (!item.nextDate) return false
  return daysBetween(item.nextDate, todayIso) > 7
}

/** 紧急度排序键：逾期最多的在前，其次按下次复检日期、建项日期。 */
export function recheckUrgency(item: RecheckItem, todayIso: string): number {
  if (item.status === '已合格' || item.status === '不合格') return Number.POSITIVE_INFINITY
  const anchor = item.nextDate ?? item.raisedDate
  return daysBetween(todayIso, anchor)
}
