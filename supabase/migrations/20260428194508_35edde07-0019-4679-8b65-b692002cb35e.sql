UPDATE public.subscriptions
SET end_date = CURRENT_DATE,
    status = 'expiring_soon'::subscription_status,
    updated_at = NOW()
WHERE id = '7789ef5b-fd4c-4457-a3e1-a83295942b50';