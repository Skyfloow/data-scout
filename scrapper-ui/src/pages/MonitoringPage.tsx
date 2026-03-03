import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Chip,
  Tabs,
  Tab,
  Tooltip,
  Stack,
  Collapse,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import HistoryIcon from '@mui/icons-material/History';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import {
  useGetTrackersQuery,
  useGetTrackersLatestResultsQuery,
  useRemoveTrackerMutation,
  useUpdateTrackerStatusMutation,
  useGetPriceHistoryQuery,
  useGetKeywordRankingsQuery,
} from '../store/apiSlice';
import {
  MonitoredEntity,
  PriceHistoryPoint,
  SerpResult,
  TrackerLatestData,
  TrackerResult,
} from '../types';
import { useTranslation } from 'react-i18next';

function hasKeywordLatestData(data: TrackerLatestData): data is { scrapedAt: string; topAsin?: string; topTitle?: string } {
  return Boolean(data && ('topAsin' in data || 'topTitle' in data));
}

function hasProductLatestData(data: TrackerLatestData): data is { scrapedAt: string; price?: number } {
  return Boolean(data && 'price' in data);
}

export default function MonitoringPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);

  const { data: trackersData, isLoading: isLoadingSettings } = useGetTrackersQuery(undefined, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const { data: resultsData, isLoading: isLoadingResults } = useGetTrackersLatestResultsQuery(undefined, {
    pollingInterval: 15000,
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const [removeTracker] = useRemoveTrackerMutation();
  const [updateTrackerStatus] = useUpdateTrackerStatusMutation();

  const [historyEntity, setHistoryEntity] = useState<MonitoredEntity | null>(null);

  const handleRemove = async (id: string) => {
    await removeTracker(id).unwrap();
  };

  const handleToggleStatus = async (id: string, currentStatus: MonitoredEntity['status']) => {
    const nextStatus = currentStatus === 'paused' ? 'active' : 'paused';
    await updateTrackerStatus({ id, status: nextStatus }).unwrap();
  };

  const resultRows = resultsData?.data ?? [];
  const settingsRows = trackersData?.data ?? [];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight="700">
          {t('monitoring.title')}
        </Typography>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
          <Tab label={t('monitoring.tabResults')} />
          <Tab label={t('monitoring.tabSettings')} />
        </Tabs>
      </Box>

      {tab === 0 && (
        <Box>
          <Card sx={{ mb: 4, bgcolor: 'background.paper', borderRadius: 1 }}>
            <CardContent>
              <Typography variant="body1" color="text.secondary">
                {t('monitoring.resultsDesc')}
              </Typography>
            </CardContent>
          </Card>

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('monitoring.entity')}</TableCell>
                  <TableCell>{t('monitoring.type')}</TableCell>
                  <TableCell align="right">{t('monitoring.latestMetric')}</TableCell>
                  <TableCell>{t('monitoring.marketplace')}</TableCell>
                  <TableCell>{t('monitoring.updatedAt')}</TableCell>
                  <TableCell align="right">{t('monitoring.history')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoadingResults && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                )}
                {resultRows.map((item: TrackerResult) => {
                  const keywordLatest = hasKeywordLatestData(item.latestData) ? item.latestData : null;
                  const productLatest = hasProductLatestData(item.latestData) ? item.latestData : null;
                  const updatedAt = item.latestData?.scrapedAt || item.lastScrapedAt;

                  return (
                    <TableRow key={item.id} hover>
                      <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" fontWeight={500}>
                          {item.value}
                        </Typography>
                        {keywordLatest?.topTitle && (
                          <Typography variant="caption" color="text.secondary" noWrap display="block">
                            {t('monitoring.top1')}: {keywordLatest.topTitle}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={item.type.toUpperCase()}
                          color={item.type === 'keyword' ? 'secondary' : item.type === 'product' ? 'primary' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        {!item.latestData && !item.lastScrapedAt ? (
                          <Typography variant="body2" color="text.secondary">
                            {t('monitoring.waitingData')}
                          </Typography>
                        ) : item.type === 'product' ? (
                          <Typography variant="subtitle2" color="success.main" fontWeight="bold">
                            {productLatest?.price ? `$${productLatest.price}` : t('monitoring.updated')}
                          </Typography>
                        ) : item.type === 'keyword' ? (
                          <Typography variant="subtitle2" color="primary.main" fontWeight="bold">
                            {keywordLatest?.topAsin ? `${t('monitoring.topAsin')}: ${keywordLatest.topAsin}` : t('monitoring.updated')}
                          </Typography>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={item.marketplace} />
                      </TableCell>
                      <TableCell>{updatedAt ? new Date(updatedAt).toLocaleString() : '—'}</TableCell>
                      <TableCell align="right">
                        <IconButton color="primary" onClick={() => setHistoryEntity(item)} title={t('monitoring.history')}>
                          {item.type === 'keyword' ? <TrendingUpIcon /> : <HistoryIcon />}
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!isLoadingResults && resultRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      {t('monitoring.noActiveTrackers')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {tab === 1 && (
        <Box>
          <Card sx={{ mb: 4, bgcolor: 'background.paper', borderRadius: 1 }}>
            <CardContent>
              <Typography variant="body1" color="text.secondary">
                {t('monitoring.settingsDesc')}
              </Typography>
            </CardContent>
          </Card>

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('monitoring.type')}</TableCell>
                  <TableCell>{t('monitoring.value')}</TableCell>
                  <TableCell>{t('monitoring.marketplace')}</TableCell>
                  <TableCell>{t('monitoring.frequency')}</TableCell>
                  <TableCell>{t('monitoring.status')}</TableCell>
                  <TableCell>{t('monitoring.addedOn')}</TableCell>
                  <TableCell>{t('monitoring.lastScanned')}</TableCell>
                  <TableCell align="right">{t('monitoring.action')}</TableCell>
                  <TableCell align="right">{t('monitoring.delete')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoadingSettings && (
                  <TableRow>
                    <TableCell colSpan={9} align="center">
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                )}
                {settingsRows.map((item: MonitoredEntity) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Chip
                        size="small"
                        label={item.type.toUpperCase()}
                        color={item.type === 'keyword' ? 'secondary' : item.type === 'product' ? 'primary' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.value}
                    </TableCell>
                    <TableCell>{item.marketplace}</TableCell>
                    <TableCell>
                      {item.intervalHours < 1
                        ? `${Math.round(item.intervalHours * 60)} ${t('monitoring.min')}.`
                        : `${item.intervalHours}${t('monitoring.h')}.`}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={item.status === 'paused' ? t('monitoring.paused') : t('monitoring.active')}
                        color={item.status === 'paused' ? 'warning' : 'success'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{new Date(item.addedAt).toLocaleString()}</TableCell>
                    <TableCell>
                      {item.lastScrapedAt ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <CheckCircleIcon color="success" fontSize="small" />
                          <Typography variant="body2">{new Date(item.lastScrapedAt).toLocaleString()}</Typography>
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          {t('monitoring.pending')}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        color={item.status === 'paused' ? 'success' : 'warning'}
                        onClick={() => handleToggleStatus(item.id, item.status)}
                        title={item.status === 'paused' ? t('monitoring.resume') : t('monitoring.pause')}
                      >
                        {item.status === 'paused' ? <PlayCircleOutlineIcon /> : <PauseCircleOutlineIcon />}
                      </IconButton>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton color="error" onClick={() => handleRemove(item.id)} title={t('monitoring.delete')}>
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoadingSettings && settingsRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} align="center">
                      {t('monitoring.noActiveTrackers')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      <EntityHistoryDialog entity={historyEntity} onClose={() => setHistoryEntity(null)} />
    </Box>
  );
}

function EntityHistoryDialog({ entity, onClose }: { entity: MonitoredEntity | null; onClose: () => void }) {
  const { t } = useTranslation();
  if (!entity) return null;

  if (entity.type === 'product') {
    return <ProductHistoryDialog url={entity.value} onClose={onClose} />;
  }
  if (entity.type === 'keyword') {
    return <KeywordRankingsDialog keyword={entity.value} marketplace={entity.marketplace} onClose={onClose} />;
  }

  return (
    <Dialog open={true} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {t('monitoring.history')}: {entity.value}
      </DialogTitle>
      <DialogContent>
        <Typography>{t('monitoring.historyNotSupported', { type: entity.type })}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('monitoring.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}

function ProductHistoryDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: historyData, isFetching } = useGetPriceHistoryQuery(url);
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // no-op
    }
  };

  return (
    <Dialog open={true} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 0.25 }}>
            {t('monitoring.priceHistory')}
          </Typography>
          <Tooltip title={url}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                maxWidth: '100%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {url}
            </Typography>
          </Tooltip>
        </Box>
        <Tooltip title={copied ? t('monitoring.copied') : t('monitoring.copyUrl')}>
          <IconButton size="small" onClick={handleCopyUrl} aria-label="copy-url">
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent>
        {isFetching ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('monitoring.date')}</TableCell>
                  <TableCell>{t('monitoring.price')}</TableCell>
                  <TableCell>{t('monitoring.currency')}</TableCell>
                  <TableCell>{t('monitoring.eqUsd')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(historyData?.history ?? []).map((h: PriceHistoryPoint, i: number) => (
                  <TableRow key={`${h.scrapedAt}-${i}`}>
                    <TableCell>{new Date(h.scrapedAt).toLocaleString()}</TableCell>
                    <TableCell>{h.price}</TableCell>
                    <TableCell>{h.currency}</TableCell>
                    <TableCell>${h.priceUSD || h.price}</TableCell>
                  </TableRow>
                ))}
                {(!historyData?.history || historyData.history.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      {t('monitoring.noPriceHistory')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('monitoring.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}

function KeywordRankingsDialog({ keyword, marketplace, onClose }: { keyword: string; marketplace: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: rankingData, isFetching } = useGetKeywordRankingsQuery({ keyword, marketplace });
  const [expandedScans, setExpandedScans] = useState<Record<number, boolean>>({});
  const scans: SerpResult[] = rankingData?.data ?? [];
  const totalScans = scans.length;
  const totalResults = scans.reduce((sum, snap) => sum + (snap.rankings?.length || 0), 0);
  const totalSponsored = scans.reduce((sum, snap) => {
    const sponsoredInSnap = (snap.rankings || []).filter((r) => r.sponsored).length;
    return sum + sponsoredInSnap;
  }, 0);
  const averageResults = totalScans > 0 ? Math.round(totalResults / totalScans) : 0;
  const latestScanAt = scans[0]?.scrapedAt;
  const toggleScan = (index: number) => {
    setExpandedScans((prev) => ({ ...prev, [index]: !(prev[index] ?? index === 0) }));
  };

  return (
    <Dialog open={true} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ pb: 1.5 }}>
        <Stack spacing={1}>
          <Typography variant="h6" fontWeight={700}>
            {t('monitoring.keywordRankingHistory')}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }}>
            <Chip label={`"${keyword}"`} color="primary" variant="outlined" />
            <Chip label={`${t('monitoring.marketplace')}: ${marketplace}`} size="small" />
          </Stack>
        </Stack>
      </DialogTitle>
      <DialogContent>
        {isFetching ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
            {scans.length === 0 ? (
              <Typography align="center" sx={{ py: 3 }} color="text.secondary">
                {t('monitoring.noSearchHistory')}
              </Typography>
            ) : (
              <>
                <Card
                  variant="outlined"
                  sx={{
                    borderColor: 'divider',
                    background: (theme) => `linear-gradient(180deg, ${theme.palette.action.hover} 0%, transparent 100%)`,
                  }}
                >
                  <CardContent>
                    <Stack
                      direction={{ xs: 'column', md: 'row' }}
                      gap={1.5}
                      alignItems={{ xs: 'flex-start', md: 'center' }}
                      justifyContent="space-between"
                    >
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <Chip label={`${t('monitoring.totalScans')}: ${totalScans}`} size="small" color="primary" />
                        <Chip label={`${t('monitoring.avgResultsPerScan')}: ${averageResults}`} size="small" />
                      </Stack>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <Chip label={`${t('monitoring.sponsored')}: ${totalSponsored}`} size="small" color="warning" variant="outlined" />
                        <Chip label={`${t('monitoring.organic')}: ${totalResults - totalSponsored}`} size="small" color="success" variant="outlined" />
                        <Chip
                          label={`${t('monitoring.latestScan')}: ${latestScanAt ? new Date(latestScanAt).toLocaleString() : '—'}`}
                          size="small"
                          variant="outlined"
                        />
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>

                {scans.map((snap: SerpResult, index: number) => {
                  const sponsoredCount = (snap.rankings || []).filter((r) => r.sponsored).length;
                  const organicCount = (snap.rankings || []).length - sponsoredCount;
                  const isExpanded = expandedScans[index] ?? index === 0;

                  return (
                    <Card key={`${snap.scrapedAt}-${index}`} variant="outlined" sx={{ borderColor: 'divider' }}>
                      <CardContent sx={{ pb: '16px !important' }}>
                        <Stack
                          direction={{ xs: 'column', md: 'row' }}
                          justifyContent="space-between"
                          alignItems={{ xs: 'flex-start', md: 'center' }}
                          gap={1}
                        >
                          <Typography variant="subtitle2" color="text.secondary">
                            {t('monitoring.scannedAt')} {new Date(snap.scrapedAt).toLocaleString()}
                          </Typography>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip label={`${t('monitoring.resultsCount')}: ${snap.rankings?.length || 0}`} size="small" />
                            <Chip label={`${t('monitoring.sponsored')}: ${sponsoredCount}`} size="small" color="warning" variant="outlined" />
                            <Chip label={`${t('monitoring.organic')}: ${organicCount}`} size="small" color="success" variant="outlined" />
                            <Button
                              size="small"
                              variant="text"
                              onClick={() => toggleScan(index)}
                              endIcon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            >
                              {isExpanded ? t('monitoring.hideTable') : t('monitoring.showTable')}
                            </Button>
                          </Stack>
                        </Stack>

                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <TableContainer sx={{ mt: 1.5, border: (theme) => `1px solid ${theme.palette.divider}`, borderRadius: 1.5 }}>
                            <Table size="small" stickyHeader>
                              <TableHead>
                                <TableRow>
                                  <TableCell sx={{ width: 90 }}>{t('monitoring.rank')}</TableCell>
                                  <TableCell sx={{ width: 160 }}>{t('monitoring.asin')}</TableCell>
                                  <TableCell>{t('monitoring.columnTitle')}</TableCell>
                                  <TableCell sx={{ width: 110 }}>{t('monitoring.price')}</TableCell>
                                  <TableCell sx={{ width: 130 }}>{t('monitoring.ads')}</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {(snap.rankings || []).map((ranking) => (
                                  <TableRow
                                    key={`${ranking.rank}-${ranking.asin}`}
                                    hover
                                    sx={{
                                      '&:nth-of-type(even)': { backgroundColor: 'action.hover' },
                                    }}
                                  >
                                    <TableCell>
                                      <Chip
                                        label={`#${ranking.rank}`}
                                        size="small"
                                        color={ranking.rank <= 3 ? 'primary' : 'default'}
                                        variant={ranking.rank <= 3 ? 'filled' : 'outlined'}
                                        sx={{ fontWeight: 700 }}
                                      />
                                    </TableCell>
                                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 13 }}>{ranking.asin}</TableCell>
                                    <TableCell>
                                      <Tooltip title={ranking.title}>
                                        <Typography
                                          variant="body2"
                                          sx={{
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                          }}
                                        >
                                          {ranking.title}
                                        </Typography>
                                      </Tooltip>
                                    </TableCell>
                                    <TableCell>{ranking.price ? `$${ranking.price}` : '-'}</TableCell>
                                    <TableCell>
                                      {ranking.sponsored ? (
                                        <Chip label={t('monitoring.sponsored')} size="small" color="warning" />
                                      ) : (
                                        <Chip label={t('monitoring.organic')} size="small" color="success" />
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </Collapse>
                      </CardContent>
                    </Card>
                  );
                })}
              </>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('monitoring.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
