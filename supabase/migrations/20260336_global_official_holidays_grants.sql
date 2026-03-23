-- Grant SELECT on global_official_holidays so backend fallback (service_role) and client (authenticated) can read
GRANT SELECT ON global_official_holidays TO service_role;
GRANT SELECT ON global_official_holidays TO authenticated;
GRANT SELECT ON global_official_holidays TO anon;
