/**
 * Daily Printout Export Modal
 */
import React from 'react';
import BaseExportModal from './BaseExportModal';
import { exportDailyPrintout } from '../../lib/services/exportClient';

export default function DailyPrintoutExportModal(props) {
  const handleExport = async ({ childId, dates }) => {
    const date = dates.date || new Date();
    return await exportDailyPrintout(childId, date, 'pdf');
  };

  return (
    <BaseExportModal
      {...props}
      title="Export Daily Printout"
      description="Export a print-friendly daily schedule"
      requiresChild={true}
      dateFields={[
        { key: 'date', label: 'Date' },
      ]}
      onExport={handleExport}
    />
  );
}

