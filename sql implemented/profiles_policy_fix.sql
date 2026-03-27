-- ============================================================
-- HRMatrix — Profiles Policy Fix (Recursion Resolver)
-- Run this in your Supabase SQL Editor to fix Login issues
-- while maintaining Admin management functionality.
-- ============================================================

-- 1. Keep your "read all" fix (This is what prevents the recursion)
DROP POLICY IF EXISTS "Profiles: read all" ON profiles;
CREATE POLICY "Profiles: read all" ON profiles 
  FOR SELECT USING (auth.role() = 'authenticated');

-- 2. Keep your "edit own" fix
DROP POLICY IF EXISTS "Profiles: update own" ON profiles;
CREATE POLICY "Profiles: update own" ON profiles 
  FOR UPDATE USING (auth.uid() = id);

-- 3. ADD THIS: This is the "New Solution" for the Admin's affected functions
-- This allows Admins to update other users again.
-- It no longer recurses because the "read all" policy above makes the subquery safe.
CREATE POLICY "Profiles: admin update others" ON profiles 
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
