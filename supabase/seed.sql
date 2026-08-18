-- Tùy chọn: đăng ký nhân vật Trưng Trắc trước khi tích hợp website.
insert into public.characters (slug, name_vi, name_en, active)
values ('trung-trac', 'Trưng Trắc', 'Trung Trac', true)
on conflict (slug) do update set
  name_vi = excluded.name_vi,
  name_en = excluded.name_en,
  active = true,
  updated_at = now();
