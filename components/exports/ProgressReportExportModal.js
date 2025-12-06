/**
 * Progress Report Export Modal
 */
import React from 'react';
import BaseExportModal from './BaseExportModal';
import { exportProgressReport } from '../../lib/services/exportClient';

export default function ProgressReportExportModal(props) {
  const handleExport = async ({ childId, dates, options }) => {
    return await exportProgressReport(
      childId,
      dates.start,
      dates.end,
      options.includeDetails !== false
    );
  };

  return (
    <BaseExportModal
      {...props}
      title="Export Progress Report"
      description="Export a personalized student progress report"
      requiresChild={true}
      requiresDateRange={true}
      dateFields={[
        { key: 'start', label: 'Start Date' },
        { key: 'end', label: 'End Date' },
      ]}
      options={[
        { key: 'includeDetails', label: 'Include Detailed Breakdown', type: 'boolean', defaultValue: true },
      ]}
      onExport={handleExport}
    />
  );
}

