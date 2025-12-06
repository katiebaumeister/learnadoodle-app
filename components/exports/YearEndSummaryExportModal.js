/**
 * Year-End Summary Export Modal
 */
import React from 'react';
import BaseExportModal from './BaseExportModal';
import { exportYearEndSummary } from '../../lib/services/exportClient';

export default function YearEndSummaryExportModal(props) {
  const handleExport = async ({ childId, dates, options }) => {
    return await exportYearEndSummary(
      childId,
      dates.start,
      dates.end,
      options.summaryType || 'comprehensive'
    );
  };

  return (
    <BaseExportModal
      {...props}
      title="Export Year-End Summary"
      description="Export a comprehensive year-end academic summary"
      requiresChild={true}
      requiresDateRange={true}
      dateFields={[
        { key: 'start', label: 'Academic Year Start' },
        { key: 'end', label: 'Academic Year End' },
      ]}
      options={[
        {
          key: 'summaryType',
          label: 'Summary Type',
          type: 'select',
          defaultValue: 'comprehensive',
          options: [
            { label: 'Comprehensive', value: 'comprehensive' },
            { label: 'Academic Only', value: 'academic' },
            { label: 'Social Only', value: 'social' },
          ],
        },
      ]}
      onExport={handleExport}
    />
  );
}

