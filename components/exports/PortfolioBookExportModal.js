/**
 * Portfolio Book Export Modal
 */
import React from 'react';
import BaseExportModal from './BaseExportModal';
import { exportPortfolioBook } from '../../lib/services/exportClient';

export default function PortfolioBookExportModal(props) {
  const handleExport = async ({ childId, dates, options }) => {
    return await exportPortfolioBook(
      childId,
      dates.start,
      dates.end,
      {
        includeEvidence: options.includeEvidence !== false,
        includeGrades: options.includeGrades !== false,
        includeAttendance: options.includeAttendance !== false,
      }
    );
  };

  return (
    <BaseExportModal
      {...props}
      title="Export Portfolio Book"
      description="Export a complete portfolio with evidence, grades, and attendance"
      requiresChild={true}
      requiresDateRange={true}
      dateFields={[
        { key: 'start', label: 'Start Date' },
        { key: 'end', label: 'End Date' },
      ]}
      options={[
        { key: 'includeEvidence', label: 'Include Evidence', type: 'boolean', defaultValue: true },
        { key: 'includeGrades', label: 'Include Grades', type: 'boolean', defaultValue: true },
        { key: 'includeAttendance', label: 'Include Attendance', type: 'boolean', defaultValue: true },
      ]}
      onExport={handleExport}
    />
  );
}

