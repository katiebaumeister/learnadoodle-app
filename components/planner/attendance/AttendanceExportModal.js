import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { X } from 'lucide-react';

function statusToLabel(status) {
  return status === 'present' ? 'Yes' : 'No';
}

function buildPrintHtml(exportRows, children, pageTitle = 'Attendance export') {
  const headerLabels = children.length === 1
    ? ['Date', 'Attended']
    : ['Date', ...children.map((c) => c.first_name || c.name || 'Child')];
  const headerCells = headerLabels.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const rows = exportRows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.dateLabel)}</td>${children
          .map((c) => `<td>${escapeHtml(statusToLabel(row.childStatuses[c.id]))}</td>`)
          .join('')}</tr>`
    )
    .join('');
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; font-size: 14px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #E5E7EB; padding: 8px 12px; text-align: left; }
    th { background: #F9FAFB; font-weight: 600; }
    .no-print { display: none; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <h1 style="margin: 0 0 16px 0; font-size: 18px;">${escapeHtml(pageTitle)}</h1>
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

export default function AttendanceExportModal({
  visible,
  onClose,
  exportRows = [],
  children = [],
  singleChildId = null,
}) {
  const displayChildren = singleChildId
    ? children.filter((c) => c.id === singleChildId)
    : children;
  const singleChild = singleChildId ? children.find((c) => c.id === singleChildId) : null;
  const title = singleChild
    ? `Attendance — ${singleChild.first_name || singleChild.name || 'Child'}`
    : 'Attendance export';

  const handlePrint = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const html = buildPrintHtml(exportRows, displayChildren, title);
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => {
          w.print();
        }, 300);
      }
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.box}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <X size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.scroll} horizontal>
            <View style={styles.table}>
              <View style={styles.tableRow}>
                <Text style={[styles.cell, styles.headerCell, styles.dateCol]}>Date</Text>
                {displayChildren.map((c) => (
                  <Text key={c.id} style={[styles.cell, styles.headerCell]}>
                    {displayChildren.length === 1 ? 'Attended' : (c.first_name || c.name || 'Child')}
                  </Text>
                ))}
              </View>
              {exportRows.map((row) => (
                <View key={row.dateKey} style={styles.tableRow}>
                  <Text style={[styles.cell, styles.dateCol]}>{row.dateLabel}</Text>
                  {displayChildren.map((c) => (
                    <Text key={c.id} style={styles.cell}>
                      {statusToLabel(row.childStatuses[c.id])}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={styles.actions}>
            {Platform.OS === 'web' && (
              <TouchableOpacity style={styles.printBtn} onPress={handlePrint}>
                <Text style={styles.printBtnText}>Print</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const cellWidth = 88;
const dateColWidth = 110;

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
    borderRadius: 16,
    maxWidth: '95%',
    width: 560,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  scroll: { maxHeight: 400 },
  table: { paddingHorizontal: 20, paddingVertical: 12 },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    minHeight: 36,
    alignItems: 'center',
  },
  cell: {
    fontSize: 13,
    color: '#374151',
    paddingVertical: 8,
    paddingHorizontal: 10,
    width: cellWidth,
  },
  dateCol: { width: dateColWidth, fontWeight: '500' },
  headerCell: {
    fontWeight: '600',
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  printBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#111827',
    borderRadius: 8,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  printBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  closeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  closeBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
});
