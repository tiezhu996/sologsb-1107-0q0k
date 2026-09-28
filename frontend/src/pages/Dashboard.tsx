import { useEffect, useMemo } from 'react'
import { Alert, Box, Card, CardContent, Chip, Divider, Grid, LinearProgress, Link, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { ProcessTimeline, type ProcessStep } from '../components/common/ProcessTimeline'
import { StatBadge } from '../components/common/StatBadge'
import { useMouldFilter } from '../hooks/useMouldFilter'
import { useFiberStore } from '../stores/fiberStore'
import { useMouldStore } from '../stores/mouldStore'
import { useRecheckStore } from '../stores/recheckStore'
import { useRunStore } from '../stores/runStore'
import { useSampleStore } from '../stores/sampleStore'
import type { RecheckStatus } from '../types/recheck'
import { isGapOutOfTolerance } from '../utils/stripe'
import { isRecheckOverdue, recheckUrgency } from '../utils/recheck'

function startOfCurrentWeek(): Date {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  const day = date.getDay()
  const distance = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + distance)
  return date
}

function isInCurrentWeek(value: string): boolean {
  const start = startOfCurrentWeek()
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  const date = new Date(`${value}T00:00:00`)
  return date >= start && date < end
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const recheckChipColor: Record<RecheckStatus, 'warning' | 'info' | 'success' | 'error'> = {
  待复检: 'warning',
  观察中: 'info',
  已合格: 'success',
  不合格: 'error',
}

const processSteps: ProcessStep[] = [
  { label: '纤维蒸煮', detail: '石灰或纯碱处理，按料批记录时长。', status: 'done' },
  { label: '清浆打浆', detail: '校核打浆度，为抄纸提供稳定浆料。', status: 'done' },
  { label: '帘槽抄纸', detail: '依据纸帘密度控制帘纹方向与次数。', status: 'active' },
  { label: '压榨干燥', detail: '火墙或日晒定形，记录克重与叠高。', status: 'pending' },
  { label: '透光复检', detail: '核对匀度、帘纹条数与偏差。', status: 'pending' },
]

export default function Dashboard() {
  const moulds = useMouldStore((state) => state.moulds)
  const mouldError = useMouldStore((state) => state.error)
  const loadMoulds = useMouldStore((state) => state.loadMoulds)
  const batches = useFiberStore((state) => state.fiberBatches)
  const batchError = useFiberStore((state) => state.error)
  const loadBatches = useFiberStore((state) => state.loadFiberBatches)
  const runs = useRunStore((state) => state.sheetRuns)
  const runError = useRunStore((state) => state.error)
  const loadRuns = useRunStore((state) => state.loadRuns)
  const samples = useSampleStore((state) => state.paperSamples)
  const sampleError = useSampleStore((state) => state.error)
  const loadSamples = useSampleStore((state) => state.loadSamples)
  const rechecks = useRecheckStore((state) => state.rechecks)
  const recheckError = useRecheckStore((state) => state.error)
  const loadRechecks = useRecheckStore((state) => state.loadRechecks)

  useEffect(() => {
    void loadMoulds()
    void loadBatches()
    void loadRuns()
    void loadSamples()
    void loadRechecks()
  }, [loadBatches, loadMoulds, loadRechecks, loadRuns, loadSamples])

  const { filteredMoulds: activeMoulds } = useMouldFilter(moulds, '', '在用')
  const currentWeekRuns = useMemo(() => runs.filter((run) => isInCurrentWeek(run.runDate)), [runs])
  const runById = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs])
  const sampleById = useMemo(() => new Map(samples.map((sample) => [sample.id, sample])), [samples])
  const today = todayIso()
  const openRechecks = useMemo(
    () => rechecks.filter((item) => item.status === '待复检' || item.status === '观察中'),
    [rechecks],
  )
  const overdueRechecks = useMemo(() => openRechecks.filter((item) => isRecheckOverdue(item, today)), [openRechecks, today])
  const urgentRechecks = useMemo(
    () => [...openRechecks]
      .sort((a, b) => (recheckUrgency(a, today) - recheckUrgency(b, today)) || a.raisedDate.localeCompare(b.raisedDate))
      .slice(0, 5),
    [openRechecks, today],
  )
  const activeRate = moulds.length ? Math.round((activeMoulds.length / moulds.length) * 100) : 0
  const error = mouldError ?? batchError ?? runError ?? sampleError ?? recheckError

  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h3" color="#344a34">
          工作台
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.75 }}>
          汇总纸帘状态、料批与本周工序，优先处理超差帘纹和待复检样本。
        </Typography>
      </Box>

      {error && <Alert severity="warning">{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <StatBadge label="在册纸帘" value={moulds.length} detail={`在用 ${activeMoulds.length} 张`} />
        <StatBadge label="纤维料批" value={batches.length} detail="覆盖四类造纸纤维" tone="bamboo" />
        <StatBadge label="本周工序" value={currentWeekRuns.length} detail="按自然周统计" tone="bamboo" />
        <StatBadge label="待复检样本" value={openRechecks.length} detail="待复检与继续观察事项" tone={openRechecks.length ? 'warning' : 'neutral'} />
        <StatBadge label="超七天未检" value={overdueRechecks.length} detail="首检或下次复检逾期" tone={overdueRechecks.length ? 'warning' : 'neutral'} />
      </Box>

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={7}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 2.5 }}>
                <Box>
                  <Typography variant="h5">纸帘配比与使用状态</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    在用率 {activeRate}%，竹丝帘适合常规书写纸，铜丝帘用于细密帘纹。
                  </Typography>
                </Box>
                <Chip label={`${activeMoulds.length}/${moulds.length} 在用`} color="success" variant="outlined" />
              </Box>
              <Stack spacing={2}>
                {['在用', '待修补', '退役'].map((status) => {
                  const count = moulds.filter((mould) => mould.state === status).length
                  const percentage = moulds.length ? (count / moulds.length) * 100 : 0
                  return (
                    <Box key={status}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 650 }}>{status}</Typography>
                        <Typography variant="body2" color="text.secondary">{count} 张</Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={percentage}
                        color={status === '在用' ? 'success' : status === '待修补' ? 'warning' : 'inherit'}
                        sx={{ height: 8, borderRadius: 5, bgcolor: '#e8e1d4' }}
                      />
                    </Box>
                  )
                })}
              </Stack>
              <Divider sx={{ my: 2.5 }} />
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {activeMoulds.map((mould) => (
                  <Chip key={mould.id ?? mould.mouldNo} label={`${mould.mouldNo} · ${mould.wireMaterial} · ${mould.meshDensity} 根/cm`} variant="outlined" />
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} lg={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Typography variant="h5" sx={{ mb: 2 }}>标准工序路径</Typography>
              <ProcessTimeline steps={processSteps} compact />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 1.5 }}>
            <Box>
              <Typography variant="h5">复检工作台 · 最紧急五条</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                偏差绝对值超过 0.2 mm 或透光匀度不达“均匀”时自动建项；首检或下次复检超七天置顶。
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Chip label={`待复检 ${openRechecks.length}`} color={openRechecks.length ? 'warning' : 'success'} />
              <Chip label={`超七天未检 ${overdueRechecks.length}`} color={overdueRechecks.length ? 'error' : 'default'} />
            </Stack>
          </Box>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 820 }}>
              <TableHead>
                <TableRow>
                  <TableCell>样本号</TableCell>
                  <TableCell>对应工序</TableCell>
                  <TableCell>匀度</TableCell>
                  <TableCell>帘纹偏差</TableCell>
                  <TableCell>复检状态</TableCell>
                  <TableCell>复检进度</TableCell>
                  <TableCell>提醒</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {urgentRechecks.map((item) => {
                  const sample = sampleById.get(item.sampleId)
                  const run = sample ? runById.get(sample.runId) : undefined
                  const deviation = run?.deviation ?? 0
                  const overdue = isRecheckOverdue(item, today)
                  return (
                    <TableRow key={item.id ?? item.sampleId} hover sx={{ bgcolor: overdue ? '#ffe9e6' : '#fff8df' }} data-testid="row-urgent-recheck">
                      <TableCell sx={{ fontWeight: 700 }}>
                        {sample ? (
                          <Link component={RouterLink} to="/samples" color="inherit" underline="hover">{sample.sampleNo}</Link>
                        ) : '样本待关联'}
                      </TableCell>
                      <TableCell>{run?.runNo ?? '工序待关联'}</TableCell>
                      <TableCell>{sample?.evenness ?? '—'}</TableCell>
                      <TableCell>
                        <Chip size="small" color={isGapOutOfTolerance(deviation) ? 'warning' : 'default'} label={`${deviation > 0 ? '+' : ''}${deviation.toFixed(2)} mm`} />
                      </TableCell>
                      <TableCell><Chip size="small" color={recheckChipColor[item.status]} label={item.status} /></TableCell>
                      <TableCell>
                        <Typography variant="body2">已复检 {item.entries.length} 次</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.currentConclusion ? `最新：${item.currentConclusion}` : '等待首检'}
                          {item.nextDate ? ` · 下次 ${item.nextDate}` : ''}
                        </Typography>
                      </TableCell>
                      <TableCell>{overdue ? <Chip size="small" color="error" label="超七天未检" /> : <Typography variant="caption" color="text.secondary">建项 {item.raisedDate}</Typography>}</TableCell>
                    </TableRow>
                  )
                })}
                {urgentRechecks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>当前没有待复检样本</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  )
}
