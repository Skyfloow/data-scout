import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetKeywordRankingsQuery } from '../store/apiSlice';
import { SerpResult } from '../types';
import { getMarketplaceDisplayName } from '../utils/marketplace';
import { formatDateTime } from '../utils/locale';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from './ui/table';

interface KeywordRankingsDialogProps {
  keyword: string;
  marketplace: string;
  onClose: () => void;
}

export function KeywordRankingsDialog({ keyword, marketplace, onClose }: KeywordRankingsDialogProps) {
  const { t, i18n } = useTranslation();
  const marketplaceLabel = getMarketplaceDisplayName(marketplace);
  const { data: rankingData, isFetching } = useGetKeywordRankingsQuery({ keyword, marketplace });
  const [expandedScans, setExpandedScans] = useState<Record<string, boolean>>({});
  const scans: SerpResult[] = rankingData?.data ?? [];
  const totalScans = scans.length;
  const totalResults = scans.reduce((sum, snap) => sum + (snap.rankings?.length || 0), 0);
  const totalSponsored = scans.reduce((sum, snap) => sum + (snap.rankings || []).filter((r: any) => r.sponsored).length, 0);
  const averageResults = totalScans > 0 ? Math.round(totalResults / totalScans) : 0;
  const latestScanAt = scans[0]?.scrapedAt;

  const toggleScan = (scrapedAt: string, isFirst: boolean) => {
    setExpandedScans((prev) => ({ ...prev, [scrapedAt]: !(prev[scrapedAt] ?? isFirst) }));
  };

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent width={1200}>
        <DialogHeader>
          <DialogTitle>{t('monitoring.keywordRankingHistory')}</DialogTitle>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <Badge variant="outline">"{keyword}"</Badge>
            <Badge variant="secondary">{t('monitoring.marketplace')}: {marketplaceLabel}</Badge>
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
                      <Badge variant="outline">{t('monitoring.latestScan')}: {latestScanAt ? formatDateTime(latestScanAt, i18n.language) : '—'}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {scans.map((snap: SerpResult, index: number) => {
                const sponsoredCount = (snap.rankings || []).filter((r: any) => r.sponsored).length;
                const organicCount = (snap.rankings || []).length - sponsoredCount;
                const isExpanded = expandedScans[snap.scrapedAt] ?? index === 0;

                return (
                  <Card key={snap.scrapedAt}>
                    <CardContent>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div className="muted" style={{ fontWeight: 600 }}>{t('monitoring.scannedAt')} {formatDateTime(snap.scrapedAt, i18n.language)}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <Badge variant="outline">{t('monitoring.resultsCount')}: {snap.rankings?.length || 0}</Badge>
                          <Badge variant="warning">{t('monitoring.sponsored')}: {sponsoredCount}</Badge>
                          <Badge variant="success">{t('monitoring.organic')}: {organicCount}</Badge>
                          <Button variant="ghost" size="sm" onClick={() => toggleScan(snap.scrapedAt, index === 0)}>
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
                                {(snap.rankings || []).map((ranking: any) => (
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
