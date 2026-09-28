import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useRecheckStore } from '../../stores/recheckStore'
import type { PaperSample } from '../../types/paper-sample'
import { RECHECK_RESULTS, type RecheckItem, type RecheckResult } from '../../types/recheck'
import type { SheetRun } from '../../types/sheet-run'
import { isRecheckOverdue, recheckReasons } from '../../utils/recheck'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const statusColor: Record<string, 'warning' | 'info' | 'success' | 'error'> = {
  待复检: 'warning',
  观察中: 'info',
  已合格: 'success',
  不合格: 'error',
}

interface RecheckDialogProps {
  open: boolean
  item: RecheckItem | null
  sample: PaperSample | null
  run?: SheetRun
  onClose: () => void
}

export function RecheckDialog({ open, item, sample, run, onClose }: RecheckDialogProps) {
  const addRecheckEntry = useRecheckStore((state) => state.addRecheckEntry)
  const storeError = useRecheckStore((state) => state.error)
  const [checkDate, setCheckDate] = useState(todayIso())
  const [handler, setHandler] = useState('')
  const [result, setResult] = useState<RecheckResult>('继续观察')
  const [note, setNote] = useState('')
  const [nextDate, setNextDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (open) {
      setCheckDate(todayIso())
      setHandler('')
      setResult('继续观察')
      setNote('')
      setNextDate('')
      setFormError('')
    }
  }, [open, item?.id])

  const today = todayIso()
  const reasons = useMemo(() => (sample ? recheckReasons(sample, run) : []), [run, sample])
  const overdue = item ? isRecheckOverdue(item, today) : false
  const sortedEntries = useMemo(
    () => (item ? [...item.entries].sort((a, b) => b.createdAt - a.createdAt) : []),
    [item],
  )

  if (!item || !sample) return null

  const handleSubmit = async () => {
    if (!checkDate || !handler.trim()) {
      setFormError('请填写复检日期与处理人')
      return
    }
    if (result === '继续观察' && !nextDate) {
      setFormError('继续观察时请补下次复检日期')
      return
    }
    setFormError('')
    setSubmitting(true)
    const ok = await addRecheckEntry(item.id as number, {
      checkDate,
      handler,
      result,
      note,
      nextDate: result === '继续观察' ? nextDate : undefined,
    })
    setSubmitting(false)
    if (ok) {
      setNote('')
      setNextDate('')
      setResult('继续观察')
    }
  }

  const finished = item.status === '已合格' || item.status === '不合格'

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth data-testid="recheck-dialog">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h6">复检事项 · {sample.sampleNo}</Typography>
          <Typography variant="caption" color="text.secondary">
            {run ? `关联工序 ${run.runNo} · ${run.runDate}` : '工序待关联'} · 建项于 {item.raisedDate}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          {overdue && <Chip size="small" color="error" label="超七天未检" data-testid="recheck-overdue" />}
          <Chip size="small" color={statusColor[item.status] ?? 'default'} label={item.status} data-testid="recheck-status" />
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {(formError || storeError) && <Alert severity="warning" sx={{ mb: 2 }}>{formError || storeError}</Alert>}

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          {reasons.map((reason) => <Chip key={reason} size="small" variant="outlined" color="warning" label={reason} />)}
        </Stack>

        <Box sx={{ mb: 2.5 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>当前结论</Typography>
          {item.currentConclusion ? (
            <Typography sx={{ fontWeight: 650 }} data-testid="recheck-current-conclusion">{item.currentConclusion}</Typography>
          ) : (
            <Typography color="text.secondary" data-testid="recheck-current-conclusion">尚未登记复检，等待首检。</Typography>
          )}
          {item.nextDate && (
            <Typography variant="body2" color={overdue ? 'error.main' : 'text.secondary'} sx={{ mt: 0.5 }}>
              下次复检日期：{item.nextDate}{overdue ? '（已超七天未检）' : ''}
            </Typography>
          )}
        </Box>

        {!finished && (
          <Box sx={{ border: '1px solid #d7ccb6', borderRadius: 2, p: { xs: 1.75, md: 2.25 }, bgcolor: '#fdfaf2', mb: 2.5 }} data-testid="recheck-form">
            <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 700 }}>登记复检</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <TextField fullWidth type="date" label="复检日期" value={checkDate} onChange={(event) => setCheckDate(event.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ 'data-testid': 'recheck-field-date' }} />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField fullWidth label="处理人" value={handler} onChange={(event) => setHandler(event.target.value)} inputProps={{ 'data-testid': 'recheck-field-handler' }} />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField select fullWidth label="复检结论" value={result} onChange={(event) => setResult(event.target.value as RecheckResult)} SelectProps={{ native: true, inputProps: { 'data-testid': 'recheck-field-result' } }}>
                  {RECHECK_RESULTS.map((option) => <option key={option} value={option}>{option}</option>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  type="date"
                  label="下次复检日期"
                  value={nextDate}
                  onChange={(event) => setNextDate(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  disabled={result !== '继续观察'}
                  required={result === '继续观察'}
                  helperText={result === '继续观察' ? '继续观察须补下次日期' : '仅继续观察时填写'}
                  inputProps={{ 'data-testid': 'recheck-field-nextDate' }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth multiline minRows={2} label="说明" value={note} onChange={(event) => setNote(event.target.value)} placeholder="记录透光观察、帘纹复核与处理说明" inputProps={{ 'data-testid': 'recheck-field-note' }} />
              </Grid>
            </Grid>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5 }}>
              <Button variant="contained" onClick={handleSubmit} disabled={submitting} data-testid="recheck-submit">保存复检记录</Button>
            </Box>
          </Box>
        )}
        {finished && (
          <Alert severity={item.status === '已合格' ? 'success' : 'error'} sx={{ mb: 2.5 }} data-testid="recheck-finished">
            该事项已{item.status === '已合格' ? '复检合格' : '判定不合格'}，历史记录如下。
          </Alert>
        )}

        <Box>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>复检历史（共 {item.entries.length} 次）</Typography>
          {sortedEntries.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>暂无复检记录。</Typography>}
          <Stack spacing={1.5}>
            {sortedEntries.map((entry, index) => (
              <Box key={entry.id ?? `${entry.checkDate}-${index}`} data-testid="recheck-history-item">
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography sx={{ fontWeight: 700 }}>{entry.checkDate}</Typography>
                    <Chip size="small" color={statusColor[entry.result === '复检合格' ? '已合格' : entry.result === '复检不合格' ? '不合格' : '观察中']} label={entry.result} />
                    {index === 0 && <Chip size="small" variant="outlined" label="最新" />}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">处理人：{entry.handler}</Typography>
                </Box>
                {entry.note && <Typography variant="body2" sx={{ mt: 0.5 }}>{entry.note}</Typography>}
                {entry.nextDate && <Typography variant="caption" color="text.secondary">下次复检：{entry.nextDate}</Typography>}
                {index < sortedEntries.length - 1 && <Divider sx={{ mt: 1.5 }} />}
              </Box>
            ))}
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  )
}
