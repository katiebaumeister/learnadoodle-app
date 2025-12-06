/**
 * Attendance Log Export Modal
 */
import React from 'react';
import BaseExportModal from './BaseExportModal';
import { exportAttendanceLog } from '../../lib/services/exportClient';

export default function AttendanceLogExportModal(props) {
  const handleExport = async ({ childId, dates, options }) => {
    return await exportAttendanceLog(
      childId,
      dates.start,
      dates.end,
      options.format || 'pdf'
    );
  };

  return (
    <BaseExportModal
      {...props}
      title="Export Attendance Log"
      description="Export a formatted attendance log with summaries"
      requiresChild={true}
      requiresDateRange={true}
      dateFields={[
        { key: 'start', label: 'Start Date' },
        { key: 'end', label: 'End Date' },
      ]}
      options={[
        {
          key: 'format',
          label: 'Format',
          type: 'select',
          defaultValue: 'pdf',
          options: [
            { label: 'PDF', value: 'pdf' },
            { label: 'CSV', value: 'csv' },
          ],
        },
      ]}
      onExport={handleExport}
    />
  );
}

