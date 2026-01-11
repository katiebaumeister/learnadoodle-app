/**
 * Student Profile Export Service
 * Exports comprehensive student profile data
 */
import { supabase } from '../supabase';

export async function exportStudentProfile(childId, format = 'json') {
  try {
    // Get child basic info
    const { data: child, error: childError } = await supabase
      .from('children')
      .select('*')
      .eq('id', childId)
      .single();

    if (childError) throw childError;

    // Get all related data
    const [
      documents,
      skills,
      mastery,
      attendance,
      portfolio,
      grades,
      learnerProfile,
      supportProfile,
      readinessData,
      masterySnapshots
    ] = await Promise.all([
      // Documents
      supabase
        .from('child_documents')
        .select('*')
        .eq('child_id', childId)
        .order('created_at', { ascending: false }),
      
      // Skills
      supabase.rpc('infer_skills', { p_child_id: childId }),
      
      // Mastery
      supabase
        .from('student_standard_mastery')
        .select(`
          *,
          standard:standards!student_standard_mastery_standard_id_fkey(
            id,
            standard_code,
            standard_text,
            subject
          )
        `)
        .eq('student_id', childId),
      
      // Attendance
      supabase
        .from('attendance_records')
        .select('*')
        .eq('child_id', childId)
        .order('day_date', { ascending: false }),
      
      // Portfolio
      supabase
        .from('uploads')
        .select('*')
        .eq('child_id', childId)
        .order('created_at', { ascending: false }),
      
      // Grades
      supabase
        .from('grades')
        .select(`
          *,
          subject:subject!grades_subject_id_fkey(id, name)
        `)
        .eq('child_id', childId)
        .order('created_at', { ascending: false }),
      
      // Learner Profile
      supabase
        .from('child_learner_profile')
        .select('*')
        .eq('child_id', childId)
        .single(),
      
      // Support Profile
      supabase
        .from('child_support_profiles')
        .select('*')
        .eq('child_id', childId)
        .single(),
      
      // College Readiness
      supabase
        .from('college_readiness')
        .select('*')
        .eq('child_id', childId)
        .single(),
      
      // Mastery Snapshots
      supabase
        .from('mastery_snapshots')
        .select('*')
        .eq('child_id', childId)
        .order('snapshot_date', { ascending: false })
    ]);

    // Compile export data
    const exportData = {
      exportDate: new Date().toISOString(),
      student: {
        id: child.id,
        name: child.first_name || child.name,
        birthDate: child.birth_date,
        gradeLevel: child.grade_level,
        avatar: child.avatar,
        notes: child.notes
      },
      documents: documents.data || [],
      skills: skills.data || [],
      mastery: {
        records: mastery.data || [],
        summary: {
          total: mastery.data?.length || 0,
          mastered: mastery.data?.filter(m => m.mastery_level === 'mastered').length || 0,
          developing: mastery.data?.filter(m => m.mastery_level === 'developing').length || 0,
          needsWork: mastery.data?.filter(m => m.mastery_level === 'needs_work').length || 0,
          notAttempted: mastery.data?.filter(m => m.mastery_level === 'not_attempted').length || 0
        }
      },
      attendance: {
        records: attendance.data || [],
        summary: {
          totalDays: attendance.data?.length || 0,
          totalHours: Math.round((attendance.data?.reduce((sum, a) => sum + (a.minutes || 0), 0) || 0) / 60),
          presentDays: attendance.data?.filter(a => a.status === 'present').length || 0
        }
      },
      portfolio: {
        items: portfolio.data || [],
        count: portfolio.data?.length || 0
      },
      grades: {
        records: grades.data || [],
        summary: {
          count: grades.data?.length || 0,
          averageScore: grades.data?.length > 0
            ? Math.round(grades.data
                .filter(g => g.score !== null)
                .reduce((sum, g) => sum + (g.score || 0), 0) / 
                grades.data.filter(g => g.score !== null).length || 1)
            : null
        }
      },
      learnerProfile: learnerProfile.data || null,
      supportProfile: supportProfile.data || null,
      collegeReadiness: readinessData.data || null,
      masterySnapshots: masterySnapshots.data || []
    };

    // Format based on requested format
    if (format === 'json') {
      return {
        success: true,
        data: exportData,
        filename: `student_profile_${child.first_name || child.name}_${new Date().toISOString().split('T')[0]}.json`
      };
    } else if (format === 'csv') {
      // Convert to CSV format
      const csvRows = [];
      
      // Student Info
      csvRows.push(['Student Information']);
      csvRows.push(['Name', exportData.student.name]);
      csvRows.push(['Birth Date', exportData.student.birthDate || '']);
      csvRows.push(['Grade Level', exportData.student.gradeLevel || '']);
      csvRows.push([]);
      
      // Summary
      csvRows.push(['Summary Statistics']);
      csvRows.push(['Total Documents', exportData.documents.length]);
      csvRows.push(['Skills Tracked', exportData.skills.length]);
      csvRows.push(['Standards Mastered', exportData.mastery.summary.mastered]);
      csvRows.push(['Total Attendance Days', exportData.attendance.summary.totalDays]);
      csvRows.push(['Total Learning Hours', exportData.attendance.summary.totalHours]);
      csvRows.push(['Portfolio Items', exportData.portfolio.count]);
      csvRows.push(['Grades Recorded', exportData.grades.summary.count]);
      csvRows.push([]);
      
      // Documents
      csvRows.push(['Documents']);
      csvRows.push(['Type', 'Title', 'Created Date']);
      exportData.documents.forEach(doc => {
        csvRows.push([doc.type, doc.title, doc.created_at || '']);
      });
      csvRows.push([]);
      
      // Skills
      csvRows.push(['Skills']);
      csvRows.push(['Skill', 'Level', 'Confidence']);
      exportData.skills.forEach(skill => {
        csvRows.push([skill.skill, skill.level || '', skill.confidence || '']);
      });
      csvRows.push([]);
      
      // Mastery
      csvRows.push(['Mastery Records']);
      csvRows.push(['Standard Code', 'Subject', 'Mastery Level', 'Score', 'Updated Date']);
      exportData.mastery.records.forEach(m => {
        csvRows.push([
          m.standard?.standard_code || '',
          m.standard?.subject || '',
          m.mastery_level || '',
          m.score || '',
          m.updated_at || ''
        ]);
      });
      
      const csvContent = csvRows.map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ).join('\n');
      
      return {
        success: true,
        data: csvContent,
        filename: `student_profile_${child.first_name || child.name}_${new Date().toISOString().split('T')[0]}.csv`
      };
    }

    throw new Error(`Unsupported format: ${format}`);
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to export student profile'
    };
  }
}

export async function downloadStudentProfile(childId, format = 'json') {
  const result = await exportStudentProfile(childId, format);
  
  if (!result.success) {
    throw new Error(result.error);
  }

  if (typeof window !== 'undefined') {
    const blob = new Blob(
      [format === 'json' ? JSON.stringify(result.data, null, 2) : result.data],
      { type: format === 'json' ? 'application/json' : 'text/csv' }
    );
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  return result;
}

/**
 * Export comprehensive ZIP file with all child data
 * Note: ZIP export requires JSZip library to be installed.
 * For now, this function returns an error directing users to use JSON/CSV exports.
 * To enable ZIP export, install jszip and modify this function to use it.
 */
export async function exportStudentProfileZip(childId) {
  // For now, return error message since JSZip dynamic import causes bundling issues
  // Users can use JSON or CSV exports instead, or ZIP can be implemented via backend
  return {
    success: false,
    error: 'ZIP export is currently unavailable. Please use JSON or CSV export options instead. ZIP export can be implemented via backend API if needed.'
  };
  
  /* Future implementation when JSZip is available:
  try {
    // Get all export data
    const exportData = await exportStudentProfile(childId, 'json');
    if (!exportData.success) {
      throw new Error(exportData.error);
    }

    const data = exportData.data;
    // JSZip would be used here to create ZIP file
    // const zip = new JSZip();
    // ... add files to zip ...
    // const zipBlob = await zip.generateAsync({ type: 'blob' });
    
    return {
      success: true,
      data: zipBlob,
      filename: `student_profile_complete_${data.student.name}_${new Date().toISOString().split('T')[0]}.zip`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to create ZIP export'
    };
  }
  */
}

/**
 * Fallback: Use backend API for ZIP export
 */
async function exportStudentProfileZipBackend(childId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  // For now, return error suggesting manual export
  // In production, you'd call a backend endpoint
  throw new Error('ZIP export requires JSZip library. Please install jszip or use individual exports.');
}

/**
 * Generate CSV for documents
 */
function generateDocumentsCSV(documents) {
  if (!documents || documents.length === 0) return null;
  
  const rows = [['Type', 'Title', 'Created Date', 'File URL']];
  documents.forEach(doc => {
    rows.push([
      doc.type || '',
      doc.title || '',
      doc.created_at || '',
      doc.file_url || ''
    ]);
  });
  
  return rows.map(row => 
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
}

/**
 * Generate CSV for skills
 */
function generateSkillsCSV(skills) {
  if (!skills || skills.length === 0) return null;
  
  const rows = [['Skill', 'Level', 'Confidence', 'Recommended Steps']];
  skills.forEach(skill => {
    rows.push([
      skill.skill || '',
      skill.level || '',
      skill.confidence || '',
      Array.isArray(skill.recommended_steps) ? skill.recommended_steps.join('; ') : ''
    ]);
  });
  
  return rows.map(row => 
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
}

/**
 * Generate CSV for mastery
 */
function generateMasteryCSV(masteryRecords) {
  if (!masteryRecords || masteryRecords.length === 0) return null;
  
  const rows = [['Standard Code', 'Subject', 'Mastery Level', 'Score', 'Updated Date']];
  masteryRecords.forEach(m => {
    rows.push([
      m.standard?.standard_code || '',
      m.standard?.subject || '',
      m.mastery_level || '',
      m.score || '',
      m.updated_at || ''
    ]);
  });
  
  return rows.map(row => 
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
}

/**
 * Generate CSV for attendance
 */
function generateAttendanceCSV(attendanceRecords) {
  if (!attendanceRecords || attendanceRecords.length === 0) return null;
  
  const rows = [['Date', 'Status', 'Minutes', 'Hours', 'Note']];
  attendanceRecords.forEach(record => {
    const hours = record.minutes ? (record.minutes / 60).toFixed(2) : '0';
    rows.push([
      record.day_date || '',
      record.status || '',
      record.minutes || '0',
      hours,
      record.note || ''
    ]);
  });
  
  return rows.map(row => 
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
}

/**
 * Generate CSV for portfolio
 */
function generatePortfolioCSV(portfolioItems) {
  if (!portfolioItems || portfolioItems.length === 0) return null;
  
  const rows = [['Title', 'Subject', 'Type', 'Created Date', 'File URL']];
  portfolioItems.forEach(item => {
    rows.push([
      item.caption || item.title || '',
      item.subject_id || '',
      item.mime || '',
      item.created_at || '',
      item.file_url || item.url || ''
    ]);
  });
  
  return rows.map(row => 
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
}

/**
 * Generate CSV for grades
 */
function generateGradesCSV(gradesRecords) {
  if (!gradesRecords || gradesRecords.length === 0) return null;
  
  const rows = [['Term', 'Subject', 'Grade', 'Score', 'Credits', 'Created Date', 'Notes']];
  gradesRecords.forEach(grade => {
    rows.push([
      grade.term_label || '',
      grade.subject?.name || '',
      grade.grade || '',
      grade.score || '',
      grade.credits || '0',
      grade.created_at || '',
      grade.notes || ''
    ]);
  });
  
  return rows.map(row => 
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
}

/**
 * Generate summary text file
 */
function generateSummaryText(data) {
  return `
STUDENT PROFILE SUMMARY
======================

Student: ${data.student.name}
Export Date: ${data.exportDate}
Birth Date: ${data.student.birthDate || 'Not specified'}
Grade Level: ${data.student.gradeLevel || 'Not specified'}

SUMMARY STATISTICS
------------------
Total Documents: ${data.documents.length}
Skills Tracked: ${data.skills.length}
Standards Mastered: ${data.mastery.summary.mastered} / ${data.mastery.summary.total}
Total Attendance Days: ${data.attendance.summary.totalDays}
Total Learning Hours: ${data.attendance.summary.totalHours}
Portfolio Items: ${data.portfolio.count}
Grades Recorded: ${data.grades.summary.count}
Average Score: ${data.grades.summary.averageScore || 'N/A'}%

DATA OWNERSHIP
--------------
This export contains all data associated with ${data.student.name}.
You own this data and can use it as needed.
All data is exported in a portable format for your records.

For questions or support, contact your system administrator.
`;
}

export async function downloadStudentProfileZip(childId) {
  const result = await exportStudentProfileZip(childId);
  
  if (!result.success) {
    // Show error message to user
    if (typeof window !== 'undefined') {
      alert(result.error);
    }
    throw new Error(result.error);
  }

  // If ZIP export is implemented, download the file
  if (result.data && typeof window !== 'undefined') {
    const url = window.URL.createObjectURL(result.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  return result;
}

