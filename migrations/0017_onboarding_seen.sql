-- 使い方の紹介を見たかを人ごとに覚える。iPhoneではSafariとホーム画面のアプリで端末の保存場所が分かれるため。
ALTER TABLE users ADD COLUMN onboarding_seen_at TEXT;
-- 紹介は以前から出ているので、今いる人は見たものとする。
UPDATE users SET onboarding_seen_at = created_at;
