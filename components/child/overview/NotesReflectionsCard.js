/**
 * Notes & Reflections Card - Shows recent notes
 */
import React from 'react';
import { FileText, Plus } from 'lucide-react';

export default function NotesReflectionsCard({ data, child, onNavigate }) {
  const recentNotes = data?.recentNotes || [];
  
  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };
  
  const truncateText = (text, maxLength = 60) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };
  
  const handleAddNote = () => {
    if (onNavigate) {
      onNavigate(`/records?tab=notes&child=${child?.id}&action=new`);
    } else if (typeof window !== 'undefined') {
      if (window.__ldSearchNavigate) {
        window.__ldSearchNavigate('records', null, { tab: 'notes', child: child?.id, action: 'new' });
      } else {
        window.location.href = `/records?tab=notes&child=${child?.id}&action=new`;
      }
    }
  };
  
  const handleViewAllNotes = () => {
    if (onNavigate) {
      onNavigate(`/records?tab=notes&child=${child?.id}`);
    } else if (typeof window !== 'undefined') {
      if (window.__ldSearchNavigate) {
        window.__ldSearchNavigate('records', null, { tab: 'notes', child: child?.id });
      } else {
        window.location.href = `/records?tab=notes&child=${child?.id}`;
      }
    }
  };
  
  return (
    <div 
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      style={{
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        padding: '20px',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      }}
    >
      <div className="flex items-center gap-2 mb-4" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <FileText size={18} style={{ color: '#64748b' }} />
        <h3 
          className="text-sm font-semibold text-slate-900"
          style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}
        >
          Notes & Reflections
        </h3>
      </div>
      
      {recentNotes.length === 0 ? (
        <div className="text-sm text-slate-500 mb-4" style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
          No notes yet in this period.
        </div>
      ) : (
        <div className="space-y-2 mb-4" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {recentNotes.slice(0, 3).map(note => (
            <div 
              key={note.id}
              className="text-sm"
              style={{ fontSize: '14px' }}
            >
              <div className="text-slate-700" style={{ color: '#334155' }}>
                {truncateText(note.text)}
              </div>
              {note.created_at && (
                <div className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  {formatDate(note.created_at)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      <div className="flex gap-2" style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleAddNote}
          className="flex-1 text-sm font-medium text-indigo-600 hover:text-indigo-700 py-2 px-3 rounded-lg hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1"
          style={{
            flex: 1,
            fontSize: '14px',
            fontWeight: '500',
            color: '#4f46e5',
            padding: '8px 12px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#eef2ff';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = 'transparent';
          }}
        >
          <Plus size={14} />
          Add note
        </button>
        
        {recentNotes.length > 0 && (
          <button
            onClick={handleViewAllNotes}
            className="flex-1 text-sm font-medium text-slate-600 hover:text-slate-700 py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors"
            style={{
              flex: 1,
              fontSize: '14px',
              fontWeight: '500',
              color: '#475569',
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'transparent',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#f8fafc';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            View all →
          </button>
        )}
      </div>
    </div>
  );
}

