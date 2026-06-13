import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { X, Download } from 'lucide-react';
import ScheduleDateFields from '../../create/shared/ScheduleDateFields';
import { AppCalendarDatePickerModal, parseLocalYyyyMmDd } from '../../ui/AppCalendarDatePickerModal';
import { toYmd } from '../../../lib/create/eventTimeUtils';

function keyToDate(key) {
  if (!key) return null;
  return parseLocalYyyyMmDd(String(key).slice(0, 10));
}

function clampDateKey(date, minKey, maxKey) {
  const key = toYmd(date);
  if (!key) return minKey || maxKey || '';
  if (minKey && key < minKey) return minKey;
  if (maxKey && key > maxKey) return maxKey;
  return key;
}

export function getStatusDisplay(status) {
  if (status === 'present' || status === 'partial') return { label: 'Attended', variant: 'present' };
  if (status === 'absent') return { label: 'Unattended', variant: 'absent' };
  return { label: 'None scheduled', variant: 'none' };
}

export function buildPrintHtml(exportRows, children, options = {}) {
  const {
    pageTitle = 'Attendance Report',
    periodLabel = '',
    familyName = '',
    generatedAt = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    singleChild = null,
  } = options;
  const { visibleChildren, overflowChildren } = splitAttendanceChildren(children);
  const headerLabels = children.length === 1
    ? ['Date', 'Status']
    : [
      'Date',
      ...visibleChildren.map((c) => c.first_name || c.name || 'Child'),
      ...(overflowChildren.length > 0 ? ['…'] : []),
    ];
  const headerCells = headerLabels.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const rows = exportRows
    .map(
      (row) => {
        const cells = visibleChildren.map((c) => {
          const status = row.childStatuses[c.id];
          const d = getStatusDisplay(status);
          const cls = d.variant === 'present' ? 'status-present' : d.variant === 'absent' ? 'status-absent' : 'status-none';
          return `<td class="${cls}">${escapeHtml(d.label)}</td>`;
        });
        if (overflowChildren.length > 0) {
          const d = summarizeOverflowAttendance(row, overflowChildren);
          const cls = d.variant === 'present' ? 'status-present' : d.variant === 'absent' ? 'status-absent' : 'status-none';
          cells.push(`<td class="${cls}">${escapeHtml(d.label)}</td>`);
        }
        return `<tr><td class="col-date">${escapeHtml(row.dateLabel)}</td>${cells.join('')}</tr>`;
      }
    )
    .join('');
  const metaLines = [periodLabel, familyName ? `Family: ${familyName}` : null, `Generated ${generatedAt}`].filter(Boolean);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; font-size: 14px; }
    .report-title { font-size: 20px; font-weight: 700; margin: 0 0 4px 0; }
    .report-meta { font-size: 12px; color: #6B7280; margin-bottom: 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #E5E7EB; padding: 8px 12px; text-align: left; }
    th { background: #F9FAFB; font-weight: 600; }
    .col-date { font-weight: 600; color: #111827; }
    tr:nth-child(even) { background: #FAFBFC; }
    .status-present { color: #059669; font-weight: 500; }
    .status-absent { color: #DC2626; font-weight: 500; }
    .status-none { color: #9CA3AF; }
    .no-print { display: none; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <h1 class="report-title">${escapeHtml(pageTitle)}</h1>
  <p class="report-meta">${escapeHtml(metaLines.join(' • '))}</p>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="no-print" style="margin-top: 24px;">
    <button onclick="window.print()" style="padding: 8px 16px; cursor: pointer;">Print</button>
    <button onclick="window.close()" style="padding: 8px 16px; margin-left: 8px; cursor: pointer;">Close</button>
  </p>
</body>
</html>`;
}

function escapeHtml(s) {
  if (s == null) return '';
  const str = String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const MAX_VISIBLE_ATTENDANCE_CHILDREN = 3;

export function splitAttendanceChildren(children = []) {
  const list = Array.isArray(children) ? children : [];
  return {
    visibleChildren: list.slice(0, MAX_VISIBLE_ATTENDANCE_CHILDREN),
    overflowChildren: list.slice(MAX_VISIBLE_ATTENDANCE_CHILDREN),
  };
}

export function summarizeOverflowAttendance(row, overflowChildren = []) {
  if (!row || overflowChildren.length === 0) {
    return { label: '…', variant: 'none' };
  }
  const statuses = overflowChildren.map((c) => row.childStatuses?.[c.id]);
  const attended = statuses.filter((s) => s === 'present' || s === 'partial').length;
  const absent = statuses.filter((s) => s === 'absent').length;
  const scheduled = attended + absent;
  if (scheduled === 0) return { label: '…', variant: 'none' };
  if (absent > 0 && attended === 0) {
    return { label: `${absent} unattended`, variant: 'absent' };
  }
  if (attended > 0 && absent === 0) {
    return { label: `${attended} attended`, variant: 'present' };
  }
  return { label: 'Mixed', variant: 'none' };
}

export function formatPeriodLabelFromRange(startKey, endKey) {
  if (!startKey || !endKey) return '';
  const d1 = new Date(startKey + 'T12:00:00');
  const d2 = new Date(endKey + 'T12:00:00');
  if (startKey.slice(0, 7) === endKey.slice(0, 7)) {
    return d1.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return `${d1.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} – ${d2.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
}

function formatPeriodLabel(exportRows) {
  if (!exportRows?.length) return '';
  return formatPeriodLabelFromRange(exportRows[0].dateKey, exportRows[exportRows.length - 1].dateKey);
}

export default function AttendanceExportModal({
  visible,
  onClose,
  exportRows = [],
  children = [],
  singleChildId = null,
  familyName = null,
}) {
  const displayChildren = singleChildId
    ? children.filter((c) => c.id === singleChildId)
    : children;
  const singleChild = singleChildId ? children.find((c) => c.id === singleChildId) : null;
  const isSingleChild = !!singleChild;
  const reportTitle = isSingleChild
    ? `Attendance Report — ${singleChild.first_name || singleChild.name || 'Child'}`
    : 'Attendance Report';

  const minDateKey = exportRows.length ? exportRows[0].dateKey : '';
  const maxDateKey = exportRows.length ? exportRows[exportRows.length - 1].dateKey : '';
  const [displayStartKey, setDisplayStartKey] = useState(minDateKey);
  const [displayEndKey, setDisplayEndKey] = useState(maxDateKey);
  const [datePickerTarget, setDatePickerTarget] = useState(null);

  useEffect(() => {
    if (visible && exportRows.length) {
      setDisplayStartKey(exportRows[0].dateKey);
      setDisplayEndKey(exportRows[exportRows.length - 1].dateKey);
    }
  }, [visible, minDateKey, maxDateKey]);

  useEffect(() => {
    if (!visible) setDatePickerTarget(null);
  }, [visible]);

  const startDateObj = useMemo(() => keyToDate(displayStartKey), [displayStartKey]);
  const endDateObj = useMemo(() => keyToDate(displayEndKey), [displayEndKey]);
  const datePickerValue = datePickerTarget === 'end' ? endDateObj : startDateObj;
  const minDateObj = useMemo(() => keyToDate(minDateKey), [minDateKey]);
  const maxDateObj = useMemo(() => keyToDate(maxDateKey), [maxDateKey]);

  const filteredExportRows = useMemo(() => {
    if (!displayStartKey || !displayEndKey || displayStartKey > displayEndKey) return exportRows;
    return exportRows.filter((r) => r.dateKey >= displayStartKey && r.dateKey <= displayEndKey);
  }, [exportRows, displayStartKey, displayEndKey]);

  const effectiveRows = filteredExportRows.length > 0 ? filteredExportRows : exportRows;
  const periodLabel = formatPeriodLabelFromRange(
    effectiveRows[0]?.dateKey ?? displayStartKey,
    effectiveRows[effectiveRows.length - 1]?.dateKey ?? displayEndKey
  );
  const totalDays = effectiveRows.length;
  const daysWithAnyRecord = effectiveRows.filter((r) =>
    displayChildren.some((c) => r.childStatuses[c.id] === 'present' || r.childStatuses[c.id] === 'absent')
  ).length;
  const generatedAt = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const summaryByChild = displayChildren.map((c) => {
    const attended = effectiveRows.filter((r) => r.childStatuses[c.id] === 'present').length;
    const pct = totalDays ? Math.round((attended / totalDays) * 100) : 0;
    return {
      child: c,
      attended,
      total: totalDays,
      pct,
    };
  });

  const handleStartDateChange = (date) => {
    const clamped = clampDateKey(date, minDateKey, maxDateKey);
    setDisplayStartKey(clamped);
    if (displayEndKey && clamped > displayEndKey) setDisplayEndKey(clamped);
  };
  const handleEndDateChange = (date) => {
    const clamped = clampDateKey(date, minDateKey, maxDateKey);
    setDisplayEndKey(clamped);
    if (displayStartKey && clamped < displayStartKey) setDisplayStartKey(clamped);
  };

  const metadataParts = [`${displayChildren.length} Student${displayChildren.length !== 1 ? 's' : ''}`, `${daysWithAnyRecord}/${totalDays} Days Recorded`].filter(Boolean);
  const metadataLine = metadataParts.join(' • ');
  const { visibleChildren, overflowChildren } = splitAttendanceChildren(displayChildren);
  const showOverflowColumn = overflowChildren.length > 0;

  const renderStatusCell = (label, variant, key) => (
    <View key={key} style={[styles.cell, styles.statusCell]}>
      <View style={[styles.statusChip, styles[`statusChip_${variant}`]]}>
        <View style={[styles.statusDot, styles[`statusDot_${variant}`]]} />
        <Text style={[styles.statusChipText, styles[`statusChipText_${variant}`]]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );

  const handleDownloadPdf = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const html = buildPrintHtml(effectiveRows, displayChildren, {
        pageTitle: reportTitle,
        periodLabel,
        familyName: familyName || undefined,
        generatedAt,
      });
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(html);
        w.document.close();
        w.focus();
      }
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.box} activeOpacity={1} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Text style={styles.title}>{reportTitle}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.closeIcon}>
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />

          <View style={styles.dateSection}>
            <View style={styles.dateFieldsWrap}>
              <ScheduleDateFields
                startDate={startDateObj || minDateObj}
                onStartDateChange={handleStartDateChange}
                endDate={endDateObj || maxDateObj}
                onEndDateChange={handleEndDateChange}
                showEndDate
                showTimes={false}
                endDateRequired
                onOpenStartDatePicker={() => setDatePickerTarget('start')}
                onOpenEndDatePicker={() => setDatePickerTarget('end')}
              />
            </View>
            {metadataLine ? (
              <Text style={styles.metadata}>{metadataLine}</Text>
            ) : null}
          </View>

          <View style={styles.sectionDivider} />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
          >
            {summaryByChild.length > 0 && (
              <View style={styles.summaryBlock}>
                {summaryByChild.map(({ child, attended, total, pct }) => (
                  <Text key={child.id} style={styles.summaryLine}>
                    {child.first_name || child.name || 'Child'} – {attended}/{total} days attended ({pct}%)
                  </Text>
                ))}
              </View>
            )}

            <View style={styles.tableContainer}>
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableRowHeader]}>
                  <Text style={[styles.cell, styles.headerCell, styles.dateCol]}>Date</Text>
                  {visibleChildren.map((c) => (
                    <Text
                      key={c.id}
                      style={[styles.cell, styles.headerCell, styles.childCol]}
                      numberOfLines={1}
                    >
                      {displayChildren.length === 1 ? 'Status' : (c.first_name || c.name || 'Child')}
                    </Text>
                  ))}
                  {showOverflowColumn ? (
                    <Text style={[styles.cell, styles.headerCell, styles.overflowCol]}>…</Text>
                  ) : null}
                </View>
                {effectiveRows.map((row, rowIndex) => (
                  <View
                    key={row.dateKey}
                    style={[
                      styles.tableRow,
                      rowIndex % 2 === 1 && styles.tableRowStriped,
                      Platform.OS === 'web' && styles.tableRowHover,
                    ]}
                  >
                    <Text style={[styles.cell, styles.dateCol, styles.dateCell]} numberOfLines={1}>
                      {row.dateLabel}
                    </Text>
                    {visibleChildren.map((c) => {
                      const status = row.childStatuses[c.id];
                      const { label, variant } = getStatusDisplay(status);
                      return renderStatusCell(label, variant, c.id);
                    })}
                    {showOverflowColumn ? (() => {
                      const { label, variant } = summarizeOverflowAttendance(row, overflowChildren);
                      return renderStatusCell(label, variant, 'overflow');
                    })() : null}
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.footerLeft} />
            <View style={styles.footerRight}>
              <TouchableOpacity
                onPress={onClose}
                style={styles.cancelButton}
                activeOpacity={0.9}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.cancelButtonText}>Close</Text>
              </TouchableOpacity>
              {Platform.OS === 'web' && (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleDownloadPdf}
                  activeOpacity={0.9}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Download size={16} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Download PDF</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>

      <AppCalendarDatePickerModal
        visible={!!datePickerTarget}
        onClose={() => setDatePickerTarget(null)}
        selectedDate={datePickerValue || minDateObj || new Date()}
        minDate={minDateObj}
        maxDate={maxDateObj}
        onSelectDate={(d) => {
          if (datePickerTarget === 'end') handleEndDateChange(d);
          else handleStartDateChange(d);
          setDatePickerTarget(null);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  box: {
    backgroundColor: '#fff',
    borderRadius: 20,
    maxWidth: '95%',
    width: 760,
    maxHeight: '90%',
    flexDirection: 'column',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerContent: { flex: 1, marginRight: 12 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", -apple-system, sans-serif' }),
  },
  dateSection: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 2,
  },
  dateFieldsWrap: {
    alignSelf: 'flex-start',
    maxWidth: 480,
    width: '100%',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 24,
    marginBottom: 4,
  },
  metadata: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
    marginBottom: 4,
    ...(Platform.OS === 'web' && { fontFamily: 'system-ui, sans-serif' }),
  },
  closeIcon: { padding: 4 },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 24,
  },
  scroll: {
    height: 440,
    maxHeight: 520,
  },
  scrollContent: { flexGrow: 1, paddingBottom: 8 },
  tableContainer: {
    width: '100%',
    paddingHorizontal: 24,
    paddingVertical: 12,
    paddingBottom: 8,
  },
  summaryBlock: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 10,
  },
  summaryLine: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 4,
    ...(Platform.OS === 'web' && { fontFamily: 'system-ui, sans-serif' }),
  },
  table: {
    width: '100%',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minHeight: 40,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tableRowHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    minHeight: 44,
  },
  tableRowStriped: {
    backgroundColor: '#FAFBFC',
  },
  ...(Platform.OS === 'web' && {
    tableRowHover: {
      // hover handled via onMouseEnter/Leave if desired
    },
  }),
  cell: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  dateCol: {
    flex: 0.9,
    minWidth: 108,
    maxWidth: 140,
  },
  childCol: {
    flex: 1.2,
    minWidth: 0,
  },
  overflowCol: {
    flex: 0.75,
    minWidth: 72,
    maxWidth: 120,
  },
  dateCell: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  headerCell: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  statusCell: {
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 6,
    flexShrink: 0,
  },
  statusChip_present: {
    backgroundColor: 'rgba(5, 150, 105, 0.12)',
  },
  statusChip_absent: {
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
  },
  statusChip_none: {
    backgroundColor: '#F3F4F6',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDot_present: { backgroundColor: '#059669' },
  statusDot_absent: { backgroundColor: '#DC2626' },
  statusDot_none: { backgroundColor: '#9CA3AF' },
  statusChipText: { fontSize: 12, fontWeight: '500' },
  statusChipText_present: { color: '#059669' },
  statusChipText_absent: { color: '#DC2626' },
  statusChipText_none: { color: '#6B7280' },
  footer: {
    width: '100%',
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginLeft: 'auto',
  },
  cancelButton: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  primaryButton: {
    height: 50,
    borderRadius: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#9ECFFB',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
});
