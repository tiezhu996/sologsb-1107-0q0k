import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Grid, Stack, TextField, Typography } from '@mui/material'
import { GrainStripePreview } from '../components/common/GrainStripePreview'
import { RecheckDialog } from '../components/common/RecheckDialog'
import { RulerInput } from '../components/common/RulerInput'
import { StatBadge } from '../components/common/StatBadge'
import { useUnitConvert } from '../hooks/useUnitConvert'
import { useMouldStore } from '../stores/mouldStore'
import { useRunStore } from '../stores/runStore'
import { useSampleStore } from '../stores/sampleStore'
import { EVENNESS_LEVELS, type EvennessLevel, type PaperSampleInput } from '../types/paper-sample'
import { RECHECK_STATUSES, type RecheckRecordInput, type RecheckStatus, type RecheckTicket } from '../types/recheck'
import { daysSinceLastAction, isOverSevenDays, latestRecord, recheckTriggers } from '../utils/recheck'
import { isGapOutOfTolerance } from '../utils/stripe'

const emptySampleForm: PaperSampleInput = {
  sampleNo: '',
  runId: 1,
  sizeMm: 210,
  stripeCount: 45,
  evenness: '均匀',
  archiveBin: '待归档-01',
}

function stripeTier(count: number): { label: string; color: 'success' | 'info' | 'warning' } {
  if (count >= 50) return { label: '密纹档', color: 'success' }
  if (count >= 40) return { label: '中密档', color: 'info' }
  return { label: '疏纹档', color: 'warning' }
}

export default function SampleCards() {
  const samples = useSampleStore((state) => state.paperSamples)
  const tickets = useSampleStore((state) => state.recheckTickets)
  const error = useSampleStore((state) => state.error)
  const loadSamples = useSampleStore((state) => state.loadSamples)
  const loadTickets = useSampleStore((state) => state.loadTickets)
  const addSample = useSampleStore((state) => state.addSample)
  const ensureRecheckTickets = useSampleStore((state) => state.ensureRecheckTickets)
  const addRecheckRecord = useSampleStore((state) => state.addRecheckRecord)
  const runs = useRunStore((state) => state.sheetRuns)
  const runError = useRunStore((state) => state.error)
  const loadRuns = useRunStore((state) => state.loadRuns)
  const moulds = useMouldStore((state) => state.moulds)
  const mouldError = useMouldStore((state) => state.error)
  const loadMoulds = useMouldStore((state) => state.loadMoulds)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PaperSampleInput>(emptySampleForm)
  const [evennessFilter, setEvennessFilter] = useState<EvennessLevel | '全部'>('全部')
  const [recheckFilter, setRecheckFilter] = useState<RecheckStatus | '全部'>('全部')
  const [stripeFloor, setStripeFloor] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [activeTicket, setActiveTicket] = useState<RecheckTicket | null>(null)
  const { mmToCm, formatGrammage } = useUnitConvert()

  useEffect(() => {
    void (async () => {
      await Promise.all([loadSamples(), loadRuns(), loadMoulds()])
      await loadTickets()
    })()
  }, [loadMoulds, loadRuns, loadSamples, loadTickets])

  const runById = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs])
  const mouldById = useMemo(() => new Map(moulds.map((mould) => [mould.id, mould])), [moulds])
  const ticketBySample = useMemo(() => new Map(tickets.map((ticket) => [ticket.sampleId, ticket])), [tickets])

  // 进入样本页即按匀度与关联工序偏差自动建立待复检事项；重复进入不会新增。
  useEffect(() => {
    if (samples.length && runs.length) void ensureRecheckTickets(runs)
  }, [samples, runs, ensureRecheckTickets])

  // 弹窗持有的事项可能刚追加记录，渲染时以 store 中最新数据为准。
  const openTicket = activeTicket ? ticketBySample.get(activeTicket.sampleId) ?? activeTicket : null

  const filteredSamples = useMemo(
    () => samples.filter((sample) => {
      if (evennessFilter !== '全部' && sample.evenness !== evennessFilter) return false
      if (sample.stripeCount < stripeFloor) return false
      if (recheckFilter !== '全部' && ticketBySample.get(sample.id ?? -1)?.status !== recheckFilter) return false
      return true
    }),
    [evennessFilter, recheckFilter, samples, stripeFloor, ticketBySample],
  )
  const denseCount = samples.filter((sample) => sample.stripeCount >= 50).length
  const openTickets = tickets.filter((ticket) => ticket.status !== '已闭环')
  const overdueCount = tickets.filter((ticket) => isOverSevenDays(ticket)).length

  const updateForm = <K extends keyof PaperSampleInput,>(key: K, value: PaperSampleInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = async () => {
    if (!form.sampleNo.trim() || !form.archiveBin.trim() || form.sizeMm <= 0 || form.stripeCount <= 0) return
    setSubmitting(true)
    const created = await addSample({ ...form, sampleNo: form.sampleNo.trim(), archiveBin: form.archiveBin.trim() })
    setSubmitting(false)
    if (created) {
      setForm(emptySampleForm)
      setShowForm(false)
      // 新样本若匀度或关联工序偏差触发条件，立即在样本页建立待复检事项。
      void ensureRecheckTickets(runs)
    }
  }

  const handleRecheckSubmit = async (ticketId: number, input: RecheckRecordInput) => {
    await addRecheckRecord(ticketId, input)
  }

  const errorMessage = error ?? runError ?? mouldError

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box>
          <Typography component="h1" variant="h3" color="#344a34">成纸样本与透光检验卡</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>按匀度与帘纹条数分档，复核样本对应的抄纸工序和归档位置。</Typography>
        </Box>
        <Button variant="contained" size="large" onClick={() => setShowForm((current) => !current)} data-testid="new-sample">
          {showForm ? '收起登记' : '新建样本'}
        </Button>
      </Box>

      {errorMessage && <Alert severity="warning">{errorMessage}</Alert>}

      {showForm && (
        <Card data-testid="form-sample" sx={{ borderColor: '#9eb096' }}>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h5" sx={{ mb: 2 }}>登记成纸样本</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><TextField fullWidth label="样本编号" value={form.sampleNo} onChange={(event) => updateForm('sampleNo', event.target.value)} inputProps={{ 'data-testid': 'field-sampleNo' }} /></Grid>
              <Grid item xs={12} md={4}>
                <TextField select fullWidth label="对应工序" value={form.runId} onChange={(event) => updateForm('runId', Number(event.target.value))} SelectProps={{ native: true, inputProps: { 'data-testid': 'field-runId' } }}>
                  {!runs.some((run) => run.id === form.runId) && <option value={form.runId}>工序数据载入中</option>}
                  {runs.map((run) => <option key={run.id} value={run.id}>{run.runNo} · {run.runDate}</option>)}
                </TextField>
              </Grid>
              <Grid item xs={6} md={2}><TextField fullWidth type="number" label="样本尺寸" value={form.sizeMm} onChange={(event) => updateForm('sizeMm', Number(event.target.value))} inputProps={{ min: 20, max: 1000, step: 1, 'data-testid': 'field-sizeMm' }} InputProps={{ endAdornment: 'mm' }} /></Grid>
              <Grid item xs={6} md={3}><TextField fullWidth type="number" label="帘纹条数" value={form.stripeCount} onChange={(event) => updateForm('stripeCount', Number(event.target.value))} inputProps={{ min: 1, max: 300, step: 1, 'data-testid': 'field-stripeCount' }} /></Grid>
              <Grid item xs={6} md={3}>
                <TextField select fullWidth label="匀度" value={form.evenness} onChange={(event) => updateForm('evenness', event.target.value as EvennessLevel)} SelectProps={{ native: true, inputProps: { 'data-testid': 'field-evenness' } }}>
                  {EVENNESS_LEVELS.map((option) => <option key={option} value={option}>{option}</option>)}
                </TextField>
              </Grid>
              <Grid item xs={12} md={5}><TextField fullWidth label="存档位" value={form.archiveBin} onChange={(event) => updateForm('archiveBin', event.target.value)} inputProps={{ 'data-testid': 'field-archiveBin' }} /></Grid>
            </Grid>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 2.5 }}>
              <Button onClick={() => setShowForm(false)}>取消</Button>
              <Button variant="contained" onClick={handleSubmit} disabled={submitting} data-testid="submit-sample">保存样本</Button>
            </Box>
          </CardContent>
        </Card>
      )}

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <StatBadge label="样本总数" value={samples.length} detail="档案柜入库数量" />
        <StatBadge label="密纹样本" value={denseCount} detail="帘纹条数不少于 50" tone="bamboo" />
        <StatBadge label="待复检" value={openTickets.length} detail="观察中与未复检事项" tone={openTickets.length ? 'warning' : 'neutral'} />
        <StatBadge label="超七天未检" value={overdueCount} detail="建项或上次复检逾七天" tone={overdueCount ? 'warning' : 'neutral'} />
      </Box>

      <Card>
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={3}>
              <TextField select fullWidth size="small" label="匀度筛选" value={evennessFilter} onChange={(event) => setEvennessFilter(event.target.value as EvennessLevel | '全部')} SelectProps={{ native: true }}>
                <option value="全部">全部匀度</option>
                {EVENNESS_LEVELS.map((option) => <option key={option} value={option}>{option}</option>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField select fullWidth size="small" label="复检状态" value={recheckFilter} onChange={(event) => setRecheckFilter(event.target.value as RecheckStatus | '全部')} SelectProps={{ native: true }} inputProps={{ 'data-testid': 'filter-recheckStatus' }}>
                <option value="全部">全部复检状态</option>
                {RECHECK_STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={8} md={3}>
              <RulerInput label="最低帘纹条数" value={stripeFloor} onChange={setStripeFloor} unit="条" min={0} max={300} step={1} compact />
            </Grid>
            <Grid item xs={6} md={1.5}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Typography variant="body2" color="text.secondary">当前记录</Typography><Typography variant="h5" data-testid="count-sample">{filteredSamples.length}</Typography></Box>
            </Grid>
            <Grid item xs={6} md={1.5}><Button fullWidth variant="outlined" onClick={() => { setEvennessFilter('全部'); setRecheckFilter('全部'); setStripeFloor(0) }}>重置分档</Button></Grid>
          </Grid>
        </CardContent>
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
        {filteredSamples.map((sample) => {
          const run = runById.get(sample.runId)
          const mould = run ? mouldById.get(run.mouldId) : undefined
          const tier = stripeTier(sample.stripeCount)
          const gap = run?.measuredGap ?? mould?.stripeGap ?? 1
          const ticket = ticketBySample.get(sample.id ?? -1)
          const latest = ticket ? latestRecord(ticket) : undefined
          const overdue = ticket ? isOverSevenDays(ticket) : false
          const idleDays = ticket ? daysSinceLastAction(ticket) : undefined
          const triggers = recheckTriggers(sample, run)
          const highlight = Boolean(ticket && ticket.status !== '已闭环')
          return (
            <Card key={sample.id ?? sample.sampleNo} data-testid="row-sample" sx={{ bgcolor: highlight ? '#fff7df' : '#fffdf7', borderColor: overdue ? '#d9a928' : undefined }}>
              <CardContent sx={{ p: 2.25 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, alignItems: 'flex-start', mb: 1.5 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>{sample.sampleNo}</Typography>
                    <Typography variant="caption" color="text.secondary">工序 {run?.runNo ?? '待关联'} · {run?.runDate ?? '日期待补'}</Typography>
                  </Box>
                  <Chip size="small" color={tier.color} label={tier.label} />
                </Box>
                <GrainStripePreview
                  gap={gap}
                  wireDiameter={mould?.wireDiameter ?? 0.25}
                  density={mould?.meshDensity}
                  stripeCount={sample.stripeCount}
                  direction={run?.stripeDirection === '横帘纹' ? 'horizontal' : 'vertical'}
                />
                <Grid container spacing={1} sx={{ mt: 1 }}>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">帘纹条数</Typography><Typography sx={{ fontWeight: 700 }}>{sample.stripeCount} 条</Typography></Grid>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">匀度</Typography><Typography sx={{ fontWeight: 700, color: sample.evenness === '均匀' ? 'success.dark' : 'warning.dark' }}>{sample.evenness}</Typography></Grid>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">样本尺寸</Typography><Typography>{sample.sizeMm} mm · {mmToCm(sample.sizeMm)} cm</Typography></Grid>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">纸页克重</Typography><Typography>{run ? formatGrammage(run.grammage) : '待补'}</Typography></Grid>
                </Grid>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center', mt: 1.5, flexWrap: 'wrap' }}>
                  <Chip size="small" variant="outlined" label={`存档 ${sample.archiveBin}`} />
                  {run && isGapOutOfTolerance(run.deviation) && <Chip size="small" color="warning" label={`偏差 ${run.deviation > 0 ? '+' : ''}${run.deviation.toFixed(2)} mm`} />}
                </Box>

                {ticket && (
                  <Box sx={{ mt: 1.75, pt: 1.5, borderTop: '1px dashed #d8c69e' }} data-testid={`recheck-panel-${sample.id ?? sample.sampleNo}`}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 0.75, flexWrap: 'wrap' }}>
                      <Chip
                        size="small"
                        color={ticket.status === '已闭环' ? 'success' : ticket.status === '观察中' ? 'info' : 'warning'}
                        variant={ticket.status === '待复检' ? 'filled' : 'outlined'}
                        label={`复检 · ${ticket.status}`}
                      />
                      {overdue && <Chip size="small" color="warning" label={`超七天未检（${idleDays} 天）`} data-testid={`recheck-overdue-${sample.id ?? sample.sampleNo}`} />}
                    </Box>
                    {triggers.length > 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: latest ? 0.75 : 1 }}>
                        触发原因：{triggers.join('；')}
                      </Typography>
                    )}
                    {latest ? (
                      <Box sx={{ mb: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 650 }}>
                          当前结论：{latest.conclusion}
                          <Typography component="span" variant="caption" color="text.secondary" sx={{ fontWeight: 400, ml: 0.75 }}>
                            {latest.date} · {latest.handler}
                          </Typography>
                        </Typography>
                        {latest.note && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>说明：{latest.note}</Typography>}
                        {latest.nextDate && <Typography variant="caption" color={overdue ? 'warning.dark' : 'text.secondary'} sx={{ display: 'block' }}>下次复检：{latest.nextDate}</Typography>}
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>已复检 {ticket.records.length} 次，历史记录完整保留</Typography>
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>尚未登记复检，进入本页已自动建立待复检事项。</Typography>
                    )}
                    <Button
                      size="small"
                      variant={ticket.status === '已闭环' ? 'outlined' : 'contained'}
                      color={ticket.status === '已闭环' ? 'primary' : 'warning'}
                      onClick={() => setActiveTicket(ticket)}
                      data-testid={`open-recheck-${sample.id ?? sample.sampleNo}`}
                    >
                      {latest ? '补登复检' : '登记复检'}
                    </Button>
                  </Box>
                )}
              </CardContent>
            </Card>
          )
        })}
        {filteredSamples.length === 0 && (
          <Card sx={{ gridColumn: '1 / -1' }}><CardContent sx={{ textAlign: 'center', py: 7 }}><Typography color="text.secondary">没有符合当前匀度、复检状态与帘纹条数分档的样本</Typography></CardContent></Card>
        )}
      </Box>

      <RecheckDialog
        open={openTicket !== null}
        ticket={openTicket}
        sampleNo={samples.find((sample) => sample.id === openTicket?.sampleId)?.sampleNo ?? ''}
        onClose={() => setActiveTicket(null)}
        onSubmit={handleRecheckSubmit}
      />
    </Stack>
  )
}
