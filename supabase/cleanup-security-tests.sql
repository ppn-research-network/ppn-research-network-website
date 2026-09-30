-- Removes the rows created by `npm run test:security`.
-- Run with:  npm run test:security:cleanup
delete from public.datasets where title like '[Security test]%' and status = 'pending';
delete from public.profiles where full_name like '[Security test]%' and status = 'pending';
delete from public.contact_requests where sender_email like 'security-test+%@example.com';
