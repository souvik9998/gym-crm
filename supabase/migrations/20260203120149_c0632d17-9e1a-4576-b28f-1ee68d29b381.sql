-- Set up super admin role for the platform owner
-- Using gymkloud@gmail.com as the super admin account

INSERT INTO public.user_roles (user_id, role)
VALUES ('d90ebc15-7fcf-4b57-be03-5209d26c8024', 'super_admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Also grant super_admin to the original account as backup
INSERT INTO public.user_roles (user_id, role)
VALUES ('f8e44bf0-8634-4766-9113-9d7c2981bfe7', 'super_admin')
ON CONFLICT (user_id, role) DO NOTHING;