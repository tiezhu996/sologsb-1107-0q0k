import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Box, Card, CardContent, Chip, Divider, Grid, LinearProgress, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { ProcessTimeline, type ProcessStep } from '../components/common/ProcessTimeline'
import { StatBadge } from '../components/common/StatBadge'
import { useMouldFilter } from '../hooks/useMouldFilter'
import { useFiberStore } from '../stores/fiberStore'
import { useMouldStore } from '../stores/mouldStore'
import { useRunStore } from '../stores/runStore'
import { useSampleStore } from '../stores/sampleStore'
import { daysSinceLastAction, isOverSevenDays, latestRecord, nextDueDate, urgencyRank } from '../utils/recheck'

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
  const tickets = useSampleStore((state) => state.recheckTickets)
  const sampleError = useSampleStore((state) => state.error)
  const loadSamples = useSampleStore((state) => state.loadSamples)
  const loadTickets = useSampleStore((state) => state.loadTickets)
  const ensureRecheckTickets = useSampleStore((state) => state.ensureRecheckTickets)

  useEffect(() => {
    void (async () => {
      await Promise.all([loadMoulds(), loadBatches(), loadRuns(), loadSamples()])
      await loadTickets()
    })()
  }, [loadBatches, loadMoulds, loadRuns, loadSamples, loadTickets])

  // 工作台也按最新匀度与偏差复核事项（如工序实测偏差后来超差），幂等不重复建项。
  useEffect(() => {
    if (samples.length && runs.length) void ensureRecheckTickets(runs)
  }, [samples, runs, ensureRecheckTickets])

  const { filteredMoulds: activeMoulds } = useMouldFilter(moulds, '', '在用')
  const currentWeekRuns = useMemo(() => runs.filter((run) => isInCurrentWeek(run.runDate)), [runs])
  const sampleById = useMemo(() => new Map(samples.map((sample) => [sample.id, sample])), [samples])
  const runById = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs])
  // 待复检：尚未闭环（待复检或观察中）的事项。
  const pendingTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status !== '已闭环'),
    [tickets],
  )
  // 超七天未检：建项或上次复检后逾七天仍无新记录。
  const overdueTickets = useMemo(
    () => pendingTickets.filter((ticket) => isOverSevenDays(ticket)),
    [pendingTickets],
  )
  // 最紧急五条：超期优先，再按下一次到期日与建项时间升序。
  const urgentTickets = useMemo(
    () => [...pendingTickets].sort((a, b) => urgencyRank(a) - urgencyRank(b)).slice(0, 5),
    [pendingTickets],
  )
  const activeRate = moulds.length ? Math.round((activeMoulds.length / moulds.length) * 100) : 0
  const error = mouldError ?? batchError ?? runError ?? sampleError

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
        <StatBadge label="待复检样本" value={pendingTickets.length} detail={`超七天未检 ${overdueTickets.length} 条`} tone={pendingTickets.length ? 'warning' : 'neutral'} />
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
              <Typography variant="h5">复检提醒 · 最紧急五条</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                超七天未检优先，其次按下一次复检日期排序；历史结论以最新一条复检记录为准。
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Chip label={`待复检 ${pendingTickets.length}`} color={pendingTickets.length ? 'warning' : 'success'} size="small" />
              <Chip label={`超七天 ${overdueTickets.length}`} color={overdueTickets.length ? 'warning' : 'default'} variant={overdueTickets.length ? 'filled' : 'outlined'} size="small" />
            </Box>
          </Box>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 760 }}>
              <TableHead>
                <TableRow>
                  <TableCell>样本号</TableCell>
                  <TableCell>对应工序</TableCell>
                  <TableCell>复检状态</TableCell>
                  <TableCell>当前结论</TableCell>
                  <TableCell>下次复检</TableCell>
                  <TableCell align="right">滞留天数</TableCell>
                  <TableCell>存档位</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {urgentTickets.map((ticket) => {
                  const sample = sampleById.get(ticket.sampleId)
                  const run = sample ? runById.get(sample.runId) : undefined
                  const latest = latestRecord(ticket)
                  const due = nextDueDate(ticket)
                  const idleDays = daysSinceLastAction(ticket)
                  const overdue = isOverSevenDays(ticket)
                  return (
                    <TableRow key={ticket.id ?? ticket.sampleId} hover sx={{ bgcolor: overdue ? '#fff3cd' : '#fff8df' }} data-testid="urgent-recheck-row">
                      <TableCell>
                        <Box component={Link} to="/samples" sx={{ color: 'primary.main', fontWeight: 700, textDecoration: 'none' }}>
                          {sample?.sampleNo ?? `样本 #${ticket.sampleId}`}
                        </Box>
                      </TableCell>
                      <TableCell>{run?.runNo ?? '工序待关联'}</TableCell>
                      <TableCell>
                        <Chip size="small" color={ticket.status === '观察中' ? 'info' : 'warning'} variant={ticket.status === '观察中' ? 'outlined' : 'filled'} label={ticket.status} />
                      </TableCell>
                      <TableCell>{latest ? latest.conclusion : <Typography variant="body2" color="text.secondary">尚未复检</Typography>}</TableCell>
                      <TableCell>
                        {due
                          ? <Typography variant="body2" sx={{ color: overdue ? 'warning.dark' : undefined, fontWeight: overdue ? 700 : 400 }}>{due}</Typography>
                          : '—'}
                      </TableCell>
                      <TableCell align="right">
                        {idleDays !== undefined
                          ? <Chip size="small" color={overdue ? 'warning' : 'default'} variant={overdue ? 'filled' : 'outlined'} label={`${idleDays} 天`} />
                          : '—'}
                      </TableCell>
                      <TableCell>{sample?.archiveBin ?? '待归档'}</TableCell>
                    </TableRow>
                  )
                })}
                {urgentTickets.length === 0 && (
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
