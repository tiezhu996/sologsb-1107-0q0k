import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { RECHECK_CONCLUSIONS, type RecheckConclusion, type RecheckRecordInput, type RecheckTicket } from '../../types/recheck'
import { latestRecord, nextDueDate, todayIso } from '../../utils/recheck'

interface RecheckDialogProps {
  open: boolean
  ticket: RecheckTicket | null
  sampleNo: string
  onClose: () => void
  onSubmit: (ticketId: number, input: RecheckRecordInput) => Promise<void> | void
}

const emptyForm: RecheckRecordInput = {
  date: todayIso(),
  handler: '',
  conclusion: '复检合格',
  note: '',
  nextDate: '',
}

export function RecheckDialog({ open, ticket, sampleNo, onClose, onSubmit }: RecheckDialogProps) {
  const [form, setForm] = useState<RecheckRecordInput>(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({ ...emptyForm, date: todayIso() })
      setSaving(false)
    }
  }, [open, ticket?.id])

  const latest = useMemo(() => (ticket ? latestRecord(ticket) : undefined), [ticket])
  const observing = form.conclusion === '继续观察'
  const due = ticket ? nextDueDate(ticket) : undefined
  const valid = Boolean(ticket && form.date && form.handler.trim() && (!observing || form.nextDate))

  const update = <K extends keyof RecheckRecordInput,>(key: K, value: RecheckRecordInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = async () => {
    if (!ticket || !valid) return
    setSaving(true)
    const payload: RecheckRecordInput = {
      date: form.date,
      handler: form.handler.trim(),
      conclusion: form.conclusion,
      note: form.note?.trim() || undefined,
      nextDate: observing && form.nextDate ? form.nextDate : undefined,
    }
    await onSubmit(ticket.id as number, payload)
    setSaving(false)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" data-testid="recheck-dialog">
      <DialogTitle sx={{ pb: 1 }}>
        登记复检结果
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontWeight: 400 }}>
          样本 {sampleNo} · 当前状态 {ticket?.status ?? '—'}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {latest && (
            <Box sx={{ bgcolor: '#f6f1e4', borderRadius: 1.5, p: 1.5 }}>
              <Typography variant="caption" color="text.secondary">上次复检（{latest.date} · {latest.handler}）</Typography>
              <Typography variant="body2" sx={{ fontWeight: 650 }}>{latest.conclusion}{latest.note ? `：${latest.note}` : ''}</Typography>
              {due && <Typography variant="caption" color="text.secondary">下次复检日期：{due}</Typography>}
            </Box>
          )}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="date"
                label="复检日期"
                value={form.date}
                onChange={(event) => update('date', event.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ 'data-testid': 'recheck-date' }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="处理人"
                value={form.handler}
                onChange={(event) => update('handler', event.target.value)}
                inputProps={{ 'data-testid': 'recheck-handler' }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                select
                fullWidth
                label="复检结论"
                value={form.conclusion}
                onChange={(event) => update('conclusion', event.target.value as RecheckConclusion)}
                SelectProps={{ native: false }}
                inputProps={{ 'data-testid': 'recheck-conclusion' }}
              >
                {RECHECK_CONCLUSIONS.map((option) => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </TextField>
            </Grid>
            {observing && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  type="date"
                  label="下次复检日期"
                  value={form.nextDate}
                  onChange={(event) => update('nextDate', event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  helperText="继续观察时补登下次复检日期，工作台据此提醒超期"
                  inputProps={{ min: form.date, 'data-testid': 'recheck-nextDate' }}
                />
              </Grid>
            )}
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                minRows={2}
                label="说明"
                value={form.note}
                onChange={(event) => update('note', event.target.value)}
                placeholder="记录观察到的现象、处理方式等"
                inputProps={{ 'data-testid': 'recheck-note' }}
              />
            </Grid>
          </Grid>

          <Divider sx={{ mt: 1 }}>
            <Chip size="small" variant="outlined" label={`复检历史 ${ticket?.records.length ?? 0} 条`} />
          </Divider>
          {ticket && ticket.records.length > 0 ? (
            <Table size="small" sx={{ '& td, & th': { py: 0.75 } }}>
              <TableHead>
                <TableRow>
                  <TableCell>复检日期</TableCell>
                  <TableCell>处理人</TableCell>
                  <TableCell>结论</TableCell>
                  <TableCell>下次日期</TableCell>
                  <TableCell>说明</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...ticket.records].reverse().map((record) => (
                  <TableRow key={record.id} data-testid="recheck-history-row">
                    <TableCell>{record.date}</TableCell>
                    <TableCell>{record.handler}</TableCell>
                    <TableCell sx={{ fontWeight: 650 }}>{record.conclusion}</TableCell>
                    <TableCell>{record.nextDate ?? '—'}</TableCell>
                    <TableCell sx={{ maxWidth: 180 }}>
                      <Typography variant="caption">{record.note ?? '—'}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
              尚无复检记录，本次为首检登记。
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!valid || saving} data-testid="recheck-submit">
          保存复检
        </Button>
      </DialogActions>
    </Dialog>
  )
}
