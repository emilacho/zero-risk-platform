-- REVERSA de 202610311800_client_videos.sql (31-oct). Los archivos del bucket client-videos se borran aparte (no por SQL).
alter table public.client_social_images drop column if exists video_id;
drop table if exists public.client_videos;
