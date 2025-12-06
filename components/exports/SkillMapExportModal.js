/**
 * Skill Map Export Modal
 */
import React from 'react';
import BaseExportModal from './BaseExportModal';
import { exportSkillMap } from '../../lib/services/exportClient';

export default function SkillMapExportModal(props) {
  const handleExport = async ({ childId, options }) => {
    return await exportSkillMap(
      childId,
      options.subjectId || null,
      options.format || 'pdf'
    );
  };

  return (
    <BaseExportModal
      {...props}
      title="Export Skill Map"
      description="Export a visual skill progression map"
      requiresChild={true}
      requiresDateRange={false}
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

