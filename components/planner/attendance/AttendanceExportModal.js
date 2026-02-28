import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  TextInput,
} from 'react-native';
import { X, Pencil, Check } from 'lucide-react';

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
  const headerLabels = children.length === 1
    ? ['Date', 'Status']
    : ['Date', ...children.map((c) => c.first_name || c.name || 'Child')];
  const headerCells = headerLabels.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const rows = exportRows
    .map(
      (row) => {
        const cells = children.map((c) => {
          const status = row.childStatuses[c.id];
          const d = getStatusDisplay(status);
          const cls = d.variant === 'present' ? 'status-present' : d.variant === 'absent' ? 'status-absent' : 'status-none';
          return `<td class="${cls}">${escapeHtml(d.label)}</td>`;
        });
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
  const [isEditingRange, setIsEditingRange] = useState(false);

  useEffect(() => {
    if (visible && exportRows.length) {
      setDisplayStartKey(exportRows[0].dateKey);
      setDisplayEndKey(exportRows[exportRows.length - 1].dateKey);
    }
  }, [visible, minDateKey, maxDateKey]);

  useEffect(() => {
    if (!visible) setIsEditingRange(false);
  }, [visible]);

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

  const handleStartDateChange = (val) => {
    const key = (val || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) { setDisplayStartKey(key || minDateKey); return; }
    const clamped = key < minDateKey ? minDateKey : key > maxDateKey ? maxDateKey : key;
    setDisplayStartKey(clamped);
    if (displayEndKey && clamped > displayEndKey) setDisplayEndKey(clamped);
  };
  const handleEndDateChange = (val) => {
    const key = (val || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) { setDisplayEndKey(key || maxDateKey); return; }
    const clamped = key > maxDateKey ? maxDateKey : key < minDateKey ? minDateKey : key;
    setDisplayEndKey(clamped);
    if (displayStartKey && clamped < displayStartKey) setDisplayStartKey(clamped);
  };

  const metadataParts = [`${displayChildren.length} Student${displayChildren.length !== 1 ? 's' : ''}`, `${daysWithAnyRecord}/${totalDays} Days Recorded`].filter(Boolean);
  const metadataLine = metadataParts.join(' • ');

  const handlePrint = () => {
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
        setTimeout(() => w.print(), 300);
      }
    }
  };

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
              <View style={styles.rangeRow}>
                {isEditingRange ? (
                  <>
                    <Text style={styles.rangeLabel}>From</Text>
                    <TextInput
                      style={styles.dateInput}
                      value={displayStartKey}
                      onChangeText={handleStartDateChange}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#9CA3AF"
                      {...(Platform.OS === 'web' && { type: 'date', min: minDateKey, max: maxDateKey })}
                    />
                    <Text style={styles.rangeLabel}>to</Text>
                    <TextInput
                      style={styles.dateInput}
                      value={displayEndKey}
                      onChangeText={handleEndDateChange}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#9CA3AF"
                      {...(Platform.OS === 'web' && { type: 'date', min: minDateKey, max: maxDateKey })}
                    />
                    <TouchableOpacity
                      onPress={() => setIsEditingRange(false)}
                      style={styles.rangeEditButton}
                      hitSlop={8}
                    >
                      <Check size={18} color="#059669" />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.rangeStatic}>{periodLabel || 'Select range'}</Text>
                    <TouchableOpacity
                      onPress={() => setIsEditingRange(true)}
                      style={styles.rangeEditButton}
                      hitSlop={8}
                    >
                      <Pencil size={16} color="#6B7280" />
                    </TouchableOpacity>
                  </>
                )}
              </View>
              {metadataLine ? (
                <Text style={styles.metadata}>{metadataLine}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.closeIcon}>
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />

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

            <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableRowHeader]}>
                  <Text style={[styles.cell, styles.headerCell, styles.dateCol]}>Date</Text>
                  {displayChildren.map((c) => (
                    <Text key={c.id} style={[styles.cell, styles.headerCell]}>
                      {displayChildren.length === 1 ? 'Status' : (c.first_name || c.name || 'Child')}
                    </Text>
                  ))}
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
                    <Text style={[styles.cell, styles.dateCol, styles.dateCell]}>{row.dateLabel}</Text>
                    {displayChildren.map((c) => {
                      const status = row.childStatuses[c.id];
                      const { label, variant } = getStatusDisplay(status);
                      return (
                        <View key={c.id} style={[styles.cell, styles.statusCell]}>
                          <View style={[styles.statusChip, styles[`statusChip_${variant}`]]}>
                            <View style={[styles.statusDot, styles[`statusDot_${variant}`]]} />
                            <Text style={[styles.statusChipText, styles[`statusChipText_${variant}`]]}>{label}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity onPress={onClose} style={styles.ghostButton}>
              <Text style={styles.ghostButtonText}>Close</Text>
            </TouchableOpacity>
            <View style={styles.footerRight}>
              {Platform.OS === 'web' && (
                <>
                  <TouchableOpacity style={styles.primaryButton} onPress={handleDownloadPdf}>
                    <Text style={styles.primaryButtonText}>Download PDF</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.outlineButton} onPress={handlePrint}>
                    <Text style={styles.outlineButtonText}>Print</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const dateColWidth = 118;
const studentColWidth = 112;

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
    width: 520,
    maxHeight: '85%',
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
    marginBottom: 4,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", -apple-system, sans-serif' }),
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  rangeLabel: {
    fontSize: 13,
    color: '#6B7280',
    ...(Platform.OS === 'web' && { fontFamily: 'system-ui, sans-serif' }),
  },
  rangeStatic: {
    fontSize: 13,
    color: '#374151',
    ...(Platform.OS === 'web' && { fontFamily: 'system-ui, sans-serif' }),
  },
  rangeEditButton: {
    padding: 4,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  dateInput: {
    fontSize: 13,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    width: 112,
    minWidth: 112,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  metadata: {
    fontSize: 13,
    color: '#6B7280',
    ...(Platform.OS === 'web' && { fontFamily: 'system-ui, sans-serif' }),
  },
  closeIcon: { padding: 4 },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 24,
  },
  scroll: {
    height: 340,
    maxHeight: 420,
  },
  scrollContent: { flexGrow: 1, paddingBottom: 8 },
  tableScroll: {},
  summaryBlock: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  summaryLine: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 4,
    ...(Platform.OS === 'web' && { fontFamily: 'system-ui, sans-serif' }),
  },
  table: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    paddingBottom: 8,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    paddingVertical: 6,
    paddingHorizontal: 12,
    width: studentColWidth,
    justifyContent: 'center',
  },
  dateCol: { width: dateColWidth },
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
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 6,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  footerRight: {
    flexDirection: 'row',
    gap: 10,
  },
  ghostButton: {
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  ghostButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  outlineButton: {
    paddingVertical: 6,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  outlineButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  primaryButton: {
    backgroundColor: '#85C4F2',
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderRadius: 10,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
    }),
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
