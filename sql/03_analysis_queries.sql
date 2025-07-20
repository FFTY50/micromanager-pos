-- ========================================
-- UNKNOWN LINE ANALYSIS QUERIES
-- For discovering new POS patterns and improving parsers
-- ========================================

-- 1. Find all unknown/unparsed lines with high analysis priority
SELECT 
    id,
    description,
    raw_line,
    analysis_priority,
    cloud_system_id,
    created_at,
    line_length,
    contains_currency,
    contains_numbers
FROM transaction_lines 
WHERE line_type = 'unknown' 
    AND analysis_priority = 'high'
    AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 100;

-- 2. Most common unknown line patterns (for pattern discovery)
SELECT 
    REGEXP_REPLACE(
        REGEXP_REPLACE(
            REGEXP_REPLACE(raw_line, '\d+\.\d{2}', 'MONEY', 'g'),
            '\d+', 'NUM', 'g'
        ),
        '[^\w\s]', 'PUNCT', 'g'
    ) as normalized_pattern,
    COUNT(*) as frequency,
    array_agg(DISTINCT raw_line ORDER BY raw_line LIMIT 5) as examples,
    array_agg(DISTINCT cloud_system_id) as devices
FROM transaction_lines 
WHERE line_type = 'unknown'
    AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY normalized_pattern
HAVING COUNT(*) >= 3  -- Only patterns seen 3+ times
ORDER BY frequency DESC
LIMIT 20;

-- 3. Unknown lines that contain currency amounts (high priority for parsing)
SELECT 
    raw_line,
    description,
    cloud_system_id,
    COUNT(*) as frequency,
    MIN(created_at) as first_seen,
    MAX(created_at) as last_seen
FROM transaction_lines 
WHERE line_type = 'unknown'
    AND contains_currency = true
    AND created_at >= NOW() - INTERVAL '14 days'
GROUP BY raw_line, description, cloud_system_id
ORDER BY frequency DESC, last_seen DESC
LIMIT 50;

-- 4. Parse error analysis (critical issues)
SELECT 
    error_details,
    raw_line,
    cloud_system_id,
    COUNT(*) as error_count,
    MAX(created_at) as latest_error
FROM transaction_lines 
WHERE line_type = 'parse_error'
    AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY error_details, raw_line, cloud_system_id
ORDER BY error_count DESC, latest_error DESC;

-- 5. Parsing success rate by device
SELECT 
    cloud_system_id,
    COUNT(*) as total_lines,
    COUNT(*) FILTER (WHERE parsed_successfully = true) as parsed_lines,
    COUNT(*) FILTER (WHERE line_type = 'unknown') as unknown_lines,
    COUNT(*) FILTER (WHERE line_type = 'parse_error') as error_lines,
    ROUND(
        (COUNT(*) FILTER (WHERE parsed_successfully = true)::numeric / COUNT(*)) * 100, 
        2
    ) as success_rate_percent
FROM transaction_lines 
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY cloud_system_id
ORDER BY success_rate_percent ASC;

-- 6. Time-based pattern analysis (maybe new patterns appear at certain times)
SELECT 
    EXTRACT(hour FROM created_at) as hour_of_day,
    COUNT(*) as total_lines,
    COUNT(*) FILTER (WHERE line_type = 'unknown') as unknown_lines,
    ROUND(
        (COUNT(*) FILTER (WHERE line_type = 'unknown')::numeric / COUNT(*)) * 100, 
        2
    ) as unknown_percentage
FROM transaction_lines 
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY EXTRACT(hour FROM created_at)
ORDER BY hour_of_day;

-- 7. Find potential new transaction end patterns
SELECT DISTINCT 
    raw_line,
    cloud_system_id,
    COUNT(*) as frequency
FROM transaction_lines tl1
WHERE line_type = 'unknown'
    AND created_at >= NOW() - INTERVAL '14 days'
    -- Look for lines that appear right before known transaction starts
    AND EXISTS (
        SELECT 1 FROM transaction_lines tl2 
        WHERE tl2.transaction_id != tl1.transaction_id
            AND tl2.created_at > tl1.created_at
            AND tl2.created_at <= tl1.created_at + INTERVAL '30 seconds'
            AND tl2.line_type IN ('item', 'total')
    )
GROUP BY raw_line, cloud_system_id
HAVING COUNT(*) >= 2
ORDER BY frequency DESC;

-- 8. Lines with potential item/product patterns
SELECT 
    raw_line,
    cloud_system_id,
    COUNT(*) as frequency,
    AVG(line_length) as avg_length
FROM transaction_lines 
WHERE line_type = 'unknown'
    AND contains_numbers = true
    AND line_length BETWEEN 10 AND 80  -- Reasonable item line length
    AND raw_line ~ '[A-Za-z]{3,}'      -- Contains some letters (product name)
    AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY raw_line, cloud_system_id
HAVING COUNT(*) >= 2
ORDER BY frequency DESC
LIMIT 30;

-- 9. Create a development view for easy pattern analysis
CREATE OR REPLACE VIEW unknown_patterns_analysis AS
SELECT 
    id,
    raw_line,
    description,
    cloud_system_id,
    created_at,
    analysis_priority,
    
    -- Pattern classification helpers
    CASE 
        WHEN raw_line ~ '\$?\d+\.\d{2}' THEN 'contains_money'
        WHEN raw_line ~ 'TOTAL|TAX|CASH|CREDIT' THEN 'contains_pos_keywords'
        WHEN raw_line ~ '^[A-Z\s]+\d+' THEN 'item_like_pattern'
        WHEN raw_line ~ '\d{2}[-/]\d{2}[-/]\d{2,4}' THEN 'contains_date'
        WHEN raw_line ~ '\d{1,2}:\d{2}' THEN 'contains_time'
        ELSE 'other'
    END as pattern_category,
    
    -- Normalized for grouping
    REGEXP_REPLACE(
        REGEXP_REPLACE(
            REGEXP_REPLACE(raw_line, '\d+\.\d{2}', 'MONEY', 'g'),
            '\d+', 'NUM', 'g'
        ),
        '[^\w\s]', 'PUNCT', 'g'
    ) as normalized_pattern,
    
    line_length,
    contains_currency,
    contains_numbers,
    contains_time,
    contains_date
FROM transaction_lines 
WHERE line_type IN ('unknown', 'parse_error')
    AND needs_analysis = true;

-- 10. Weekly parser improvement report
SELECT 
    DATE_TRUNC('week', created_at) as week,
    cloud_system_id,
    COUNT(*) as total_lines,
    COUNT(*) FILTER (WHERE line_type = 'unknown') as unknown_lines,
    COUNT(*) FILTER (WHERE analysis_priority = 'high') as high_priority_unknown,
    ROUND(
        (COUNT(*) FILTER (WHERE line_type = 'unknown')::numeric / COUNT(*)) * 100, 
        2
    ) as unknown_percentage
FROM transaction_lines 
WHERE created_at >= NOW() - INTERVAL '8 weeks'
GROUP BY DATE_TRUNC('week', created_at), cloud_system_id
ORDER BY week DESC, unknown_percentage DESC;

-- 11. Transaction completeness analysis
SELECT 
    t.id,
    t.cloud_system_id,
    t.start_time,
    t.total_amount,
    COUNT(tl.id) as line_count,
    COUNT(*) FILTER (WHERE tl.line_type = 'unknown') as unknown_line_count,
    COUNT(*) FILTER (WHERE tl.line_type = 'parse_error') as error_line_count,
    ROUND(
        (COUNT(*) FILTER (WHERE tl.parsed_successfully = true)::numeric / COUNT(*)) * 100,
        2
    ) as parsing_success_rate
FROM transactions t
LEFT JOIN transaction_lines tl ON t.id = tl.transaction_id
WHERE t.created_at >= NOW() - INTERVAL '7 days'
GROUP BY t.id, t.cloud_system_id, t.start_time, t.total_amount
HAVING COUNT(*) FILTER (WHERE tl.line_type = 'unknown') > 0
ORDER BY unknown_line_count DESC, t.start_time DESC;

-- 12. Real-time monitoring query for dashboard
SELECT 
    cloud_system_id,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour') as lines_last_hour,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour' AND line_type = 'unknown') as unknown_last_hour,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as lines_last_day,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND line_type = 'unknown') as unknown_last_day,
    MAX(created_at) as last_activity
FROM transaction_lines 
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY cloud_system_id
ORDER BY last_activity DESC;
