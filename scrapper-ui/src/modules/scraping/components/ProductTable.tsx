import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { alpha } from '@mui/material/styles';
import { useDeleteProductsMutation, useGetProductsQuery } from '../../../store/apiSlice';
import { Product, ScraperType } from '../../../types';

type SortKey = 'date' | 'price' | 'bsr' | 'title';
type SortOrder = 'asc' | 'desc';

function ProductTable() {
  const { t } = useTranslation();
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterScraper, setFilterScraper] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const params = {
    source: filterSource !== 'all' ? filterSource : undefined,
    scraper: filterScraper !== 'all' ? (filterScraper as ScraperType) : undefined,
  };

  const { data, isLoading, error } = useGetProductsQuery(params);
  const [deleteProducts, { isLoading: isDeleting }] = useDeleteProductsMutation();
  const products: Product[] = data?.data || [];

  const handleSort = (key: SortKey) => {
    const isAsc = sortKey === key && sortOrder === 'asc';
    setSortOrder(isAsc ? 'desc' : 'asc');
    setSortKey(key);
  };

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      let aVal: string | number = 0;
      let bVal: string | number = 0;
      if (sortKey === 'date') {
        aVal = new Date(a.scrapedAt).getTime();
        bVal = new Date(b.scrapedAt).getTime();
      } else if (sortKey === 'price') {
        aVal = a.metrics.priceUSD || a.metrics.buyBox?.price || a.metrics.itemPrice || a.metrics.price || 0;
        bVal = b.metrics.priceUSD || b.metrics.buyBox?.price || b.metrics.itemPrice || b.metrics.price || 0;
      } else if (sortKey === 'bsr') {
        aVal = a.metrics.bsrCategories?.[0]?.rank || 9999999;
        bVal = b.metrics.bsrCategories?.[0]?.rank || 9999999;
      } else if (sortKey === 'title') {
        aVal = a.title.toLowerCase();
        bVal = b.title.toLowerCase();
      }
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [products, sortKey, sortOrder]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelected(new Set(sortedProducts.map((p) => p.id)));
    else setSelected(new Set());
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    await deleteProducts({ ids: Array.from(selected) });
    setSelected(new Set());
  };

  const allSelected = sortedProducts.length > 0 && selected.size === sortedProducts.length;
  const someSelected = selected.size > 0 && selected.size < sortedProducts.length;

  return (
    <Card elevation={2}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h6" fontWeight="600">
            {t('table.marketIntelligenceData')}
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {selected.size > 0 && (
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<DeleteIcon />}
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {t('table.delete')} {selected.size} {selected.size === 1 ? t('table.item') : t('table.items')}
              </Button>
            )}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>{t('table.source')}</InputLabel>
              <Select value={filterSource} label={t('table.source')} onChange={(e) => setFilterSource(e.target.value)}>
                <MenuItem value="all">{t('table.allSources')}</MenuItem>
                <MenuItem value="amazon">Amazon</MenuItem>
                <MenuItem value="ebay">eBay</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>{t('table.scraper')}</InputLabel>
              <Select value={filterScraper} label={t('table.scraper')} onChange={(e) => setFilterScraper(e.target.value)}>
                <MenuItem value="all">{t('table.allEngines')}</MenuItem>
                <MenuItem value="crawler">Crawler</MenuItem>
                <MenuItem value="firecrawl">Firecrawl</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Box>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Typography color="error">{t('table.failedLoad')}</Typography>
        ) : products.length === 0 ? (
          <Typography align="center" color="text.secondary" sx={{ py: 4 }}>
            {t('table.noProducts')}
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 600, overflowX: 'auto' }}>
            <Table
              stickyHeader
              size="small"
              sx={{
                minWidth: 1100,
                '& .MuiTableCell-stickyHeader': {
                  zIndex: 5,
                  bgcolor: 'background.paper',
                },
                '& .MuiTableRow-root:nth-of-type(even)': {
                  bgcolor: 'action.hover',
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" sx={{ bgcolor: 'background.paper', zIndex: 7, position: 'sticky', left: 0 }}>
                    <Checkbox indeterminate={someSelected} checked={allSelected} onChange={(e) => handleSelectAll(e.target.checked)} />
                  </TableCell>
                  <TableCell sx={{ bgcolor: 'background.paper', zIndex: 7, position: 'sticky', left: 48, minWidth: 200 }}>
                    <TableSortLabel active={sortKey === 'title'} direction={sortOrder} onClick={() => handleSort('title')}>
                      {t('table.product')}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel active={sortKey === 'price'} direction={sortOrder} onClick={() => handleSort('price')}>
                      {t('table.price')}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel active={sortKey === 'bsr'} direction={sortOrder} onClick={() => handleSort('bsr')}>
                      {t('table.bsr')}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>{t('table.rating')}</TableCell>
                  <TableCell>{t('table.offers')}</TableCell>
                  <TableCell>{t('table.tags')}</TableCell>
                  <TableCell>
                    <TableSortLabel active={sortKey === 'date'} direction={sortOrder} onClick={() => handleSort('date')}>
                      {t('table.scrapedAt')}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ width: 52 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedProducts.map((row) => (
                  <TableRow key={row.id} hover selected={selected.has(row.id)}>
                    <TableCell padding="checkbox" sx={{ bgcolor: 'background.paper', position: 'sticky', left: 0, zIndex: 2 }}>
                      <Checkbox checked={selected.has(row.id)} onChange={(e) => handleSelectOne(row.id, e.target.checked)} />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 280, bgcolor: 'background.paper', position: 'sticky', left: 48, zIndex: 2 }}>
                      <Tooltip title={row.title}>
                        <Link
                          to={`/product/${row.id}`}
                          style={{
                            color: 'var(--mui-palette-primary-main)',
                            textDecoration: 'none',
                            fontWeight: 500,
                            display: 'block',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {row.title}
                        </Link>
                      </Tooltip>
                      <Box sx={{ mt: 0.5 }}>
                        <Chip label={row.marketplace} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem', mr: 0.5 }} />
                        <Chip label={row.scrapedBy} size="small" color={row.scrapedBy === 'firecrawl' ? 'warning' : 'info'} variant="filled" sx={{ height: 20, fontSize: '0.7rem' }} />
                      </Box>
                    </TableCell>
                    <TableCell sx={{ minWidth: 108 }}>
                      <Typography fontWeight="bold" sx={{ lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        ${(row.metrics.priceUSD || row.metrics.buyBox?.price || row.metrics.itemPrice || row.metrics.price || 0).toFixed(2)}
                      </Typography>
                      {row.metrics.discountPercentage ? (
                        <Typography variant="caption" color="success.main" sx={{ display: 'block', lineHeight: 1.2 }}>
                          -{row.metrics.discountPercentage}%
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {row.metrics.bsrCategories?.[0] ? (
                        <Box>
                          <Typography variant="body2" fontWeight="600">
                            #{row.metrics.bsrCategories[0].rank.toLocaleString()}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row.metrics.bsrCategories[0].category}
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          N/A
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.metrics.averageRating ? (
                        <Box>
                          <Typography variant="body2">
                            <Box component="span" sx={{ color: 'warning.main' }}>★</Box> {row.metrics.averageRating.toFixed(1)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ({row.metrics.reviewsCount?.toLocaleString()})
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {row.metrics.sellerCount && <Chip label={`${row.metrics.sellerCount} ${t('table.sellers')}`} size="small" variant="outlined" />}
                        {row.metrics.newOffersCount && <Chip label={`${row.metrics.newOffersCount} ${t('table.new')}`} size="small" color="success" variant="outlined" />}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {row.metrics.isPrime && <Chip label={t('table.prime')} size="small" sx={{ bgcolor: 'info.main', color: '#fff', fontWeight: 'bold', height: 22 }} />}
                        {row.metrics.buyBox?.isFBA && (
                          <Chip
                            label="FBA"
                            size="small"
                            sx={{
                              bgcolor: (theme) => theme.palette.mode === 'dark' ? alpha(theme.palette.primary.main, 0.28) : alpha(theme.palette.primary.main, 0.16),
                              color: 'text.primary',
                              fontWeight: 'bold',
                              height: 22,
                            }}
                          />
                        )}
                        {row.metrics.isAmazonChoice && <Chip label="Choice" size="small" color="info" sx={{ height: 22 }} />}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.scrapedAt ? format(new Date(row.scrapedAt), 'MMM dd, HH:mm') : '—'}</Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ px: 0.5 }}>
                      <Tooltip title={t('table.openMarketplace')}>
                        <IconButton size="small" color="primary" component="a" href={row.url} target="_blank" rel="noopener noreferrer">
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default React.memo(ProductTable);
