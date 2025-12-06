/**
 * Syllabus Upload Modal
 * Clean UI for: Upload → Extract → Preview → Convert to Plan
 */
import React, { useState, useRef } from 'react';
import { Upload, FileText, X, CheckCircle, Loader, Calendar, BookOpen, Sparkles, Scan } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { apiRequest } from '../../lib/apiClient';
import SyllabusScanner from '../syllabus/SyllabusScanner';

// Helper function for conditional classes
const clsx = (...classes) => {
  return classes.filter(Boolean).join(' ');
};

export default function SyllabusUploadModal({ 
  visible, 
  onClose, 
  familyId, 
  children = [], 
  subjects = [],
  onPlanCreated 
}) {
  const [step, setStep] = useState('upload'); // 'upload' | 'extracting' | 'preview' | 'converting'
  const [file, setFile] = useState(null);
  const [uploadPath, setUploadPath] = useState(null);
  const [syllabusId, setSyllabusId] = useState(null);
  const [selectedChildId, setSelectedChildId] = useState(children[0]?.id || null);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [syllabusTitle, setSyllabusTitle] = useState('');
  const [extractedOutline, setExtractedOutline] = useState(null);
  const [error, setError] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  const reset = () => {
    setStep('upload');
    setFile(null);
    setUploadPath(null);
    setSyllabusId(null);
    setExtractedOutline(null);
    setError(null);
    setSyllabusTitle('');
    setSelectedSubjectId(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current) {
      dropZoneRef.current.style.backgroundColor = '#f0f9ff';
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current) {
      dropZoneRef.current.style.backgroundColor = '#ffffff';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current) {
      dropZoneRef.current.style.backgroundColor = '#ffffff';
    }
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    
    // Validate file type
    const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!validTypes.includes(selectedFile.type)) {
      setError('Please upload a PDF, Word document, or text file');
      return;
    }

    setFile(selectedFile);
    setError(null);
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file || !familyId || !selectedChildId || !selectedSubjectId || !syllabusTitle.trim()) {
      setError('Please fill in all fields and select a file');
      return;
    }

    try {
      setStep('extracting');
      setError(null);

      // 1. Upload file to storage
      const fileName = `${familyId}/${Date.now()}_${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('syllabi')
        .upload(fileName, file, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) throw uploadError;
      setUploadPath(fileName);

      // 2. Create syllabus record
      const { data: syllabusData, error: syllabusError } = await supabase
        .from('syllabi')
        .insert({
          family_id: familyId,
          child_id: selectedChildId,
          subject_id: selectedSubjectId,
          title: syllabusTitle.trim(),
          upload_id: null, // Will link after upload record created
        })
        .select()
        .single();

      if (syllabusError) throw syllabusError;
      setSyllabusId(syllabusData.id);

      // 3. Create upload record
      const { data: uploadRecord, error: recordError } = await supabase
        .from('uploads')
        .insert({
          family_id: familyId,
          child_id: selectedChildId,
          subject_id: selectedSubjectId,
          storage_path: fileName,
          filename: file.name,
          mime: file.type,
          bytes: file.size,
          kind: 'syllabus',
        })
        .select()
        .single();

      if (recordError) throw recordError;

      // 4. Update syllabus with upload_id
      await supabase
        .from('syllabi')
        .update({ upload_id: uploadRecord.id })
        .eq('id', syllabusData.id);

      // 5. Parse syllabus using backend API
      const { data: parseResult, error: parseError } = await apiRequest('/api/llm/parse-syllabus', {
        method: 'POST',
        body: JSON.stringify({
          syllabus_id: syllabusData.id,
          storage_bucket: 'syllabi',
          storage_path: fileName,
          family_id: familyId,
          child_id: selectedChildId,
        }),
      });

      if (parseError) throw parseError;

      // 6. Set extracted outline
      setExtractedOutline(parseResult.outline);
      setStep('preview');
    } catch (err) {
      console.error('Error uploading syllabus:', err);
      setError(err.message || 'Failed to upload and extract syllabus');
      setStep('upload');
    }
  };

  const handleConvertToPlan = async () => {
    if (!extractedOutline || !syllabusId) return;

    try {
      setStep('converting');
      setError(null);

      // Create lesson plan from extracted outline
      const steps = [];
      let order = 1;

      // Process units and lessons
      if (extractedOutline.units && Array.isArray(extractedOutline.units)) {
        extractedOutline.units.forEach((unit) => {
          // Add unit as a step
          steps.push({
            order: order++,
            kind: 'unit',
            title: unit.title || 'Untitled Unit',
            details: `Weeks: ${unit.weeks || 'N/A'}`,
            minutes: 0,
          });

          // Add lessons within unit
          if (unit.sections && Array.isArray(unit.sections)) {
            unit.sections.forEach((section) => {
              steps.push({
                order: order++,
                kind: 'lesson',
                title: section.title || 'Untitled Lesson',
                details: section.notes || '',
                minutes: section.minutes_estimate || 30,
              });
            });
          }
        });
      }

      // Add assignments
      if (extractedOutline.assignments && Array.isArray(extractedOutline.assignments)) {
        extractedOutline.assignments.forEach((assignment) => {
          steps.push({
            order: order++,
            kind: 'assignment',
            title: assignment.title || 'Untitled Assignment',
            details: assignment.due_hint || '',
            minutes: assignment.minutes_estimate || 30,
          });
        });
      }

      // Create lesson plan using RPC
      const { data: planData, error: planError } = await supabase.rpc('create_lesson_plan', {
        _family: familyId,
        _subject: selectedSubjectId,
        _title: syllabusTitle.trim(),
        _description: `Extracted from syllabus: ${extractedOutline.metadata?.course_name || syllabusTitle}`,
        _grade_level: null,
        _tags: ['syllabus', 'auto-extracted'],
        _steps: steps,
      });

      if (planError) throw planError;

      // Success!
      if (onPlanCreated) {
        onPlanCreated({ planId: planData.id, syllabusId });
      }

      handleClose();
    } catch (err) {
      console.error('Error converting to plan:', err);
      setError(err.message || 'Failed to convert syllabus to plan');
      setStep('preview');
    }
  };

  if (!visible) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        padding: '16px',
      }}
      onClick={handleClose}
    >
      <div 
        className="w-full max-w-3xl max-h-[90vh] rounded-xl bg-white shadow-xl overflow-hidden flex flex-col"
        style={{
          width: '100%',
          maxWidth: '768px',
          maxHeight: '90vh',
          borderRadius: '12px',
          backgroundColor: '#ffffff',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between border-b border-slate-200 px-6 py-4"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #e2e8f0',
            padding: '16px 24px',
          }}
        >
          <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Sparkles size={24} className="text-indigo-600" />
            <h2 className="text-xl font-semibold text-slate-900" style={{ fontSize: '20px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
              Upload Syllabus
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 transition"
            style={{
              color: '#94a3b8',
              cursor: 'pointer',
              border: 'none',
              background: 'none',
              padding: '4px',
            }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {step === 'upload' && (
            <div className="space-y-6" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* File Upload Zone */}
              <div
                ref={dropZoneRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center cursor-pointer transition hover:border-indigo-400 hover:bg-indigo-50/50"
                style={{
                  border: '2px dashed #cbd5e1',
                  borderRadius: '8px',
                  padding: '48px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: file ? '#f0f9ff' : '#ffffff',
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleFileInputChange}
                  style={{ display: 'none' }}
                />
                {file ? (
                  <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <FileText size={48} className="text-indigo-600 mx-auto" />
                    <p className="text-sm font-medium text-slate-900" style={{ fontSize: '14px', fontWeight: '500', color: '#0f172a', margin: 0 }}>
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500" style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <Upload size={48} className="text-slate-400 mx-auto" />
                    <div>
                      <p className="text-sm font-medium text-slate-900" style={{ fontSize: '14px', fontWeight: '500', color: '#0f172a', margin: 0 }}>
                        Drop your syllabus here
                      </p>
                      <p className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', marginBottom: 0 }}>
                        or click to browse
                      </p>
                    </div>
                    <p className="text-xs text-slate-400" style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                      PDF, Word, or Text files
                    </p>
                  </div>
                )}
              </div>

              {/* Form Fields */}
              <div className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2" style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#334155', marginBottom: '8px' }}>
                    Syllabus Title
                  </label>
                  <input
                    type="text"
                    value={syllabusTitle}
                    onChange={(e) => setSyllabusTitle(e.target.value)}
                    placeholder="e.g. Algebra 1 - Fall 2025"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    style={{
                      width: '100%',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      padding: '8px 16px',
                      fontSize: '14px',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2" style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#334155', marginBottom: '8px' }}>
                    Child
                  </label>
                  <select
                    value={selectedChildId || ''}
                    onChange={(e) => setSelectedChildId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    style={{
                      width: '100%',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      padding: '8px 16px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="">Select a child</option>
                    {children.map(child => (
                      <option key={child.id} value={child.id}>
                        {child.first_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2" style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#334155', marginBottom: '8px' }}>
                    Subject
                  </label>
                  <select
                    value={selectedSubjectId || ''}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    style={{
                      width: '100%',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      padding: '8px 16px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="">Select a subject</option>
                    {subjects.map(subject => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3" style={{ borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '12px' }}>
                  <p className="text-sm text-red-800" style={{ fontSize: '14px', color: '#991b1b', margin: 0 }}>
                    {error}
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 'extracting' && (
            <div className="flex flex-col items-center justify-center py-12" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
              <Loader size={48} className="text-indigo-600 animate-spin mb-4" />
              <p className="text-lg font-medium text-slate-900 mb-2" style={{ fontSize: '18px', fontWeight: '500', color: '#0f172a', marginBottom: '8px', marginTop: 0 }}>
                Extracting syllabus structure...
              </p>
              <p className="text-sm text-slate-500" style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
                This may take a moment
              </p>
            </div>
          )}

          {step === 'preview' && extractedOutline && (
            <div className="space-y-6" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4" style={{ borderRadius: '8px', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', padding: '16px' }}>
                <div className="flex items-center gap-2 mb-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <CheckCircle size={20} className="text-emerald-600" />
                  <p className="text-sm font-semibold text-emerald-900" style={{ fontSize: '14px', fontWeight: '600', color: '#065f46', margin: 0 }}>
                    Extraction Complete
                  </p>
                </div>
                <p className="text-xs text-emerald-700" style={{ fontSize: '12px', color: '#047857', margin: 0 }}>
                  Found {extractedOutline.units?.length || 0} units and {extractedOutline.assignments?.length || 0} assignments
                </p>
              </div>

              {/* Preview */}
              <div className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 className="text-lg font-semibold text-slate-900" style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
                  Extracted Structure
                </h3>

                {extractedOutline.units && extractedOutline.units.length > 0 && (
                  <div className="space-y-3" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {extractedOutline.units.map((unit, idx) => (
                      <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 p-4" style={{ borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', padding: '16px' }}>
                        <div className="flex items-center gap-2 mb-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <BookOpen size={16} className="text-indigo-600" />
                          <h4 className="text-sm font-semibold text-slate-900" style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
                            {unit.title || `Unit ${idx + 1}`}
                          </h4>
                          {unit.weeks && (
                            <span className="text-xs text-slate-500" style={{ fontSize: '12px', color: '#64748b' }}>
                              ({unit.weeks} weeks)
                            </span>
                          )}
                        </div>
                        {unit.sections && unit.sections.length > 0 && (
                          <ul className="ml-6 space-y-1" style={{ marginLeft: '24px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {unit.sections.map((section, sIdx) => (
                              <li key={sIdx} className="text-sm text-slate-600" style={{ fontSize: '14px', color: '#475569', margin: 0 }}>
                                • {section.title || `Lesson ${sIdx + 1}`}
                                {section.minutes_estimate && (
                                  <span className="text-xs text-slate-400 ml-2" style={{ fontSize: '12px', color: '#94a3b8', marginLeft: '8px' }}>
                                    ({section.minutes_estimate} min)
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {extractedOutline.assignments && extractedOutline.assignments.length > 0 && (
                  <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <h4 className="text-sm font-semibold text-slate-700" style={{ fontSize: '14px', fontWeight: '600', color: '#334155', margin: 0 }}>
                      Assignments
                    </h4>
                    {extractedOutline.assignments.map((assignment, idx) => (
                      <div key={idx} className="text-sm text-slate-600" style={{ fontSize: '14px', color: '#475569', margin: 0 }}>
                        • {assignment.title || `Assignment ${idx + 1}`}
                        {assignment.due_hint && (
                          <span className="text-xs text-slate-400 ml-2" style={{ fontSize: '12px', color: '#94a3b8', marginLeft: '8px' }}>
                            ({assignment.due_hint})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3" style={{ borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '12px' }}>
                  <p className="text-sm text-red-800" style={{ fontSize: '14px', color: '#991b1b', margin: 0 }}>
                    {error}
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 'converting' && (
            <div className="flex flex-col items-center justify-center py-12" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
              <Loader size={48} className="text-indigo-600 animate-spin mb-4" />
              <p className="text-lg font-medium text-slate-900 mb-2" style={{ fontSize: '18px', fontWeight: '500', color: '#0f172a', marginBottom: '8px', marginTop: 0 }}>
                Creating lesson plan...
              </p>
              <p className="text-sm text-slate-500" style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
                Converting extracted structure to plan
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div 
          className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px',
            borderTop: '1px solid #e2e8f0',
            padding: '16px 24px',
          }}
        >
          {step === 'upload' && (
            <>
              <button
                onClick={handleClose}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                style={{
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || !syllabusTitle.trim() || !selectedChildId || !selectedSubjectId}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  borderRadius: '8px',
                  backgroundColor: '#4f46e5',
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#ffffff',
                  cursor: (!file || !syllabusTitle.trim() || !selectedChildId || !selectedSubjectId) ? 'not-allowed' : 'pointer',
                  opacity: (!file || !syllabusTitle.trim() || !selectedChildId || !selectedSubjectId) ? 0.5 : 1,
                }}
              >
                Extract Structure
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={() => setStep('upload')}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                style={{
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
              <button
                onClick={handleConvertToPlan}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderRadius: '8px',
                  backgroundColor: '#4f46e5',
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                <Calendar size={16} />
                Convert to Plan
              </button>
            </>
          )}
        </div>
      </div>

      {/* Advanced Syllabus Scanner */}
      <SyllabusScanner
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        familyId={familyId}
        childId={selectedChildId}
        subjectId={selectedSubjectId}
        onComplete={(syllabus) => {
          setSyllabusId(syllabus.id);
          if (onPlanCreated) {
            onPlanCreated({ syllabusId: syllabus.id });
          }
          setShowScanner(false);
          handleClose();
        }}
      />
    </div>
  );
}

