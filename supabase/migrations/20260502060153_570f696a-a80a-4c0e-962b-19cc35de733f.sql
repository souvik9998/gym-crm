UPDATE public.tenant_messaging_config
SET zavu_templates = COALESCE(zavu_templates, '{}'::jsonb) || jsonb_build_object('holiday_notification', 'ks71y3zv9n6n8exrc2p8vam7dd85xpbb');