/**
 * Web Child Student Settings Tab
 * Shows student settings and essential documents
 * Reuses components from RecordsPhase4
 */
import React, { useState, useEffect } from 'react';
import { Shield, Plus, X, Download, Database } from 'lucide-react';
import { 
  RecordsSectionGroup, 
  DocumentsSection,
  Modal,
} from '../../records/RecordsPhase4';
import {
  getDocuments,
  addDocument,
  deleteDocument,
} from '../../../lib/services/recordsClient';
import { downloadStudentProfile, downloadStudentProfileZip } from '../../../lib/services/studentProfileExport';
import DataOwnershipPanel from '../../data/DataOwnershipPanel';
import OfflineStoragePanel from '../../data/OfflineStoragePanel';

export default function WebChildStudentSettingsTab({ childId, childName, familyId }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showAddDocumentModal, setShowAddDocumentModal] = useState(false);
  const [newDocument, setNewDocument] = useState({
    type: 'medical_profile',
    title: '',
    file_url: '',
    metadata: {},
  });

  useEffect(() => {
    if (childId) {
      loadDocuments();
    }
  }, [childId]);

  const loadDocuments = async () => {
    if (!childId) return;
    
    setLoading(true);
    try {
      const docs = await getDocuments(childId);
      setDocuments(docs || []);
    } catch (error) {
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDocument = async () => {
    if (!childId) {
      alert('Please select a child');
      return;
    }

    if (!newDocument.title) {
      alert('Please provide a document title');
      return;
    }

    try {
      await addDocument({
        child_id: childId,
        ...newDocument,
      });
      
      alert('Document added successfully');
      setShowAddDocumentModal(false);
      setNewDocument({
        type: 'medical_profile',
        title: '',
        file_url: '',
        metadata: {},
      });
      loadDocuments();
    } catch (error) {
      alert('Failed to add document. Please try again.');
    }
  };

  const handleDeleteDocument = async (documentId) => {
    if (!confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      await deleteDocument(documentId);
      loadDocuments();
    } catch (error) {
      alert('Failed to delete document. Please try again.');
    }
  };

  const handleExportProfile = async (format = 'json') => {
    if (!childId) {
      alert('Please select a child');
      return;
    }

    setExporting(true);
    try {
      if (format === 'zip') {
        await downloadStudentProfileZip(childId);
        alert('Profile exported successfully as ZIP');
      } else {
        await downloadStudentProfile(childId, format);
        alert(`Profile exported successfully as ${format.toUpperCase()}`);
      }
    } catch (error) {
      alert('Failed to export profile. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Data Ownership Panel */}
      <RecordsSectionGroup
        icon={<Shield className="h-4 w-4" />}
        title="Data Ownership & Control"
        subtitle="Export, manage, and delete your data"
        defaultOpen={true}
      >
        <div className="py-4">
          <DataOwnershipPanel 
            childId={childId} 
            childName={childName} 
            familyId={familyId} 
          />
        </div>
      </RecordsSectionGroup>

      {/* Offline Storage Panel */}
      <RecordsSectionGroup
        icon={<Database className="h-4 w-4" />}
        title="Offline Storage & Local Data"
        subtitle="Manage local caching and offline access"
        defaultOpen={false}
      >
        <div className="py-4">
          <OfflineStoragePanel familyId={familyId} />
        </div>
      </RecordsSectionGroup>

      {/* Essential Documents Section */}
      <RecordsSectionGroup
        icon={<Shield className="h-4 w-4" />}
        title="Essential Documents"
        subtitle="Medical profiles, ID cards, safety plans, and emergency information"
        defaultOpen={true}
        action={
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowAddDocumentModal(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-600 transition hover:bg-slate-50"
          >
            <Plus size={14} />
            <span>Add Document</span>
          </button>
        }
      >
        <DocumentsSection
          documents={documents}
          onAddDocument={() => setShowAddDocumentModal(true)}
          onDeleteDocument={handleDeleteDocument}
        />
      </RecordsSectionGroup>

      {/* Add Document Modal */}
      {showAddDocumentModal && (
        <Modal
          isOpen={showAddDocumentModal}
          onClose={() => setShowAddDocumentModal(false)}
          title={`Add Document for ${childName || 'Student'}`}
          subtitle="Add medical profiles, ID cards, safety plans, and emergency information."
          maxWidth="max-w-lg"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Document Type
              </label>
              <select
                value={newDocument.type}
                onChange={(e) => setNewDocument({ ...newDocument, type: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="medical_profile">Medical Profile</option>
                <option value="id_card">ID Card</option>
                <option value="allergy_sheet">Allergy Sheet</option>
                <option value="vaccination_record">Vaccination Record</option>
                <option value="safety_plan">Safety Plan</option>
                <option value="permission_form">Permission Form</option>
                <option value="iep">IEP</option>
                <option value="504_plan">504 Plan</option>
                <option value="behavior_plan">Behavior Plan</option>
                <option value="therapy_contact">Therapy Contact</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Title *
              </label>
              <input
                type="text"
                value={newDocument.title}
                onChange={(e) => setNewDocument({ ...newDocument, title: e.target.value })}
                placeholder="e.g. Medical Profile Card"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                File URL (Supabase Storage - Optional)
              </label>
              <input
                type="text"
                value={newDocument.file_url}
                onChange={(e) => setNewDocument({ ...newDocument, file_url: e.target.value })}
                placeholder="e.g. https://storage.supabase.co/..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                Upload the file to Supabase Storage first, then paste the URL here.
              </p>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                onClick={() => setShowAddDocumentModal(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddDocument}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                Add Document
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

