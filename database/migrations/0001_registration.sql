ALTER TABLE students ADD COLUMN phone TEXT;
--> statement-breakpoint
ALTER TABLE students ADD COLUMN pending INTEGER NOT NULL DEFAULT 0;
