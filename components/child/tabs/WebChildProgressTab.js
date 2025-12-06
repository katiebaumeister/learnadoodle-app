/**
 * Web Child Progress Tab
 * DEPRECATED: This tab is now replaced by Intelligence Hub → Analytics tab
 * Redirects to Intelligence Hub with analytics tab and child filter
 * Kept for backward compatibility but redirects immediately
 */
import React, { useEffect } from 'react';
import { Target } from 'lucide-react';
import { EmptyState } from '../../records/RecordsPhase4';

export default function WebChildProgressTab({ childId, familyId, onNavigate }) {
  // Redirect to Intelligence Hub Analytics tab
  useEffect(() => {
    if (typeof window !== 'undefined' && childId) {
      // Update URL to Intelligence Hub with analytics tab
      const params = new URLSearchParams({ tab: 'analytics', child: childId });
      window.history.replaceState({}, '', `?tab=intelligence&${params.toString()}`);
      // Trigger navigation if handler is available
      if (window.__ldSearchNavigate) {
        window.__ldSearchNavigate('intelligence', null, { tab: 'analytics', child: childId });
      }
    }
  }, [childId]);

  if (!childId) {
    return (
      <div className="flex items-center justify-center py-20">
        <EmptyState
          icon={<Target size={32} />}
          title="Select a learner"
          description="Choose a learner from the sidebar to view their progress."
        />
      </div>
    );
  }

  // Show redirecting message
  return (
    <div className="flex items-center justify-center py-20">
      <EmptyState
        icon={<Target size={32} />}
        title="Redirecting to Intelligence Hub"
        description="Progress analytics have moved to Intelligence Hub → Analytics tab."
      />
    </div>
  );
}
