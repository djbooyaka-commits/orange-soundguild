CREATE POLICY "Backend can read scheduled job secrets"
ON public.scheduled_job_secrets
FOR SELECT
TO service_role
USING (true);

CREATE POLICY "Backend can manage scheduled job secrets"
ON public.scheduled_job_secrets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);