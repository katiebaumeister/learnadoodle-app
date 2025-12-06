/**
 * Substitute Packet Export Modal
 */
import React from 'react';
import BaseExportModal from './BaseExportModal';
import { exportSubstitutePacket } from '../../lib/services/exportClient';

export default function SubstitutePacketExportModal({ children, ...props }) {
  const handleExport = async ({ dates, options }) => {
    const childIds = children.map(c => c.id);
    const date = dates.date || new Date();
    return await exportSubstitutePacket(
      childIds,
      date,
      options.includeNotes !== false,
      options.includeMaterials !== false
    );
  };

  return (
    <BaseExportModal
      {...props}
      title="Export Substitute Teacher Packet"
      description="Export a complete packet for substitute teachers"
      requiresChild={false}
      dateFields={[
        { key: 'date', label: 'Date' },
      ]}
      options={[
        { key: 'includeNotes', label: 'Include Notes', type: 'boolean', defaultValue: true },
        { key: 'includeMaterials', label: 'Include Materials', type: 'boolean', defaultValue: true },
      ]}
      onExport={handleExport}
    />
  );
}

