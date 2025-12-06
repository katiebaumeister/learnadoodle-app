/**
 * Caregiver Packet Export Modal
 */
import React from 'react';
import BaseExportModal from './BaseExportModal';
import { exportCaregiverPacket } from '../../lib/services/exportClient';

export default function CaregiverPacketExportModal(props) {
  const handleExport = async ({ childId, dates, options }) => {
    return await exportCaregiverPacket(
      childId,
      dates.start,
      dates.end,
      {
        includeSchedule: options.includeSchedule !== false,
        includeProgress: options.includeProgress !== false,
        includeMaterials: options.includeMaterials !== false,
      }
    );
  };

  return (
    <BaseExportModal
      {...props}
      title="Export Caregiver/Tutor Packet"
      description="Export a PDF packet for caregivers and tutors"
      requiresChild={true}
      requiresDateRange={true}
      dateFields={[
        { key: 'start', label: 'Start Date' },
        { key: 'end', label: 'End Date' },
      ]}
      options={[
        { key: 'includeSchedule', label: 'Include Schedule', type: 'boolean', defaultValue: true },
        { key: 'includeProgress', label: 'Include Progress', type: 'boolean', defaultValue: true },
        { key: 'includeMaterials', label: 'Include Materials', type: 'boolean', defaultValue: true },
      ]}
      onExport={handleExport}
    />
  );
}

