/**
 * Weekly Plan Export Modal
 */
import React from 'react';
import BaseExportModal from './BaseExportModal';
import { exportWeeklyPlan } from '../../lib/services/exportClient';

export default function WeeklyPlanExportModal(props) {
  const handleExport = async ({ childId, dates }) => {
    const weekStart = dates.start || new Date();
    const weekEnd = dates.end || new Date();
    
    return await exportWeeklyPlan(childId, weekStart, weekEnd, 'pdf');
  };

  return (
    <BaseExportModal
      {...props}
      title="Export Weekly Plan"
      description="Export a weekly learning plan with schedule and assignments"
      requiresChild={true}
      requiresDateRange={true}
      dateFields={[
        { key: 'start', label: 'Week Start' },
        { key: 'end', label: 'Week End' },
      ]}
      onExport={handleExport}
    />
  );
}

