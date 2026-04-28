DELETE FROM whatsapp_notifications
WHERE branch_id = '81785086-36f2-4ed0-bf1d-a174089ac8d0'
  AND created_at::date = CURRENT_DATE
  AND notification_type IN ('expired_reminder','expiring_today','expiring_2days')
  AND recipient_phone IN ('917001090471','7001090471','917797571334','7797571334');