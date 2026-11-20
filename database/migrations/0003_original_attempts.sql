CREATE TABLE original_attempts (id INTEGER PRIMARY KEY, student TEXT NOT NULL REFERENCES students(email), path TEXT NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL, answers TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
--> statement-breakpoint
CREATE INDEX original_attempts_student ON original_attempts(student,id);
