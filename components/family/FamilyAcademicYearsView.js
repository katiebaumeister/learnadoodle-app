import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import PlannerSettingsContent from '../settings/PlannerSettingsContent';
import { buildAcademicYearSectionKey, formatSchoolYearLabel } from './familySectionRouting';
import { familyStyles } from './familyDesignTokens';

function formatYearDates(yearRow) {
  if (!yearRow) return '';
  const start = yearRow.start_date ? new Date(`${String(yearRow.start_date).slice(0, 10)}T12:00:00`) : null;
  const end = yearRow.end_date ? new Date(`${String(yearRow.end_date).slice(0, 10)}T12:00:00`) : null;
  const fmt = (date) =>
    date?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) || '';
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  return fmt(start) || fmt(end) || '';
}

export default function FamilyAcademicYearsView({
  familyId,
  section,
  selectedYearId = null,
  onSelectYear,
  onBackToList,
  preloadedPlannerSettings = null,
}) {
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadYears = async () => {
      if (!familyId) {
        setYears([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        let result = await supabase
          .from('academic_years')
          .select('id, start_date, end_date, year_name, updated_at')
          .eq('family_id', familyId)
          .order('start_date', { ascending: false })
          .limit(24);
        if (
          result?.error
          && String(result.error?.message || '').toLowerCase().includes('year_name')
        ) {
          result = await supabase
            .from('academic_years')
            .select('id, start_date, end_date, updated_at')
            .eq('family_id', familyId)
            .order('start_date', { ascending: false })
            .limit(24);
        }
        if (cancelled) return;
        setYears(result.data || []);
      } catch (_) {
        if (!cancelled) setYears([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadYears();
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  const selectedYear = useMemo(
    () => years.find((year) => String(year.id) === String(selectedYearId)) || null,
    [years, selectedYearId]
  );

  const lockedSchoolYearLabel = useMemo(() => {
    if (!selectedYear) return null;
    const label = formatSchoolYearLabel(selectedYear);
    const match = label.match(/^(\d{4})[–-](\d{4})$/);
    if (match) return `${match[1]}-${match[2]}`;
    return label.replace('–', '-');
  }, [selectedYear]);

  if (section === 'academic-year' && selectedYear) {
    return (
      <View style={familyStyles.pageContent}>
        <TouchableOpacity
          style={localStyles.backLink}
          onPress={onBackToList}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={localStyles.backLinkText}>← Academic Years</Text>
        </TouchableOpacity>
        <View style={familyStyles.card}>
          <Text style={familyStyles.cardTitle}>{formatSchoolYearLabel(selectedYear)}</Text>
          <Text style={familyStyles.bodyText}>{formatYearDates(selectedYear)}</Text>
          <PlannerSettingsContent
            familyId={familyId}
            initialData={preloadedPlannerSettings}
            lockedSchoolYearLabel={lockedSchoolYearLabel}
            embeddedInFamily
            hidePageTitle
          />
        </View>
      </View>
    );
  }

  return (
    <View style={familyStyles.pageContent}>
      <View style={familyStyles.card}>
        {loading ? (
          <ActivityIndicator size="small" color="#2563EB" style={{ marginVertical: 12 }} />
        ) : years.length === 0 ? (
          <Text style={familyStyles.emptyText}>
            No academic years yet. Set up a year from Learning Preferences.
          </Text>
        ) : (
          years.map((year, index) => {
            const label = formatSchoolYearLabel(year);
            return (
              <View key={year.id}>
                {index > 0 ? <View style={familyStyles.rowDivider} /> : null}
                <TouchableOpacity
                  style={familyStyles.listRow}
                  onPress={() => onSelectYear?.(buildAcademicYearSectionKey(year.id))}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <View style={localStyles.yearRowText}>
                    <Text style={localStyles.yearRowTitle}>{label}</Text>
                    <Text style={localStyles.yearRowDates}>{formatYearDates(year)}</Text>
                  </View>
                  <ChevronRight size={16} color="rgba(15, 23, 42, 0.35)" />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

const localStyles = {
  backLink: {
    alignSelf: 'flex-start',
  },
  backLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  yearRowText: {
    flex: 1,
    gap: 4,
  },
  yearRowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  yearRowDates: {
    fontSize: 13,
    color: 'rgba(15, 23, 42, 0.55)',
  },
};
