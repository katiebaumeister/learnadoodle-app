/**
 * Portfolio Highlights Card - Shows recent evidence/portfolio items
 */
import React from 'react';
import { Upload, Image, FileText, File } from 'lucide-react';

export default function PortfolioHighlightsCard({ data, child, onNavigate }) {
  const recentEvidence = data?.recentEvidence || [];
  
  const getEvidenceIcon = (type) => {
    switch (type) {
      case 'photo':
        return <Image size={16} style={{ color: '#64748b' }} />;
      case 'pdf':
        return <FileText size={16} style={{ color: '#64748b' }} />;
      default:
        return <File size={16} style={{ color: '#64748b' }} />;
    }
  };
  
  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };
  
  const handleOpenPortfolio = () => {
    if (onNavigate) {
      onNavigate(`/records?tab=portfolio&child=${child?.id}`);
    } else if (typeof window !== 'undefined') {
      if (window.__ldSearchNavigate) {
        window.__ldSearchNavigate('records', null, { tab: 'portfolio', child: child?.id });
      } else {
        window.location.href = `/records?tab=portfolio&child=${child?.id}`;
      }
    }
  };
  
  const handleEvidenceClick = (evidenceId) => {
    if (onNavigate) {
      onNavigate(`/records?tab=portfolio&child=${child?.id}&evidenceId=${evidenceId}`);
    } else if (typeof window !== 'undefined') {
      if (window.__ldSearchNavigate) {
        window.__ldSearchNavigate('records', null, { tab: 'portfolio', child: child?.id, evidenceId });
      } else {
        window.location.href = `/records?tab=portfolio&child=${child?.id}&evidenceId=${evidenceId}`;
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
        <Upload size={18} style={{ color: '#64748b' }} />
        <h3 
          className="text-sm font-semibold text-slate-900"
          style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}
        >
          Portfolio Highlights
        </h3>
      </div>
      
      {recentEvidence.length === 0 ? (
        <div className="text-sm text-slate-500 mb-4" style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
          No artifacts added yet for this time period.
        </div>
      ) : (
        <div className="space-y-2 mb-4" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {recentEvidence.slice(0, 3).map(evidence => (
            <div 
              key={evidence.id}
              onClick={() => handleEvidenceClick(evidence.id)}
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f8fafc';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {getEvidenceIcon(evidence.type)}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-700 truncate" style={{ fontSize: '14px', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {evidence.caption || 'Untitled'}
                </div>
                {evidence.created_at && (
                  <div className="text-xs text-slate-500 mt-0.5" style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {formatDate(evidence.created_at)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      <button
        onClick={handleOpenPortfolio}
        className="w-full text-sm font-medium text-indigo-600 hover:text-indigo-700 py-2 px-3 rounded-lg hover:bg-indigo-50 transition-colors"
        style={{
          width: '100%',
          fontSize: '14px',
          fontWeight: '500',
          color: '#4f46e5',
          padding: '8px 12px',
          borderRadius: '8px',
          border: 'none',
          backgroundColor: 'transparent',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = '#eef2ff';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = 'transparent';
        }}
      >
        Open portfolio →
      </button>
    </div>
  );
}

