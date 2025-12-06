/**
 * Curriculum Plan Export Modal
 */
import React from 'react';
import BaseExportModal from './BaseExportModal';
import { exportCurriculumPlan } from '../../lib/services/exportClient';

export default function CurriculumPlanExportModal(props) {
  const handleExport = async ({ childId, dates, options }) => {
    return await exportCurriculumPlan(
      childId,
      options.subjectId || null,
      dates.start || null,
      dates.end || null
    );
  };

  return (
    <BaseExportModal
      {...props}
      title="Export Curriculum Plan"
      description="Export a complete curriculum plan with units and lessons"
      requiresChild={true}
      requiresDateRange={false}
      dateFields={[
        { key: 'start', label: 'Start Date (Optional)' },
        { key: 'end', label: 'End Date (Optional)' },
      ]}
      onExport={handleExport}
    />
  );
}

