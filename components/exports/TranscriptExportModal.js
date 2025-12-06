/**
 * Transcript Export Modal
 */
import React from 'react';
import BaseExportModal from './BaseExportModal';
import { exportTranscriptEnhanced } from '../../lib/services/exportClient';

export default function TranscriptExportModal(props) {
  const handleExport = async ({ childId, dates, options }) => {
    return await exportTranscriptEnhanced(
      childId,
      dates.start,
      dates.end,
      options.gpaType || 'unweighted',
      options.format || 'pdf'
    );
  };

  return (
    <BaseExportModal
      {...props}
      title="Export Transcript"
      description="Export an enhanced high school transcript with GPA"
      requiresChild={true}
      requiresDateRange={true}
      dateFields={[
        { key: 'start', label: 'Start Date' },
        { key: 'end', label: 'End Date' },
      ]}
      options={[
        {
          key: 'gpaType',
          label: 'GPA Type',
          type: 'select',
          defaultValue: 'unweighted',
          options: [
            { label: 'Unweighted', value: 'unweighted' },
            { label: 'Weighted', value: 'weighted' },
          ],
        },
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

