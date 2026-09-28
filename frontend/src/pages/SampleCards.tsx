import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Grid, Stack, TextField, Typography } from '@mui/material'
import { GrainStripePreview } from '../components/common/GrainStripePreview'
import { RecheckDialog } from '../components/common/RecheckDialog'
import { RulerInput } from '../components/common/RulerInput'
import { StatBadge } from '../components/common/StatBadge'
import { useUnitConvert } from '../hooks/useUnitConvert'
import { useMouldStore } from '../stores/mouldStore'
import { useRecheckStore } from '../stores/recheckStore'
import { useRunStore } from '../stores/runStore'
import { useSampleStore } from '../stores/sampleStore'
import { EVENNESS_LEVELS, type EvennessLevel, type PaperSampleInput } from '../types/paper-sample'
import { RECHECK_STATUS_FILTERS, type RecheckItem, type RecheckStatus, type RecheckStatusFilter } from '../types/recheck'
import { isGapOutOfTolerance } from '../utils/stripe'
import { isRecheckOverdue } from '../utils/recheck'

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

const recheckChipColor: Record<RecheckStatus, 'warning' | 'info' | 'success' | 'error'> = {
  待复检: 'warning',
  观察中: 'info',
  已合格: 'success',
  不合格: 'error',
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function SampleCards() {
  const samples = useSampleStore((state) => state.paperSamples)
  const error = useSampleStore((state) => state.error)
  const loadSamples = useSampleStore((state) => state.loadSamples)
  const addSample = useSampleStore((state) => state.addSample)
  const runs = useRunStore((state) => state.sheetRuns)
  const runError = useRunStore((state) => state.error)
  const loadRuns = useRunStore((state) => state.loadRuns)
  const moulds = useMouldStore((state) => state.moulds)
  const mouldError = useMouldStore((state) => state.error)
  const loadMoulds = useMouldStore((state) => state.loadMoulds)
  const rechecks = useRecheckStore((state) => state.rechecks)
  const recheckError = useRecheckStore((state) => state.error)
  const syncRechecks = useRecheckStore((state) => state.syncRechecks)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PaperSampleInput>(emptySampleForm)
  const [evennessFilter, setEvennessFilter] = useState<EvennessLevel | '全部'>('全部')
  const [statusFilter, setStatusFilter] = useState<RecheckStatusFilter>('全部')
  const [stripeFloor, setStripeFloor] = useState(0)
  const [activeSampleId, setActiveSampleId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { mmToCm, formatGrammage } = useUnitConvert()

  useEffect(() => {
    void loadRuns()
    void loadMoulds()
    void loadSamples()
    // 进入样本页自动建立待复检事项，重复进入不新增。
    void syncRechecks()
  }, [loadMoulds, loadRuns, loadSamples, syncRechecks])

  const runById = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs])
  const mouldById = useMemo(() => new Map(moulds.map((mould) => [mould.id, mould])), [moulds])
  const recheckBySample = useMemo(() => new Map(rechecks.map((item) => [item.sampleId, item])), [rechecks])
  const today = todayIso()

  const filteredSamples = useMemo(
    () => samples.filter((sample) => {
      if (evennessFilter !== '全部' && sample.evenness !== evennessFilter) return false
      if (sample.stripeCount < stripeFloor) return false
      if (statusFilter !== '全部') {
        const item = sample.id === undefined ? undefined : recheckBySample.get(sample.id)
        if (!item) return false
        if (statusFilter === '超七天未检') return isRecheckOverdue(item, today)
        return item.status === statusFilter
      }
      return true
    }),
    [evennessFilter, recheckBySample, samples, statusFilter, stripeFloor, today],
  )
  const denseCount = samples.filter((sample) => sample.stripeCount >= 50).length
  const activeRechecks = rechecks.filter((item) => item.status === '待复检' || item.status === '观察中')
  const overdueRechecks = rechecks.filter((item) => isRecheckOverdue(item, today))

  const updateForm = <K extends keyof PaperSampleInput,>(key: K, value: PaperSampleInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = async () => {
    if (!form.sampleNo.trim() || !form.archiveBin.trim() || form.sizeMm <= 0 || form.stripeCount <= 0) return
    setSubmitting(true)
    const created = await addSample({ ...form, sampleNo: form.sampleNo.trim(), archiveBin: form.archiveBin.trim() })
    if (created) await syncRechecks()
    setSubmitting(false)
    if (created) {
      setForm(emptySampleForm)
      setShowForm(false)
    }
  }

  const activeItem: RecheckItem | null = activeSampleId === null ? null : (recheckBySample.get(activeSampleId) ?? null)
  const activeSample = activeSampleId === null ? null : samples.find((sample) => sample.id === activeSampleId) ?? null
  const activeRun = activeSample ? runById.get(activeSample.runId) : undefined

  const errorMessage = error ?? runError ?? mouldError ?? recheckError

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box>
          <Typography component="h1" variant="h3" color="#344a34">成纸样本与透光检验卡</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>按匀度与帘纹条数分档，复核样本对应的抄纸工序和归档位置，登记复检结论。</Typography>
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
        <StatBadge label="待复检/观察中" value={activeRechecks.length} detail="匀度或偏差触发，尚未闭环" tone={activeRechecks.length ? 'warning' : 'neutral'} />
        <StatBadge label="超七天未检" value={overdueRechecks.length} detail="首检逾期或下次复检逾期" tone={overdueRechecks.length ? 'warning' : 'neutral'} />
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
              <TextField select fullWidth size="small" label="复检状态" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as RecheckStatusFilter)} SelectProps={{ native: true }} inputProps={{ 'data-testid': 'filter-recheck-status' }}>
                {RECHECK_STATUS_FILTERS.map((option) => <option key={option} value={option}>{option}</option>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={8} md={3}>
              <RulerInput label="最低帘纹条数" value={stripeFloor} onChange={setStripeFloor} unit="条" min={0} max={300} step={1} compact />
            </Grid>
            <Grid item xs={6} md={1.5}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Typography variant="body2" color="text.secondary">当前记录</Typography><Typography variant="h5" data-testid="count-sample">{filteredSamples.length}</Typography></Box>
            </Grid>
            <Grid item xs={6} md={1.5}><Button fullWidth variant="outlined" onClick={() => { setEvennessFilter('全部'); setStatusFilter('全部'); setStripeFloor(0) }}>重置分档</Button></Grid>
          </Grid>
        </CardContent>
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
        {filteredSamples.map((sample) => {
          const run = runById.get(sample.runId)
          const mould = run ? mouldById.get(run.mouldId) : undefined
          const tier = stripeTier(sample.stripeCount)
          const gap = run?.measuredGap ?? mould?.stripeGap ?? 1
          const item = sample.id === undefined ? undefined : recheckBySample.get(sample.id)
          const overdue = item ? isRecheckOverdue(item, today) : false
          const finished = item?.status === '已合格' || item?.status === '不合格'
          const cardBg = item ? (overdue ? '#fff0ee' : finished ? '#f3f8ef' : '#fff9e8') : '#fffdf7'
          return (
            <Card key={sample.id ?? sample.sampleNo} data-testid="row-sample" sx={{ bgcolor: cardBg }}>
              <CardContent sx={{ p: 2.25 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, alignItems: 'flex-start', mb: 1.5 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>{sample.sampleNo}</Typography>
                    <Typography variant="caption" color="text.secondary">工序 {run?.runNo ?? '待关联'} · {run?.runDate ?? '日期待补'}</Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap justifyContent="flex-end">
                    {item && <Chip size="small" color={recheckChipColor[item.status]} label={item.status} data-testid={`recheck-badge-${sample.id}`} />}
                    {overdue && <Chip size="small" color="error" variant="outlined" label="超七天未检" />}
                    <Chip size="small" color={tier.color} label={tier.label} />
                  </Stack>
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
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    <Chip size="small" variant="outlined" label={`存档 ${sample.archiveBin}`} />
                    {run && isGapOutOfTolerance(run.deviation) && <Chip size="small" color="warning" label={`偏差 ${run.deviation > 0 ? '+' : ''}${run.deviation.toFixed(2)} mm`} />}
                  </Stack>
                  {item && sample.id !== undefined && (
                    <Button
                      size="small"
                      variant={finished ? 'outlined' : 'contained'}
                      color={overdue ? 'error' : 'primary'}
                      onClick={() => setActiveSampleId(sample.id as number)}
                      data-testid={`open-recheck-${sample.id}`}
                    >
                      {finished ? '查看复检' : item.entries.length > 0 ? '续检/查看' : '登记复检'}
                    </Button>
                  )}
                </Box>
                {item && (
                  <Box sx={{ mt: 1.25, pt: 1.25, borderTop: '1px dashed #d7ccb6' }} data-testid={`recheck-summary-${sample.id}`}>
                    <Typography variant="caption" color="text.secondary">
                      当前结论：{item.currentConclusion || '待首检'}
                      {item.nextDate ? ` · 下次复检 ${item.nextDate}` : ''} · 已复检 {item.entries.length} 次
                    </Typography>
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

      <RecheckDialog open={activeSampleId !== null} item={activeItem} sample={activeSample} run={activeRun} onClose={() => setActiveSampleId(null)} />
    </Stack>
  )
}
