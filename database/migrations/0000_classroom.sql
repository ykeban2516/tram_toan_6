CREATE TABLE students (email TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
--> statement-breakpoint
CREATE TABLE assignments (id TEXT PRIMARY KEY NOT NULL, student TEXT NOT NULL REFERENCES students(email), title TEXT NOT NULL, topic INTEGER NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
--> statement-breakpoint
CREATE TABLE results (id INTEGER PRIMARY KEY, student TEXT NOT NULL REFERENCES students(email), assignment_id TEXT UNIQUE REFERENCES assignments(id), topic INTEGER NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
--> statement-breakpoint
CREATE TABLE messages (id INTEGER PRIMARY KEY, student TEXT NOT NULL REFERENCES students(email), role TEXT NOT NULL CHECK(role IN ('teacher','student')), body TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
--> statement-breakpoint
CREATE INDEX assignment_student ON assignments(student,created);
--> statement-breakpoint
CREATE INDEX result_student ON results(student,created);
--> statement-breakpoint
CREATE INDEX message_student ON messages(student,created);

