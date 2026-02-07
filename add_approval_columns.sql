-- =============================================================================
-- ADD APPROVAL COLUMNS TO TASKS TABLE
-- =============================================================================

-- Add approval tracking columns
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

-- Add comments for clarity
COMMENT ON COLUMN tasks.approved IS 'NULL = pending approval, TRUE = approved, FALSE = rejected';
COMMENT ON COLUMN tasks.approved_by IS 'User who approved/rejected the task';
COMMENT ON COLUMN tasks.approved_at IS 'Timestamp when task was approved/rejected';

-- Ensure RLS policies allow reading these columns
-- (Already covered by existing permissive policies)

SELECT 'APPROVAL_COLUMNS_ADDED' as status;
