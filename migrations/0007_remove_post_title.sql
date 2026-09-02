UPDATE posts
   SET caption = substr(CASE
     WHEN length(trim(caption)) = 0 THEN title
     ELSE title || ' ' || caption
   END, 1, 2000);

ALTER TABLE posts DROP COLUMN title;
