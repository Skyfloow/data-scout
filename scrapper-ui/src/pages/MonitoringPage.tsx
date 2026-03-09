import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  History,
  PauseCircle,
  PlayCircle,
  SearchCheck,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useGetKeywordRankingsQuery,
  useGetPriceHistoryQuery,
  useGetTrackersLatestResultsQuery,
  useGetTrackersQuery,
  useRemoveTrackerMutation,
  useUpdateTrackerStatusMutation,
} from '../store/apiSlice';
import { MonitoredEntity, PriceHistoryPoint, SerpResult, TrackerLatestData, TrackerResult } from '../types';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '../components/ui/table';

function hasKeywordLatestData(data: TrackerLatestData): data is { scrapedAt: string; topAsin?: string; topTitle?: string } {
  return Boolean(data && ('topAsin' in data || 'topTitle' in data));
}

function hasProductLatestData(data: TrackerLatestData): data is { scrapedAt: string; price?: number } {
  return Boolean(data && 'price' in data);
}

function typeVariant(type: string): 'default' | 'secondary' | 'warning' {
  if (type === 'keyword') return 'secondary';
  if (type === 'product') return 'default';
  return 'warning';
}

export default function MonitoringPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('results');

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
    <div className="stack-col" style={{ gap: 14 }}>
      <h1 className="page-title">{t('monitoring.title')}</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="results">{t('monitoring.tabResults')}</TabsTrigger>
          <TabsTrigger value="settings">{t('monitoring.tabSettings')}</TabsTrigger>
        </TabsList>

        <TabsContent value="results" className="stack-col" style={{ gap: 14 }}>
          <Card>
            <CardContent>
              <p className="muted">{t('monitoring.resultsDesc')}</p>
            </CardContent>
          </Card>

          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>{t('monitoring.entity')}</TH>
                  <TH>{t('monitoring.type')}</TH>
                  <TH className="text-right">{t('monitoring.latestMetric')}</TH>
                  <TH>{t('monitoring.marketplace')}</TH>
                  <TH>{t('monitoring.updatedAt')}</TH>
                  <TH className="text-right">{t('monitoring.history')}</TH>
                </TR>
              </THead>
              <TBody>
                {isLoadingResults ? (
                  <TR>
                    <TD colSpan={6} className="text-center">
                      <span className="loader loader-dark" />
                    </TD>
                  </TR>
                ) : null}

                {resultRows.map((item: TrackerResult) => {
                  const keywordLatest = hasKeywordLatestData(item.latestData) ? item.latestData : null;
                  const productLatest = hasProductLatestData(item.latestData) ? item.latestData : null;
                  const updatedAt = item.latestData?.scrapedAt || item.lastScrapedAt;

                  return (
                    <TR key={item.id}>
                      <TD style={{ maxWidth: 320 }}>
                        <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.value}</div>
                        {keywordLatest?.topTitle ? (
                          <div className="muted" style={{ fontSize: '0.74rem', marginTop: 2 }}>
                            {t('monitoring.top1')}: {keywordLatest.topTitle}
                          </div>
                        ) : null}
                      </TD>
                      <TD>
                        <Badge variant={typeVariant(item.type)}>{item.type.toUpperCase()}</Badge>
                      </TD>
                      <TD className="text-right">
                        {!item.latestData && !item.lastScrapedAt ? (
                          <span className="muted">{t('monitoring.waitingData')}</span>
                        ) : item.type === 'product' ? (
                          <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                            {productLatest?.price ? `$${productLatest.price}` : t('monitoring.updated')}
                          </span>
                        ) : item.type === 'keyword' ? (
                          <span style={{ color: 'var(--primary)', fontWeight: 700 }}>
                            {keywordLatest?.topAsin ? `${t('monitoring.topAsin')}: ${keywordLatest.topAsin}` : t('monitoring.updated')}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TD>
                      <TD>
                        <Badge variant="outline">{item.marketplace}</Badge>
                      </TD>
                      <TD>{updatedAt ? new Date(updatedAt).toLocaleString() : '—'}</TD>
                      <TD className="text-right">
                        <button className="icon-btn" onClick={() => setHistoryEntity(item)} title={t('monitoring.history')}>
                          {item.type === 'keyword' ? <TrendingUp size={16} /> : <History size={16} />}
                        </button>
                      </TD>
                    </TR>
                  );
                })}

                {!isLoadingResults && resultRows.length === 0 ? (
                  <TR>
                    <TD colSpan={6} className="text-center">
                      {t('monitoring.noActiveTrackers')}
                    </TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </TableWrap>
        </TabsContent>

        <TabsContent value="settings" className="stack-col" style={{ gap: 14 }}>
          <Card>
            <CardContent>
              <p className="muted">{t('monitoring.settingsDesc')}</p>
            </CardContent>
          </Card>

          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>{t('monitoring.type')}</TH>
                  <TH>{t('monitoring.value')}</TH>
                  <TH>{t('monitoring.marketplace')}</TH>
                  <TH>{t('monitoring.frequency')}</TH>
                  <TH>{t('monitoring.status')}</TH>
                  <TH>{t('monitoring.addedOn')}</TH>
                  <TH>{t('monitoring.lastScanned')}</TH>
                  <TH className="text-right">{t('monitoring.action')}</TH>
                  <TH className="text-right">{t('monitoring.delete')}</TH>
                </TR>
              </THead>
              <TBody>
                {isLoadingSettings ? (
                  <TR>
                    <TD colSpan={9} className="text-center">
                      <span className="loader loader-dark" />
                    </TD>
                  </TR>
                ) : null}

                {settingsRows.map((item: MonitoredEntity) => (
                  <TR key={item.id}>
                    <TD>
                      <Badge variant={typeVariant(item.type)}>{item.type.toUpperCase()}</Badge>
                    </TD>
                    <TD style={{ maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.value}</TD>
                    <TD>{item.marketplace}</TD>
                    <TD>
                      {item.intervalHours < 1
                        ? `${Math.round(item.intervalHours * 60)} ${t('monitoring.min')}.`
                        : `${item.intervalHours}${t('monitoring.h')}.`}
                    </TD>
                    <TD>
                      <Badge variant={item.status === 'paused' ? 'warning' : 'success'}>
                        {item.status === 'paused' ? t('monitoring.paused') : t('monitoring.active')}
                      </Badge>
                    </TD>
                    <TD>{new Date(item.addedAt).toLocaleString()}</TD>
                    <TD>
                      {item.lastScrapedAt ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <CheckCircle2 size={14} color="var(--success)" />
                          {new Date(item.lastScrapedAt).toLocaleString()}
                        </span>
                      ) : (
                        <span className="muted">{t('monitoring.pending')}</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      <button
                        className="icon-btn"
                        onClick={() => handleToggleStatus(item.id, item.status)}
                        title={item.status === 'paused' ? t('monitoring.resume') : t('monitoring.pause')}
                      >
                        {item.status === 'paused' ? <PlayCircle size={18} /> : <PauseCircle size={18} />}
                      </button>
                    </TD>
                    <TD className="text-right">
                      <button className="icon-btn" onClick={() => handleRemove(item.id)} title={t('monitoring.delete')}>
                        <Trash2 size={16} />
                      </button>
                    </TD>
                  </TR>
                ))}

                {!isLoadingSettings && settingsRows.length === 0 ? (
                  <TR>
                    <TD colSpan={9} className="text-center">
                      {t('monitoring.noActiveTrackers')}
                    </TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </TableWrap>
        </TabsContent>
      </Tabs>

      <EntityHistoryDialog entity={historyEntity} onClose={() => setHistoryEntity(null)} />
    </div>
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
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('monitoring.history')}: {entity.value}
          </DialogTitle>
        </DialogHeader>
        <div className="modal-scroll-area" style={{ paddingBottom: '14px' }}>{t('monitoring.historyNotSupported', { type: entity.type })}</div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('monitoring.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
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
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent width={920}>
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span>{t('monitoring.priceHistory')}</span>
            <button className="icon-btn" onClick={handleCopyUrl} title={copied ? t('monitoring.copied') : t('monitoring.copyUrl')}>
              <Copy size={15} />
            </button>
          </DialogTitle>
          <div className="muted" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={url}>
            {url}
          </div>
        </DialogHeader>

        <div className="modal-scroll-area">
          {isFetching ? (
            <div className="text-center" style={{ padding: '2rem 0' }}>
              <span className="loader loader-dark" />
            </div>
          ) : (
            <TableWrap style={{ overflowX: 'auto', overflowY: 'visible', width: '100%' }}>
              <Table style={{ minWidth: 400 }}>
                <THead>
                  <TR>
                    <TH>{t('monitoring.date')}</TH>
                    <TH>{t('monitoring.price')}</TH>
                    <TH>{t('monitoring.currency')}</TH>
                    <TH>{t('monitoring.eqUsd')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {(historyData?.history ?? []).map((h: PriceHistoryPoint, i: number) => (
                    <TR key={`${h.scrapedAt}-${i}`}>
                      <TD>{new Date(h.scrapedAt).toLocaleString()}</TD>
                      <TD>{h.price}</TD>
                      <TD>{h.currency}</TD>
                      <TD>${h.priceUSD || h.price}</TD>
                    </TR>
                  ))}
                  {(!historyData?.history || historyData.history.length === 0) ? (
                    <TR>
                      <TD colSpan={4} className="text-center">
                        {t('monitoring.noPriceHistory')}
                      </TD>
                    </TR>
                  ) : null}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('monitoring.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
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
  const totalSponsored = scans.reduce((sum, snap) => sum + (snap.rankings || []).filter((r) => r.sponsored).length, 0);
  const averageResults = totalScans > 0 ? Math.round(totalResults / totalScans) : 0;
  const latestScanAt = scans[0]?.scrapedAt;

  const toggleScan = (index: number) => {
    setExpandedScans((prev) => ({ ...prev, [index]: !(prev[index] ?? index === 0) }));
  };

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent width={1200}>
        <DialogHeader>
          <DialogTitle>{t('monitoring.keywordRankingHistory')}</DialogTitle>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <Badge variant="outline">"{keyword}"</Badge>
            <Badge variant="secondary">{t('monitoring.marketplace')}: {marketplace}</Badge>
          </div>
        </DialogHeader>

        <div className="modal-scroll-area stack-col">
          {isFetching ? (
            <div className="text-center" style={{ padding: '2rem 0' }}>
              <span className="loader loader-dark" />
            </div>
          ) : scans.length === 0 ? (
            <div className="text-center muted" style={{ padding: '1.8rem 0' }}>
              {t('monitoring.noSearchHistory')}
            </div>
          ) : (
            <>
              <Card>
                <CardContent>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Badge>{t('monitoring.totalScans')}: {totalScans}</Badge>
                      <Badge variant="outline">{t('monitoring.avgResultsPerScan')}: {averageResults}</Badge>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Badge variant="warning">{t('monitoring.sponsored')}: {totalSponsored}</Badge>
                      <Badge variant="success">{t('monitoring.organic')}: {totalResults - totalSponsored}</Badge>
                      <Badge variant="outline">{t('monitoring.latestScan')}: {latestScanAt ? new Date(latestScanAt).toLocaleString() : '—'}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {scans.map((snap: SerpResult, index: number) => {
                const sponsoredCount = (snap.rankings || []).filter((r) => r.sponsored).length;
                const organicCount = (snap.rankings || []).length - sponsoredCount;
                const isExpanded = expandedScans[index] ?? index === 0;

                return (
                  <Card key={`${snap.scrapedAt}-${index}`}>
                    <CardContent>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div className="muted" style={{ fontWeight: 600 }}>{t('monitoring.scannedAt')} {new Date(snap.scrapedAt).toLocaleString()}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <Badge variant="outline">{t('monitoring.resultsCount')}: {snap.rankings?.length || 0}</Badge>
                          <Badge variant="warning">{t('monitoring.sponsored')}: {sponsoredCount}</Badge>
                          <Badge variant="success">{t('monitoring.organic')}: {organicCount}</Badge>
                          <Button variant="ghost" size="sm" onClick={() => toggleScan(index)}>
                            {isExpanded ? t('monitoring.hideTable') : t('monitoring.showTable')}
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </Button>
                        </div>
                      </div>

                      {isExpanded ? (
                        <div style={{ marginTop: 10 }}>
                          <TableWrap style={{ overflowX: 'auto', overflowY: 'visible', width: '100%' }}>
                            <Table style={{ minWidth: 600 }}>
                              <THead>
                                <TR>
                                  <TH style={{ width: 90 }}>{t('monitoring.rank')}</TH>
                                  <TH style={{ width: 160 }}>{t('monitoring.asin')}</TH>
                                  <TH>{t('monitoring.columnTitle')}</TH>
                                  <TH style={{ width: 110 }}>{t('monitoring.price')}</TH>
                                  <TH style={{ width: 130 }}>{t('monitoring.ads')}</TH>
                                </TR>
                              </THead>
                              <TBody>
                                {(snap.rankings || []).map((ranking) => (
                                  <TR key={`${ranking.rank}-${ranking.asin}`}>
                                    <TD>
                                      <Badge variant={ranking.rank <= 3 ? 'default' : 'outline'}>#{ranking.rank}</Badge>
                                    </TD>
                                    <TD style={{ fontFamily: 'monospace', fontSize: 13 }}>{ranking.asin}</TD>
                                    <TD title={ranking.title} style={{ maxWidth: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {ranking.title}
                                    </TD>
                                    <TD>{ranking.price ? `$${ranking.price}` : '-'}</TD>
                                    <TD>
                                      {ranking.sponsored ? (
                                        <Badge variant="warning">{t('monitoring.sponsored')}</Badge>
                                      ) : (
                                        <Badge variant="success">{t('monitoring.organic')}</Badge>
                                      )}
                                    </TD>
                                  </TR>
                                ))}
                              </TBody>
                            </Table>
                          </TableWrap>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('monitoring.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
