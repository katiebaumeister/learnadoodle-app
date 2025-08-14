-- Re-seed holiday data only
-- Run this if you just need to add holiday data back

-- Re-insert global academic years
INSERT INTO public.global_academic_years (label)
VALUES ('2025-26'),
('2026-27'),
('2027-28')
ON CONFLICT (label) DO NOTHING;

-- Re-insert comprehensive US holidays 2025-26 & 2026-27
INSERT INTO public.global_official_holidays (holiday_date, name)
VALUES
/* === AY 2025-26 === */
('2025-07-04', 'Independence Day'),
('2025-09-01', 'Labor Day'),
('2025-10-13', 'Indigenous Peoples'' / Columbus Day'),
('2025-11-11', 'Veterans Day'),
('2025-11-27', 'Thanksgiving'),
('2025-11-28', 'Thanksgiving'),
-- Winter Break 22 Dec 2025 – 03 Jan 2026
('2025-12-22', 'Winter Break'),
('2025-12-23', 'Winter Break'),
('2025-12-24', 'Winter Break'),
('2025-12-25', 'Winter Break'),
('2025-12-26', 'Winter Break'),
('2025-12-29', 'Winter Break'),
('2025-12-30', 'Winter Break'),
('2025-12-31', 'Winter Break'),
('2026-01-01', 'Winter Break'),
('2026-01-02', 'Winter Break'),
('2026-01-03', 'Winter Break'),
('2026-01-19', 'MLK'),
('2026-02-16', 'Presidents Day'),
('2026-05-25', 'Memorial Day'),
/* === AY 2026-27 === */
('2026-07-04', 'Independence Day'),
('2026-09-07', 'Labor Day'),
('2026-10-12', 'Indigenous Peoples'' / Columbus Day'),
('2026-11-11', 'Veterans Day'),
('2026-11-26', 'Thanksgiving'),
('2026-11-27', 'Thanksgiving'),
-- Winter Break 20 Dec 2026 – 03 Jan 2027
('2026-12-20', 'Winter Break'),
('2026-12-21', 'Winter Break'),
('2026-12-22', 'Winter Break'),
('2026-12-23', 'Winter Break'),
('2026-12-24', 'Winter Break'),
('2026-12-25', 'Winter Break'),
('2026-12-28', 'Winter Break'),
('2026-12-29', 'Winter Break'),
('2026-12-30', 'Winter Break'),
('2026-12-31', 'Winter Break'),
('2027-01-01', 'Winter Break'),
('2027-01-02', 'Winter Break'),
('2027-01-03', 'Winter Break'),
('2027-01-18', 'MLK'),
('2027-02-15', 'Presidents Day'),
('2027-05-31', 'Memorial Day')
ON CONFLICT (holiday_date) DO NOTHING;

-- Verify the data was inserted
SELECT COUNT(*) as holiday_count FROM global_official_holidays;
SELECT COUNT(*) as academic_year_count FROM global_academic_years; 