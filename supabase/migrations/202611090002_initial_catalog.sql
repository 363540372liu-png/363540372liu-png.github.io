begin;
set local standard_conforming_strings = on;
update polar_private.posts set active = false where post_key not in ('0d2b5dcc587f8a0992dccf8cba241810128e2de467cb8edd2f23e7b91f8d286d', '8d02b1a5eb69964935b9032ccb0ad130fb6543d5c2718127f82fcbb85cf9f145', '37d829c8d5bb25fc97665b163a12f94cc3adb8987f616bd983c60d233e4abbce', 'aabb1db257f1bbb29a04b49c8001207f2f0557c3339614e72716826bb8249b2c');
insert into polar_private.posts(post_key,title,path) values
('0d2b5dcc587f8a0992dccf8cba241810128e2de467cb8edd2f23e7b91f8d286d', '忒修斯之船', '/posts/2026-11-09-ship-of-theseus/'),
('8d02b1a5eb69964935b9032ccb0ad130fb6543d5c2718127f82fcbb85cf9f145', '从辅助设计到人机协同：浅谈大模型赋能EDA的工业应用与工程师的能力转变', '/posts/2026-11-02-llm-eda-engineer/'),
('37d829c8d5bb25fc97665b163a12f94cc3adb8987f616bd983c60d233e4abbce', 'AI时代下我们必须具备的能力（1）', '/posts/2026-11-01-ai-era-essential-skills-1/'),
('aabb1db257f1bbb29a04b49c8001207f2f0557c3339614e72716826bb8249b2c', '电脑', '/posts/2026-10-30-computer/')
on conflict (post_key) do update set title = excluded.title, path = excluded.path, active = true;
commit;
