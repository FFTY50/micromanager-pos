-- ========================================
-- PATTERN DISCOVERY TRACKING SCHEMA
-- For managing the evolution of POS parsing patterns
-- ========================================

-- Table to track discovered patterns and their analysis
CREATE TABLE IF NOT EXISTS pattern_discoveries (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    discovered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    pattern_text TEXT NOT NULL,
    normalized_pattern TEXT GENERATED ALWAYS AS (
        REGEXP_REPLACE(
            REGEXP_REPLACE(
                REGEXP_REPLACE(pattern_text, '\d+\.\d{2}', 'MONEY', 'g'),
                '\d+', 'NUM', 'g'
            ),
            '[^\w\s]', 'PUNCT', 'g'
        )
    ) STORED,
    
    -- Pattern classification
    pattern_type TEXT NOT NULL CHECK (pattern_type IN (
        'item', 'payment', 'tax', 'discount', 'total', 'subtotal',
        'void', 'refund', 'cashier', 'transaction_end', 'transaction_start',
        'tender', 'change', 'receipt', 'other'
    )),
    
    -- Parsing information
    suggested_regex TEXT,
    confidence_level TEXT DEFAULT 'low' CHECK (confidence_level IN ('low', 'medium', 'high')),
    frequency INTEGER NOT NULL DEFAULT 1,
    
    -- Implementation tracking
    status TEXT DEFAULT 'discovered' CHECK (status IN (
        'discovered', 'analyzing', 'pattern_created', 'tested', 'deployed', 'rejected'
    )),
    implemented_in_version TEXT,
    
    -- Context information
    pos_types TEXT[], -- Which POS types this pattern was seen on
    store_ids UUID[], -- Which stores reported this pattern
    device_ids TEXT[], -- Which devices reported this pattern
    
    -- Analysis notes
    developer_notes TEXT,
    analysis_notes JSONB DEFAULT '{}',
    
    -- Timestamps
    analyzed_at TIMESTAMP WITH TIME ZONE,
    implemented_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pattern_discoveries_normalized ON pattern_discoveries USING btree (normalized_pattern);
CREATE INDEX IF NOT EXISTS idx_pattern_discoveries_type_status ON pattern_discoveries USING btree (pattern_type, status);
CREATE INDEX IF NOT EXISTS idx_pattern_discoveries_frequency ON pattern_discoveries USING btree (frequency DESC);
CREATE INDEX IF NOT EXISTS idx_pattern_discoveries_discovered_at ON pattern_discoveries USING btree (discovered_at DESC);

-- Table to track parser configuration versions
CREATE TABLE IF NOT EXISTS parser_configurations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pos_type TEXT NOT NULL,
    version TEXT NOT NULL,
    configuration JSONB NOT NULL,
    patterns_added TEXT[] DEFAULT '{}',
    patterns_modified TEXT[] DEFAULT '{}',
    patterns_removed TEXT[] DEFAULT '{}',
    
    -- Deployment information
    deployed_at TIMESTAMP WITH TIME ZONE,
    deployed_by TEXT,
    deployment_notes TEXT,
    
    -- Performance metrics
    success_rate_before NUMERIC(5,2),
    success_rate_after NUMERIC(5,2),
    lines_tested INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_parser_config_pos_version ON parser_configurations (pos_type, version);

-- View for pattern discovery dashboard
CREATE OR REPLACE VIEW pattern_discovery_dashboard AS
SELECT 
    pd.id,
    pd.pattern_text,
    pd.normalized_pattern,
    pd.pattern_type,
    pd.status,
    pd.confidence_level,
    pd.frequency,
    pd.suggested_regex,
    pd.discovered_at,
    pd.analyzed_at,
    pd.implemented_at,
    
    -- Count of devices/stores reporting this pattern
    ARRAY_LENGTH(pd.device_ids, 1) as device_count,
    ARRAY_LENGTH(pd.store_ids, 1) as store_count,
    ARRAY_LENGTH(pd.pos_types, 1) as pos_type_count,
    
    -- Recent activity
    CASE 
        WHEN pd.discovered_at >= NOW() - INTERVAL '24 hours' THEN 'new'
        WHEN pd.updated_at >= NOW() - INTERVAL '7 days' THEN 'recent'
        ELSE 'older'
    END as recency,
    
    -- Priority scoring
    CASE 
        WHEN pd.frequency >= 50 AND pd.confidence_level = 'high' THEN 'critical'
        WHEN pd.frequency >= 20 OR pd.confidence_level = 'high' THEN 'high'
        WHEN pd.frequency >= 5 OR pd.confidence_level = 'medium' THEN 'medium'
        ELSE 'low'
    END as priority
    
FROM pattern_discoveries pd
WHERE pd.status != 'rejected'
ORDER BY 
    CASE 
        WHEN pd.frequency >= 50 AND pd.confidence_level = 'high' THEN 1
        WHEN pd.frequency >= 20 OR pd.confidence_level = 'high' THEN 2
        WHEN pd.frequency >= 5 OR pd.confidence_level = 'medium' THEN 3
        ELSE 4
    END,
    pd.frequency DESC,
    pd.discovered_at DESC;

-- Function to automatically discover patterns from unknown lines
CREATE OR REPLACE FUNCTION auto_discover_patterns(
    min_frequency INTEGER DEFAULT 5,
    days_back INTEGER DEFAULT 30
)
RETURNS TABLE(
    pattern_text TEXT,
    frequency BIGINT,
    suggested_type TEXT,
    confidence TEXT
) AS $$
BEGIN
    -- Insert new pattern discoveries from high-frequency unknown lines
    INSERT INTO pattern_discoveries (
        pattern_text,
        pattern_type,
        frequency,
        confidence_level,
        pos_types,
        device_ids,
        suggested_regex,
        developer_notes
    )
    SELECT DISTINCT
        tl.raw_line,
        CASE 
            WHEN tl.raw_line ~* 'total|subtotal' THEN 'total'
            WHEN tl.raw_line ~* 'tax|hst|gst|pst' THEN 'tax'
            WHEN tl.raw_line ~* 'cash|payment|tender' THEN 'payment'
            WHEN tl.raw_line ~* 'void|cancel' THEN 'void'
            WHEN tl.raw_line ~* 'refund|return' THEN 'refund'
            WHEN tl.raw_line ~* 'discount|coupon' THEN 'discount'
            WHEN tl.raw_line ~ '\$?\d+\.\d{2}' AND LENGTH(tl.raw_line) > 10 THEN 'item'
            ELSE 'other'
        END,
        COUNT(*)::INTEGER,
        CASE 
            WHEN COUNT(*) >= 50 THEN 'high'
            WHEN COUNT(*) >= 20 THEN 'medium'
            ELSE 'low'
        END,
        ARRAY[tl.cloud_system_id]::TEXT[],
        ARRAY[tl.cloud_system_id]::TEXT[],
        -- Generate basic regex suggestion
        '^' || REGEXP_REPLACE(
            REGEXP_REPLACE(tl.raw_line, '\d+\.\d{2}', '(\\d+\\.\\d{2})', 'g'),
            '\d+', '(\\d+)', 'g'
        ) || '$',
        'Auto-discovered pattern with ' || COUNT(*) || ' occurrences'
        
    FROM transaction_lines tl
    WHERE tl.line_type = 'unknown'
        AND tl.created_at >= NOW() - INTERVAL (days_back || ' days')
        AND NOT EXISTS (
            SELECT 1 FROM pattern_discoveries pd 
            WHERE pd.pattern_text = tl.raw_line
        )
    GROUP BY tl.raw_line, tl.cloud_system_id
    HAVING COUNT(*) >= min_frequency;
    
    -- Return summary of discovered patterns
    RETURN QUERY
    SELECT 
        pd.pattern_text,
        pd.frequency::BIGINT,
        pd.pattern_type,
        pd.confidence_level
    FROM pattern_discoveries pd
    WHERE pd.discovered_at >= NOW() - INTERVAL '1 hour'
    ORDER BY pd.frequency DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to update parser configuration after pattern implementation
CREATE OR REPLACE FUNCTION update_parser_config(
    p_pos_type TEXT,
    p_version TEXT,
    p_configuration JSONB,
    p_patterns_added TEXT[] DEFAULT '{}',
    p_patterns_modified TEXT[] DEFAULT '{}',
    p_patterns_removed TEXT[] DEFAULT '{}',
    p_deployment_notes TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO parser_configurations (
        pos_type,
        version,
        configuration,
        patterns_added,
        patterns_modified,
        patterns_removed,
        deployed_at,
        deployed_by,
        deployment_notes
    ) VALUES (
        p_pos_type,
        p_version,
        p_configuration,
        p_patterns_added,
        p_patterns_modified,
        p_patterns_removed,
        NOW(),
        current_user,
        p_deployment_notes
    );
    
    -- Mark related pattern discoveries as implemented
    UPDATE pattern_discoveries 
    SET status = 'deployed',
        implemented_at = NOW(),
        implemented_in_version = p_version
    WHERE pattern_text = ANY(p_patterns_added)
        AND status = 'tested';
END;
$$ LANGUAGE plpgsql;

-- Function to get dashboard statistics
CREATE OR REPLACE FUNCTION get_pattern_stats()
RETURNS TABLE(
    total_patterns BIGINT,
    critical_patterns BIGINT,
    high_patterns BIGINT,
    medium_patterns BIGINT,
    low_patterns BIGINT,
    discovered_today BIGINT,
    analyzed_patterns BIGINT,
    deployed_patterns BIGINT,
    avg_success_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_patterns,
        COUNT(*) FILTER (WHERE 
            frequency >= 50 AND confidence_level = 'high'
        )::BIGINT as critical_patterns,
        COUNT(*) FILTER (WHERE 
            frequency >= 20 OR confidence_level = 'high'
        )::BIGINT as high_patterns,
        COUNT(*) FILTER (WHERE 
            frequency >= 5 OR confidence_level = 'medium'
        )::BIGINT as medium_patterns,
        COUNT(*) FILTER (WHERE 
            frequency < 5 AND confidence_level = 'low'
        )::BIGINT as low_patterns,
        COUNT(*) FILTER (WHERE 
            discovered_at >= CURRENT_DATE
        )::BIGINT as discovered_today,
        COUNT(*) FILTER (WHERE 
            status IN ('analyzing', 'pattern_created', 'tested')
        )::BIGINT as analyzed_patterns,
        COUNT(*) FILTER (WHERE 
            status = 'deployed'
        )::BIGINT as deployed_patterns,
        (
            SELECT AVG(success_rate_after) 
            FROM parser_configurations 
            WHERE success_rate_after IS NOT NULL
        ) as avg_success_rate
    FROM pattern_discoveries;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_pattern_discoveries_updated_at
    BEFORE UPDATE ON pattern_discoveries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to mark patterns as "analyzed" to avoid re-processing
CREATE OR REPLACE FUNCTION mark_pattern_analyzed(pattern_text TEXT)
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE transaction_lines 
    SET needs_analysis = false,
        analysis_priority = 'analyzed'
    WHERE raw_line = pattern_text 
        AND line_type = 'unknown'
        AND needs_analysis = true;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to add new parsing patterns (for when patterns are identified)
CREATE OR REPLACE FUNCTION log_pattern_discovery(
    pattern_text TEXT,
    pattern_type TEXT,
    suggested_regex TEXT,
    developer_notes TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO pattern_discoveries (
        discovered_at,
        pattern_text,
        pattern_type,
        suggested_regex,
        developer_notes,
        frequency
    ) VALUES (
        NOW(),
        pattern_text,
        pattern_type,
        suggested_regex,
        developer_notes,
        (SELECT COUNT(*) FROM transaction_lines WHERE raw_line = pattern_text)
    );
END;
$$ LANGUAGE plpgsql;

-- Enable RLS on pattern discovery tables
ALTER TABLE pattern_discoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE parser_configurations ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies for pattern discovery (adjust based on your auth setup)
CREATE POLICY "Allow all operations for authenticated users" ON pattern_discoveries
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON parser_configurations
  FOR ALL USING (auth.role() = 'authenticated');

-- Example usage:
-- SELECT log_pattern_discovery(
--     'EMPLOYEE DISCOUNT 10%',
--     'discount',
--     '^EMPLOYEE DISCOUNT (\d+)%$',
--     'New employee discount pattern found on Store 001'
-- );

-- SELECT * FROM auto_discover_patterns(3, 7); -- Find patterns with 3+ occurrences in last 7 days
-- SELECT * FROM get_pattern_stats(); -- Get dashboard statistics
