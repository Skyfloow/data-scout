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
import { EntityHistoryDialog } from '../components/EntityHistoryDialog';
import { getMarketplaceDisplayName } from '../utils/marketplace';
import { formatDateTime } from '../utils/locale';

import { TrackerResultRow, typeVariant } from '../components/TrackerResultRow';

export default function MonitoringPage() {
  const { t, i18n } = useTranslation();
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

                {resultRows.map((item: TrackerResult) => (
                  <TrackerResultRow key={item.id} item={item} onViewHistory={setHistoryEntity} />
                ))}

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
                    <TD>{getMarketplaceDisplayName(item.marketplace, item.type === 'product' ? item.value : undefined)}</TD>
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
                    <TD>{formatDateTime(item.addedAt, i18n.language)}</TD>
                    <TD>
                      {item.lastScrapedAt ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <CheckCircle2 size={14} color="var(--success)" />
                          {formatDateTime(item.lastScrapedAt, i18n.language)}
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
